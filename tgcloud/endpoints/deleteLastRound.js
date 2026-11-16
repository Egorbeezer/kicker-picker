import { db, EndpointError } from 'sdk';
import { eq, and, inArray, sql } from 'sdk/db';
import { tournaments, tournamentPlayers, matches } from '../schema.js';
import {
  adjustLosLivesForMatch,
  clearConfirmMessages,
  getTournamentSnapshot,
  isTournamentAdmin,
} from '../lib/helpers.js';
import { syncPublicLiveIfEnabled } from '../lib/publicLive.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация', { code: 'UNAUTHORIZED' });

  const tournamentId = Number(input?.tournamentId);
  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();

  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });
  if (!isTournamentAdmin(tournament, tgUser.id)) {
    throw new EndpointError('Только организатор может удалять раунд', { code: 'FORBIDDEN' });
  }

  if (tournament.status === 'REGISTRATION' || tournament.currentRound <= 0) {
    throw new EndpointError('Нет активного раунда для удаления', { code: 'INVALID_STATE' });
  }

  let stageToDelete;
  if (tournament.status === 'QUALIFICATION') {
    stageToDelete = 'QUALIFICATION';
  } else if (tournament.status === 'PLAYOFF') {
    stageToDelete = 'PLAYOFF';
  } else {
    const playoffMatch = await db
      .select({ id: matches.id })
      .from(matches)
      .where(and(eq(matches.tournamentId, tournamentId), eq(matches.stage, 'PLAYOFF')))
      .get();
    stageToDelete = playoffMatch ? 'PLAYOFF' : 'QUALIFICATION';
  }
  const roundToDelete = tournament.currentRound;

  let nextStatusAfterDelete;
  let nextRoundAfterDelete;
  let nextStartedAt = tournament.startedAt;

  if (stageToDelete === 'QUALIFICATION') {
    nextRoundAfterDelete = Math.max(0, roundToDelete - 1);
    nextStatusAfterDelete = nextRoundAfterDelete === 0 ? 'REGISTRATION' : 'QUALIFICATION';
    if (nextRoundAfterDelete === 0) nextStartedAt = null;
  } else {
    const prevPlayoffRound = roundToDelete - 1;
    if (prevPlayoffRound >= 1) {
      nextStatusAfterDelete = 'PLAYOFF';
      nextRoundAfterDelete = prevPlayoffRound;
    } else {
      const qualMatches = await db
        .select({ roundNumber: matches.roundNumber })
        .from(matches)
        .where(
          and(
            eq(matches.tournamentId, tournamentId),
            eq(matches.stage, 'QUALIFICATION')
          )
        )
        .all();
      const maxQualRound = qualMatches.reduce(
        (max, m) => Math.max(max, Number(m.roundNumber) || 0),
        0
      );
      nextStatusAfterDelete = maxQualRound > 0 ? 'QUALIFICATION' : 'REGISTRATION';
      nextRoundAfterDelete = maxQualRound;
    }
  }

  // Claim round rollback atomically before deleting matches to avoid double-delete races
  const claimedRollback = await db
    .update(tournaments)
    .set({
      status: nextStatusAfterDelete,
      currentRound: nextRoundAfterDelete,
      ...(stageToDelete === 'QUALIFICATION' ? { lastRoundByes: null, pendingPlayoff: false } : {}),
      ...(stageToDelete === 'PLAYOFF' && roundToDelete <= 1 ? { pendingPlayoff: false } : {}),
      finishedAt: null,
      ...(stageToDelete === 'QUALIFICATION' && nextRoundAfterDelete === 0 ? { startedAt: nextStartedAt } : {}),
    })
    .where(
      and(
        eq(tournaments.id, tournamentId),
        eq(tournaments.status, tournament.status),
        eq(tournaments.currentRound, roundToDelete)
      )
    )
    .returning();

  if (!Array.isArray(claimedRollback) || claimedRollback.length === 0) {
    throw new EndpointError('Раунд уже удалён или изменён другим организатором', {
      code: 'CONFLICT',
    });
  }

  const targetMatches = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.tournamentId, tournamentId),
        eq(matches.stage, stageToDelete),
        eq(matches.roundNumber, roundToDelete)
      )
    )
    .all();

  for (const m of targetMatches) {
    if (stageToDelete === 'QUALIFICATION' && m.status === 'FINISHED') {
      const winnerTeam = m.setsWon1 > m.setsWon2 || (m.setsWon1 === m.setsWon2 && m.score1 > m.score2) ? 1 : 2;
      await adjustLosLivesForMatch({ tournament, match: m, winnerTeam, delta: 1 });
    }
    await clearConfirmMessages({
      match: m,
      replacementText: '🗑 Организатор отменил и удалил текущий раунд.',
    });
  }

  if (targetMatches.length > 0) {
    await db
      .delete(matches)
      .where(inArray(matches.id, targetMatches.map((m) => m.id)));
  }

  if (stageToDelete === 'QUALIFICATION') {
    const prevByes = Array.isArray(tournament.lastRoundByes) ? tournament.lastRoundByes : [];
    if (prevByes.length > 0) {
      await db
        .update(tournamentPlayers)
        .set({ byesCount: sql`MAX(0, ${tournamentPlayers.byesCount} - 1)` })
        .where(inArray(tournamentPlayers.id, prevByes));
    }
  }

  await syncPublicLiveIfEnabled(tournamentId);
  return await getTournamentSnapshot(tournamentId, tgUser.id);
}
