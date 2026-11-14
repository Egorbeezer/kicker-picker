import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { tournaments, tournamentPlayers, matches } from '../schema.js';
import { notifyScoreConfirmation } from '../lib/helpers.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация', { code: 'UNAUTHORIZED' });

  const matchId = Number(input?.matchId);
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
  const players = await db
    .select()
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, match.tournamentId))
    .all();
  const playersById = new Map(players.map((p) => [p.id, p]));

  const sentCount = await notifyScoreConfirmation({
    tournament,
    match,
    playersById,
    submittedByTeam: match.submittedByTeam,
    score1: match.score1,
    score2: match.score2,
  });

  return { ok: true, sentCount };
}
