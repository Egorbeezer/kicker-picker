import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { tournamentPlayers, matches } from '../schema.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация', { code: 'UNAUTHORIZED' });

  const tournamentId = Number(input?.tournamentId);
  if (!tournamentId) throw new EndpointError('Не указан турнир', { code: 'MISSING_TOURNAMENT' });

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

  const hasMatches = played.some(
    (m) =>
      m.team1Player1Id === player.id ||
      m.team1Player2Id === player.id ||
      m.team2Player1Id === player.id ||
      m.team2Player2Id === player.id
  );

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

  return { ok: true, softPaused: hasMatches };
}
