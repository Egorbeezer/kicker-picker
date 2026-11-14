import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { tournaments, tournamentPlayers } from '../schema.js';
import {
  escapeHtml,
  getTournamentSnapshot,
  safeSendMessage,
  syncTournamentAdminIndex,
} from '../lib/helpers.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  const tournamentId = Number(input?.tournamentId);
  const targetPlayerId = Number(input?.playerId);

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();

  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });
  if (tournament.creatorTgId !== tgUser?.id) {
    throw new EndpointError('Только текущий организатор может передать права', { code: 'FORBIDDEN' });
  }

  const targetPlayer = await db
    .select()
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.id, targetPlayerId))
    .get();

  if (!targetPlayer || targetPlayer.tournamentId !== tournamentId) {
    throw new EndpointError('Участник не найден', { code: 'NOT_FOUND' });
  }
  if (!targetPlayer.tgId) {
    throw new EndpointError('Нельзя передать права гостю без Telegram-аккаунта', {
      code: 'GUEST_CANNOT_BE_ADMIN',
    });
  }

  const nextCoAdmins = Array.isArray(tournament.coAdminTgIds)
    ? tournament.coAdminTgIds.map(Number).filter((id) => id !== Number(targetPlayer.tgId))
    : [];

  await db
    .update(tournaments)
    .set({ creatorTgId: targetPlayer.tgId, coAdminTgIds: nextCoAdmins })
    .where(eq(tournaments.id, tournamentId));
  await syncTournamentAdminIndex(tournamentId, targetPlayer.tgId, nextCoAdmins);

  await safeSendMessage({
    chat_id: targetPlayer.tgId,
    text: `👑 Вам переданы права организатора турнира <b>«${escapeHtml(tournament.name)}»</b>!`,
    parse_mode: 'HTML',
  });

  return await getTournamentSnapshot(tournamentId, tgUser.id);
}
