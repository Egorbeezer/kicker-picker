import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
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

  await db
    .update(tournamentPlayers)
    .set({ isActive: !player.isActive })
    .where(eq(tournamentPlayers.id, playerId));

  await syncPublicLiveIfEnabled(tournamentId);

  return await getTournamentSnapshot(tournamentId, tgUser.id);
}
