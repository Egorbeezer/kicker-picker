import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { tournaments, tournamentPlayers, matches } from '../schema.js';
import { isTournamentAdmin, notifyScoreConfirmation } from '../lib/helpers.js';

const REMIND_COOLDOWN_MS = 30_000;

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
  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });

  const players = await db
    .select()
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, match.tournamentId))
    .all();

  const myPlayer = players.find((p) => Number(p.tgId) === Number(tgUser.id));
  const isParticipant = Boolean(
    myPlayer &&
      [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id].includes(
        myPlayer.id
      )
  );
  if (!isTournamentAdmin(tournament, tgUser.id) && !isParticipant) {
    throw new EndpointError('Напомнить о счёте может только участник матча или организатор', {
      code: 'FORBIDDEN',
    });
  }

  const nowMs = Date.now();
  const lastMs =
    match.lastReminderAt instanceof Date
      ? match.lastReminderAt.getTime()
      : typeof match.lastReminderAt === 'number'
        ? match.lastReminderAt < 1e12
          ? match.lastReminderAt * 1000
          : match.lastReminderAt
        : 0;
  if (lastMs && nowMs - lastMs < REMIND_COOLDOWN_MS) {
    throw new EndpointError('Напоминание уже отправлено недавно — подождите 30 секунд', {
      code: 'RATE_LIMITED',
    });
  }

  await db
    .update(matches)
    .set({ lastReminderAt: new Date(nowMs) })
    .where(eq(matches.id, match.id));

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
