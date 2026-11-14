import { db, EndpointError } from 'sdk';
import { eq, and, inArray, sql } from 'sdk/db';
import { tournaments, tournamentPlayers, matches } from '../schema.js';
import {
  clearConfirmMessages,
  createNextQualificationRound,
  createPlayoffFirstRound,
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
    const resetTournament = { ...tournament, currentRound: 0, lastRoundByes: null };
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
