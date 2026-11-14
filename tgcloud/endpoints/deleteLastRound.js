import { db, EndpointError } from 'sdk';
import { eq, and, inArray, sql } from 'sdk/db';
import { tournaments, tournamentPlayers, matches } from '../schema.js';
import { clearConfirmMessages, getTournamentSnapshot, isTournamentAdmin } from '../lib/helpers.js';
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

  const stageToDelete =
    tournament.status === 'QUALIFICATION' ? 'QUALIFICATION' : 'PLAYOFF';
  const roundToDelete = tournament.currentRound;

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

    const prevRound = Math.max(0, roundToDelete - 1);
    await db
      .update(tournaments)
      .set({
        status: prevRound === 0 ? 'REGISTRATION' : 'QUALIFICATION',
        currentRound: prevRound,
        lastRoundByes: null,
        pendingPlayoff: false,
        finishedAt: null,
        ...(prevRound === 0 ? { startedAt: null } : {}),
      })
      .where(eq(tournaments.id, tournamentId));
  } else {
    const prevPlayoffRound = roundToDelete - 1;
    if (prevPlayoffRound >= 1) {
      await db
        .update(tournaments)
        .set({
          status: 'PLAYOFF',
          currentRound: prevPlayoffRound,
          finishedAt: null,
        })
        .where(eq(tournaments.id, tournamentId));
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
      await db
        .update(tournaments)
        .set({
          status: maxQualRound > 0 ? 'QUALIFICATION' : 'REGISTRATION',
          currentRound: maxQualRound,
          pendingPlayoff: false,
          finishedAt: null,
        })
        .where(eq(tournaments.id, tournamentId));
    }
  }

  await syncPublicLiveIfEnabled(tournamentId);
  return await getTournamentSnapshot(tournamentId, tgUser.id);
}
