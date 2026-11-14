import { db } from 'sdk';
import { eq, desc, inArray } from 'sdk/db';
import { tournaments, tournamentPlayers, tournamentAdmins, matches, clubPlayers } from '../schema.js';
import { computeLeaderboard } from '../lib/dyp.js';
import {
  upsertUser,
  getTournamentSnapshot,
  sanitizeTournament,
  buildGlobalPlayerProfile,
  checkAndSendLongMatchReminders,
  autoFinishExpiredTournaments,
} from '../lib/helpers.js';
import { syncPublicLiveIfEnabled } from '../lib/publicLive.js';

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

  await upsertUser(tgUser);

  let targetTournamentId = input?.tournamentId ? Number(input.tournamentId) : null;
  const isLightPoll = Boolean(input?.light) && Boolean(targetTournamentId);

  if (isLightPoll) {
    const tObj = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, targetTournamentId))
      .get();

    if (tObj && (tObj.status === 'QUALIFICATION' || tObj.status === 'PLAYOFF')) {
      try {
        const [tPlayers, tMatches] = await Promise.all([
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
        const expired = await autoFinishExpiredTournaments(
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

    const activeTournament = tObj
      ? await getTournamentSnapshot(targetTournamentId, tgUser.id)
      : null;

    return {
      user: tgUser,
      activeTournament,
      light: true,
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
  const joined = linkedIds.length
    ? await db
        .select()
        .from(tournaments)
        .where(inArray(tournaments.id, linkedIds))
        .orderBy(desc(tournaments.id))
        .all()
    : [];

  const mergedMap = new Map();
  for (const t of [...created, ...joined]) {
    mergedMap.set(t.id, t);
  }
  const myTournaments = Array.from(mergedMap.values()).sort((a, b) => b.id - a.id);

  const myIds = myTournaments.map((t) => t.id);
  const allPlayers = myIds.length
    ? await db
        .select()
        .from(tournamentPlayers)
        .where(inArray(tournamentPlayers.tournamentId, myIds))
        .all()
    : [];
  const allMatches = myIds.length
    ? await db
        .select()
        .from(matches)
        .where(inArray(matches.tournamentId, myIds))
        .all()
    : [];

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
    ? await getTournamentSnapshot(targetTournamentId, tgUser.id)
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
    user: tgUser,
    tournaments: myTournaments.map(sanitizeTournament),
    tournamentHistory,
    activeTournament,
    clubPlayers: savedRoster,
    playerProfile,
  };
}
