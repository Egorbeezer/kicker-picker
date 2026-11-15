import { db } from 'sdk';
import { eq, desc, inArray } from 'sdk/db';
import { tournaments, tournamentPlayers, tournamentAdmins, matches, clubPlayers } from '../schema.js';
import { computeLeaderboard } from '../lib/dyp.js';
import {
  upsertUser,
  computeSnapshotVersion,
  getTournamentSnapshot,
  sanitizeTournament,
  buildGlobalPlayerProfile,
  checkAndSendLongMatchReminders,
  autoFinishExpiredTournaments,
} from '../lib/helpers.js';
import { syncPublicLiveIfEnabled } from '../lib/publicLive.js';

const SQLITE_IN_CHUNK = 300;

/** Загружает строки по большому списку ID порциями, чтобы не упереться в лимит переменных SQLite. */
async function selectAllByIds(table, column, ids, extraOrder) {
  if (!ids.length) return [];
  if (ids.length <= SQLITE_IN_CHUNK) {
    const q = db.select().from(table).where(inArray(column, ids));
    return extraOrder ? await q.orderBy(extraOrder).all() : await q.all();
  }
  const chunks = [];
  for (let i = 0; i < ids.length; i += SQLITE_IN_CHUNK) {
    chunks.push(ids.slice(i, i + SQLITE_IN_CHUNK));
  }
  const results = await Promise.all(
    chunks.map((chunk) => {
      const q = db.select().from(table).where(inArray(column, chunk));
      return extraOrder ? q.orderBy(extraOrder).all() : q.all();
    })
  );
  return results.flat();
}

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) {
    return {
      tournaments: [],
      tournamentHistory: [],
      activeTournament: null,
      clubPlayers: [],
      playerProfile: null,
    };
  }

  let targetTournamentId = input?.tournamentId ? Number(input.tournamentId) : null;
  const isLightPoll = Boolean(input?.light) && Boolean(targetTournamentId);
  const clientSnapshotVersion =
    typeof input?.snapshotVersion === 'string' && input.snapshotVersion.length > 0
      ? input.snapshotVersion
      : null;

  const hydratedUser =
    isLightPoll && clientSnapshotVersion ? tgUser : (await upsertUser(tgUser)) || tgUser;

  if (isLightPoll) {
    const tObj = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, targetTournamentId))
      .get();

    let tPlayers = [];
    let tMatches = [];
    let expired = [];

    if (tObj) {
      [tPlayers, tMatches] = await Promise.all([
        db
          .select()
          .from(tournamentPlayers)
          .where(eq(tournamentPlayers.tournamentId, targetTournamentId))
          .all(),
        db
          .select()
          .from(matches)
          .where(eq(matches.tournamentId, targetTournamentId))
          .all(),
      ]);

      if (tObj.status === 'QUALIFICATION' || tObj.status === 'PLAYOFF') {
        try {
          expired = await autoFinishExpiredTournaments(
            [tObj],
            new Map([[targetTournamentId, tMatches]])
          );
          if (expired.length > 0) {
            await syncPublicLiveIfEnabled(targetTournamentId).catch(() => {});
          } else {
            await checkAndSendLongMatchReminders({
              tournament: tObj,
              players: tPlayers,
              allMatches: tMatches,
            });
          }
        } catch (err) {
          console.warn('checkAndSendLongMatchReminders error:', err?.message);
        }
      }
    }

    const currentVersion = tObj
      ? computeSnapshotVersion(tObj, tPlayers, tMatches, tgUser.id)
      : null;

    if (clientSnapshotVersion && currentVersion && clientSnapshotVersion === currentVersion && expired.length === 0) {
      return {
        user: hydratedUser,
        light: true,
        unchanged: true,
        snapshotVersion: currentVersion,
      };
    }

    const activeTournament = tObj
      ? await getTournamentSnapshot(targetTournamentId, tgUser.id, { compactAvatars: true })
      : null;

    return {
      user: hydratedUser,
      activeTournament,
      light: true,
      snapshotVersion: activeTournament?.snapshotVersion || currentVersion || undefined,
    };
  }

  // Find tournaments where user is creator, co-admin (indexed), or participant
  const [myParticipations, myAdminLinks, created] = await Promise.all([
    db
      .select({ tournamentId: tournamentPlayers.tournamentId })
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tgId, tgUser.id))
      .all(),
    db
      .select({ tournamentId: tournamentAdmins.tournamentId })
      .from(tournamentAdmins)
      .where(eq(tournamentAdmins.tgId, tgUser.id))
      .all(),
    db
      .select()
      .from(tournaments)
      .where(eq(tournaments.creatorTgId, tgUser.id))
      .orderBy(desc(tournaments.id))
      .all(),
  ]);

  const linkedIds = [
    ...new Set([
      ...myParticipations.map((p) => p.tournamentId),
      ...myAdminLinks.map((a) => a.tournamentId),
    ]),
  ];
  const joined = await selectAllByIds(tournaments, tournaments.id, linkedIds, desc(tournaments.id));

  const mergedMap = new Map();
  for (const t of [...created, ...joined]) {
    mergedMap.set(t.id, t);
  }
  const myTournaments = Array.from(mergedMap.values()).sort((a, b) => b.id - a.id);

  const myIds = myTournaments.map((t) => t.id);
  const [allPlayers, allMatches] = await Promise.all([
    selectAllByIds(tournamentPlayers, tournamentPlayers.tournamentId, myIds),
    selectAllByIds(matches, matches.tournamentId, myIds),
  ]);

  const playersByTournament = new Map();
  for (const p of allPlayers) {
    if (!playersByTournament.has(p.tournamentId)) playersByTournament.set(p.tournamentId, []);
    playersByTournament.get(p.tournamentId).push(p);
  }

  const matchesByTournament = new Map();
  for (const m of allMatches) {
    if (!matchesByTournament.has(m.tournamentId)) matchesByTournament.set(m.tournamentId, []);
    matchesByTournament.get(m.tournamentId).push(m);
  }

  const autoFinishedIds = await autoFinishExpiredTournaments(myTournaments, matchesByTournament);
  if (autoFinishedIds.length > 0) {
    await Promise.all(
      autoFinishedIds.map((id) => syncPublicLiveIfEnabled(id).catch(() => {}))
    );
  }

  const tournamentHistory = myTournaments.map((t) => {
    const clean = sanitizeTournament(t);
    const tPlayers = playersByTournament.get(t.id) || [];
    const tMatches = matchesByTournament.get(t.id) || [];
    const myPlayer = tPlayers.find((p) => p.tgId === tgUser.id) || null;
    let myStats = null;
    if (myPlayer) {
      const lb = computeLeaderboard({
        players: tPlayers,
        matches: tMatches,
        tableConfig: t.tableConfig,
      });
      const row = lb.find((r) => r.playerId === myPlayer.id);
      if (row) {
        myStats = {
          playerId: myPlayer.id,
          rank: row.rank,
          games: row.games,
          wins: row.wins,
          losses: row.losses,
          points: row.points,
          diff: row.diff,
          ppm: row.ppm,
        };
      }
    }
    return {
      ...clean,
      participantsCount: tPlayers.length,
      myStats,
    };
  });

  if (!targetTournamentId && myTournaments.length > 0) {
    targetTournamentId = myTournaments[0].id;
  }

  // Trigger long-match alert reminders (15m + 3m score reminder) on active tournament during polling
  if (targetTournamentId) {
    const tObj = mergedMap.get(targetTournamentId);
    if (tObj && (tObj.status === 'QUALIFICATION' || tObj.status === 'PLAYOFF')) {
      try {
        await checkAndSendLongMatchReminders({
          tournament: tObj,
          players: playersByTournament.get(targetTournamentId) || [],
          allMatches: matchesByTournament.get(targetTournamentId) || [],
        });
      } catch (err) {
        console.warn('checkAndSendLongMatchReminders error:', err?.message);
      }
    }
  }

  const activeTournament = targetTournamentId
    ? await getTournamentSnapshot(targetTournamentId, tgUser.id, { compactAvatars: true })
    : null;

  const savedRoster = await db
    .select()
    .from(clubPlayers)
    .where(eq(clubPlayers.ownerTgId, tgUser.id))
    .orderBy(desc(clubPlayers.id))
    .all();

  const playerProfile = buildGlobalPlayerProfile({
    callerTgId: tgUser.id,
    myTournaments,
    allPlayers,
    allMatches,
  });

  return {
    user: hydratedUser,
    tournaments: myTournaments.map(sanitizeTournament),
    tournamentHistory,
    activeTournament,
    clubPlayers: savedRoster,
    playerProfile,
  };
}
