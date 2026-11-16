import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { tournaments, tournamentPlayers, matches } from '../schema.js';
import {
  getTournamentSnapshot,
  processScoreConfirmation,
} from '../lib/helpers.js';
import { syncPublicLiveIfEnabled } from '../lib/publicLive.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация', { code: 'UNAUTHORIZED' });

  const matchId = Number(input?.matchId);
  if (input?.action !== undefined && input.action !== 'confirm' && input.action !== 'dispute') {
    throw new EndpointError('Некорректное действие', { code: 'INVALID_ACTION' });
  }
  const action = input?.action === 'dispute' ? 'dispute' : 'confirm';

  const match = await db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!match) throw new EndpointError('Матч не найден', { code: 'NOT_FOUND' });
  if (match.status !== 'WAITING_CONFIRM') {
    throw new EndpointError('Матч не ожидает подтверждения', { code: 'INVALID_STATE' });
  }

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, match.tournamentId))
    .get();
  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });
  if (tournament.status === 'FINISHED') {
    throw new EndpointError('Турнир уже завершён', { code: 'INVALID_STATE' });
  }

  const players = await db
    .select()
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, match.tournamentId))
    .all();

  await processScoreConfirmation({ tournament, match, players, tgUser, action });

  await syncPublicLiveIfEnabled(tournament.id);
  return await getTournamentSnapshot(tournament.id, tgUser.id);
}
