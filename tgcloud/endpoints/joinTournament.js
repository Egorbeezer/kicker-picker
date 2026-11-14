import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { tournaments, tournamentPlayers } from '../schema.js';
import {
  upsertUser,
  makeInitials,
  formatPlayerDisplayName,
  getTournamentSnapshot,
} from '../lib/helpers.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация Telegram', { code: 'UNAUTHORIZED' });

  await upsertUser(tgUser);

  const tournamentId = Number(input?.tournamentId);
  if (!Number.isInteger(tournamentId) || tournamentId <= 0) {
    throw new EndpointError('Не указан турнир', { code: 'MISSING_TOURNAMENT' });
  }

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();

  if (!tournament) {
    throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });
  }
  if (tournament.status === 'FINISHED' || tournament.status === 'PLAYOFF') {
    throw new EndpointError('Регистрация закрыта: турнир уже в плей-офф или завершен', {
      code: 'REGISTRATION_CLOSED',
    });
  }

  const existing = await db
    .select()
    .from(tournamentPlayers)
    .where(and(eq(tournamentPlayers.tournamentId, tournament.id), eq(tournamentPlayers.tgId, tgUser.id)))
    .get();

  if (!existing) {
    const displayName = formatPlayerDisplayName(tgUser);
    const curPlayers = await db
      .select({ id: tournamentPlayers.id, sortOrder: tournamentPlayers.sortOrder })
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournament.id))
      .all();
    const maxSort = curPlayers.reduce((m, p) => Math.max(m, p.sortOrder || 0), curPlayers.length);
    await db.insert(tournamentPlayers).values({
      tournamentId: tournament.id,
      tgId: tgUser.id,
      name: displayName,
      initials: makeInitials(displayName),
      isActive: true,
      isGuest: false,
      byesCount: 0,
      sortOrder: maxSort + 1,
      livesLeft: tournament.dypMode === 'last_one_standing' ? tournament.losLives || 3 : null,
    });
  } else if (!existing.isActive) {
    await db
      .update(tournamentPlayers)
      .set({ isActive: true })
      .where(eq(tournamentPlayers.id, existing.id));
  }

  return await getTournamentSnapshot(tournament.id, tgUser.id);
}
