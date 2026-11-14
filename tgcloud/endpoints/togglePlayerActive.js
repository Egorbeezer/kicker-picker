import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { tournaments, tournamentPlayers } from '../schema.js';
import { getTournamentSnapshot, isTournamentAdmin } from '../lib/helpers.js';
import { syncPublicLiveIfEnabled } from '../lib/publicLive.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  const tournamentId = Number(input?.tournamentId);
  const playerId = Number(input?.playerId);

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();

  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });
  if (!isTournamentAdmin(tournament, tgUser?.id)) {
    throw new EndpointError('Только организатор может менять статус игрока', { code: 'FORBIDDEN' });
  }

  const player = await db
    .select()
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.id, playerId))
    .get();

  if (!player || player.tournamentId !== tournamentId) {
    throw new EndpointError('Игрок не найден', { code: 'NOT_FOUND' });
  }

  const updated = await db
    .update(tournamentPlayers)
    .set({ isActive: !player.isActive })
    .where(and(eq(tournamentPlayers.id, playerId), eq(tournamentPlayers.isActive, player.isActive)))
    .returning();

  if (!Array.isArray(updated) || updated.length === 0) {
    throw new EndpointError('Статус игрока уже изменён другим организатором', {
      code: 'CONFLICT',
    });
  }

  await syncPublicLiveIfEnabled(tournamentId);

  return await getTournamentSnapshot(tournamentId, tgUser.id);
}
