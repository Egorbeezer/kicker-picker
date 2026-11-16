import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { tournaments, tournamentPlayers, matches } from '../schema.js';
import { syncPublicLiveIfEnabled } from '../lib/publicLive.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация', { code: 'UNAUTHORIZED' });

  const tournamentId = Number(input?.tournamentId);
  if (!tournamentId) throw new EndpointError('Не указан турнир', { code: 'MISSING_TOURNAMENT' });

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();
  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });
  if (tournament.status === 'PLAYOFF' || tournament.status === 'FINISHED') {
    throw new EndpointError('Нельзя покинуть турнир после начала плей-офф или завершения', {
      code: 'INVALID_STATE',
    });
  }

  const player = await db
    .select()
    .from(tournamentPlayers)
    .where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.tgId, tgUser.id)))
    .get();

  if (!player) throw new EndpointError('Вы не участвуете в этом турнире', { code: 'NOT_FOUND' });

  const played = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId))
    .all();

  const playerMatches = played.filter(
    (m) =>
      m.team1Player1Id === player.id ||
      m.team1Player2Id === player.id ||
      m.team2Player1Id === player.id ||
      m.team2Player2Id === player.id
  );

  const hasActiveMatch = playerMatches.some(
    (m) => m.status !== 'FINISHED' && m.status !== 'CANCELLED'
  );
  if (hasActiveMatch) {
    throw new EndpointError('Сначала завершите текущий матч, прежде чем покинуть турнир', {
      code: 'MATCH_IN_PROGRESS',
    });
  }

  const hasMatches = playerMatches.length > 0;

  if (hasMatches) {
    // Отвязываем игрока от турнира (tgId = null), чтобы исторические матчи остались целы,
    // а участник реально вышел из турнира и потерял личный прогресс в нём.
    await db
      .update(tournamentPlayers)
      .set({ tgId: null, isActive: false, isGuest: true })
      .where(eq(tournamentPlayers.id, player.id));
  } else {
    await db.delete(tournamentPlayers).where(eq(tournamentPlayers.id, player.id));
  }

  await syncPublicLiveIfEnabled(tournamentId);
  return { ok: true, softPaused: hasMatches };
}
