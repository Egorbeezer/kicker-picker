import { db, EndpointError } from 'sdk';
import { eq, and, inArray } from 'sdk/db';
import { tournaments, matches } from '../schema.js';
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
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация', { code: 'UNAUTHORIZED' });

  const matchId = Number(input?.matchId);
  const action = String(input?.action || '');

  const match = await db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!match) throw new EndpointError('Матч не найден', { code: 'NOT_FOUND' });

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, match.tournamentId))
    .get();
  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });
  if (!isTournamentAdmin(tournament, tgUser.id)) {
    throw new EndpointError('Только организатор может управлять матчами', { code: 'FORBIDDEN' });
  }

  if (action === 'set_table') {
    const tableNumber = Number(input?.tableNumber);
    if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > tournament.tablesCount) {
      throw new EndpointError('Некорректный номер стола', { code: 'INVALID_TABLE' });
    }
    await db
      .update(matches)
      .set({ tableNumber })
      .where(eq(matches.id, match.id));
  } else if (action === 'reset') {
    await clearConfirmMessages({
      match,
      replacementText: `🔄 Организатор сбросил счёт матча (Стол ${match.tableNumber}).`,
    });
    await db
      .update(matches)
      .set({
        status: 'PLAYING',
        score1: 0,
        score2: 0,
        setsWon1: 0,
        setsWon2: 0,
        setsHistory: null,
        submittedByTeam: null,
        submittedByTgId: null,
        confirmMessages: null,
        finishedAt: null,
      })
      .where(eq(matches.id, match.id));

    if (tournament.status === 'FINISHED') {
      await db
        .update(tournaments)
        .set({
          status: match.stage === 'PLAYOFF' ? 'PLAYOFF' : 'QUALIFICATION',
          finishedAt: null,
        })
        .where(eq(tournaments.id, tournament.id));
    }
  } else if (action === 'toggle_cancel') {
    if (match.stage === 'PLAYOFF' && match.status !== 'CANCELLED') {
      throw new EndpointError('В плей-офф матч нельзя отменить — задайте или сбросьте счёт', {
        code: 'INVALID_STAGE',
      });
    }

    if (match.status === 'CANCELLED') {
      const restored = await db
        .update(matches)
        .set({
          status: 'PLAYING',
          score1: 0,
          score2: 0,
          setsWon1: 0,
          setsWon2: 0,
          setsHistory: null,
          submittedByTeam: null,
          submittedByTgId: null,
          confirmMessages: null,
          finishedAt: null,
        })
        .where(and(eq(matches.id, match.id), eq(matches.status, 'CANCELLED')))
        .returning();
      if (!Array.isArray(restored) || restored.length === 0) {
        throw new EndpointError('Матч уже восстановлен другим организатором', { code: 'CONFLICT' });
      }
    } else {
      const cancelled = await db
        .update(matches)
        .set({
          status: 'CANCELLED',
          score1: 0,
          score2: 0,
          setsWon1: 0,
          setsWon2: 0,
          setsHistory: null,
          submittedByTeam: null,
          submittedByTgId: null,
          confirmMessages: null,
          finishedAt: new Date(),
        })
        .where(and(eq(matches.id, match.id), inArray(matches.status, ['PLAYING', 'WAITING_CONFIRM'])))
        .returning();
      if (!Array.isArray(cancelled) || cancelled.length === 0) {
        throw new EndpointError('Матч уже отменён или завершён', { code: 'CONFLICT' });
      }
      await clearConfirmMessages({
        match,
        replacementText: `🚫 Организатор отменил матч (Стол ${match.tableNumber}).`,
      });

      if (
        match.stage === 'QUALIFICATION' &&
        match.roundNumber === tournament.currentRound &&
        (tournament.autoRounds || tournament.pendingPlayoff)
      ) {
        const qualRoundMatches = await db
          .select()
          .from(matches)
          .where(
            and(
              eq(matches.tournamentId, tournament.id),
              eq(matches.stage, 'QUALIFICATION'),
              eq(matches.roundNumber, match.roundNumber)
            )
          )
          .all();
        const allDone =
          qualRoundMatches.length > 0 &&
          qualRoundMatches.every((m) => m.status === 'FINISHED' || m.status === 'CANCELLED');
        if (allDone) {
          if (tournament.pendingPlayoff) {
            await createPlayoffFirstRound(tournament, { silentIfLowPlayers: true });
          } else {
            await createNextQualificationRound(tournament, { silentIfLowPlayers: true });
          }
        }
      }
    }
  } else {
    throw new EndpointError('Неизвестное действие', { code: 'INVALID_ACTION' });
  }

  await syncPublicLiveIfEnabled(tournament.id);
  return await getTournamentSnapshot(tournament.id, tgUser.id);
}
