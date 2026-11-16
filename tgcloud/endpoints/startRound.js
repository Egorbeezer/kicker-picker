import { db, EndpointError } from 'sdk';
import { eq, and, inArray, sql } from 'sdk/db';
import { tournaments, tournamentPlayers, matches } from '../schema.js';
import { generateDypRound } from '../lib/dyp.js';
import {
  VALID_DYP_MODES,
  clearConfirmMessages,
  createNextQualificationRound,
  createPlayoffFirstRound,
  getActiveTablesList,
  getTournamentSnapshot,
  isTournamentAdmin,
} from '../lib/helpers.js';
import { syncPublicLiveIfEnabled } from '../lib/publicLive.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  const tournamentId = Number(input?.tournamentId);
  const preserveOrder = Boolean(input?.preserveOrder);
  const regenerateFirst = Boolean(input?.regenerateFirst);

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();

  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });
  if (!isTournamentAdmin(tournament, tgUser?.id)) {
    throw new EndpointError('Только организатор может запускать раунд', { code: 'FORBIDDEN' });
  }
  if (tournament.status === 'PLAYOFF' || tournament.status === 'FINISHED') {
    throw new EndpointError('Квалификация уже завершена', { code: 'INVALID_STATE' });
  }

  if (tournament.skipQualification || tournament.dypMode === 'elimination') {
    await createPlayoffFirstRound(tournament);
    await syncPublicLiveIfEnabled(tournamentId);
    return await getTournamentSnapshot(tournamentId, tgUser.id);
  }

  if (regenerateFirst && tournament.status === 'QUALIFICATION' && tournament.currentRound === 1) {
    const r1Matches = await db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          eq(matches.stage, 'QUALIFICATION'),
          eq(matches.roundNumber, 1)
        )
      )
      .all();
    if (r1Matches.some((m) => m.status === 'FINISHED')) {
      throw new EndpointError('Первый раунд нельзя перегенерировать — уже есть сыгранные матчи', {
        code: 'ROUND_IN_PROGRESS',
      });
    }

    // Проверяем возможность перегенерации до удаления матчей и сброса currentRound
    const allPlayers = (
      await db
        .select()
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.tournamentId, tournamentId))
        .all()
    ).sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));
    const prevByesSet = new Set(Array.isArray(tournament.lastRoundByes) ? tournament.lastRoundByes : []);
    const dryPlayers = allPlayers.map((p) =>
      prevByesSet.has(p.id) ? { ...p, byesCount: Math.max(0, (p.byesCount || 0) - 1) } : p
    );
    try {
      const dryGen = generateDypRound({
        players: dryPlayers,
        previousMatches: [],
        tablesCount: tournament.tablesCount,
        activeTables: getActiveTablesList(tournament),
        dypMode: VALID_DYP_MODES.includes(tournament.dypMode) ? tournament.dypMode : 'monster',
        teamFormat: tournament.teamFormat === 'single' ? 'single' : 'pairs',
        roundRobinLoops: Number(tournament.roundRobinLoops) || 1,
        roundNumber: 1,
        losLives: Number(tournament.losLives) || 3,
        useBuckets: Boolean(tournament.useBuckets),
        preserveOrder,
      });
      if (dryGen?.done) {
        throw new Error('Для генерации раунда недостаточно активных игроков');
      }
    } catch (err) {
      throw new EndpointError(err?.message || 'Не удалось перегенерировать первый раунд', {
        code: 'CANNOT_GENERATE_ROUND',
      });
    }

    // Атомарно забираем право перегенерации до удаления матчей и декремента баев
    const claimedReset = await db
      .update(tournaments)
      .set({ currentRound: 0, lastRoundByes: null })
      .where(
        and(
          eq(tournaments.id, tournamentId),
          eq(tournaments.status, 'QUALIFICATION'),
          eq(tournaments.currentRound, 1)
        )
      )
      .returning();

    if (!Array.isArray(claimedReset) || claimedReset.length === 0) {
      throw new EndpointError('Первый раунд уже перегенерируется или изменён', {
        code: 'CONFLICT',
      });
    }

    for (const m of r1Matches) {
      await clearConfirmMessages({ match: m, onlyRemoveButtons: true });
    }
    if (r1Matches.length > 0) {
      await db.delete(matches).where(inArray(matches.id, r1Matches.map((m) => m.id)));
    }
    const prevByes = Array.isArray(tournament.lastRoundByes) ? tournament.lastRoundByes : [];
    if (prevByes.length > 0) {
      await db
        .update(tournamentPlayers)
        .set({ byesCount: sql`MAX(0, ${tournamentPlayers.byesCount} - 1)` })
        .where(inArray(tournamentPlayers.id, prevByes));
    }
    const resetTournament = { ...claimedReset[0], currentRound: 0, lastRoundByes: null };
    await createNextQualificationRound(resetTournament, {
      preserveOrder,
      targetRoundNumber: 1,
    });
    await syncPublicLiveIfEnabled(tournamentId);
    return await getTournamentSnapshot(tournamentId, tgUser.id);
  }

  if (tournament.currentRound > 0) {
    const activeMatches = await db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          eq(matches.stage, 'QUALIFICATION'),
          eq(matches.roundNumber, tournament.currentRound)
        )
      )
      .all();

    if (activeMatches.some((m) => m.status !== 'FINISHED' && m.status !== 'CANCELLED')) {
      throw new EndpointError('Сначала завершите все матчи текущего раунда', {
        code: 'ROUND_IN_PROGRESS',
      });
    }
  }

  await createNextQualificationRound(tournament, { preserveOrder });
  await syncPublicLiveIfEnabled(tournamentId);

  return await getTournamentSnapshot(tournamentId, tgUser.id);
}
