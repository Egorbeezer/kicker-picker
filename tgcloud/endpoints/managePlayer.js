import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { tournaments, tournamentPlayers, matches } from '../schema.js';
import {
  makeInitials,
  getTournamentSnapshot,
  isTournamentAdmin,
  syncTournamentAdminIndex,
} from '../lib/helpers.js';
import { syncPublicLiveIfEnabled } from '../lib/publicLive.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация', { code: 'UNAUTHORIZED' });

  const tournamentId = Number(input?.tournamentId);
  const playerId = input?.playerId !== undefined ? Number(input.playerId) : null;
  const action = String(input?.action || '');

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();
  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });
  if (!isTournamentAdmin(tournament, tgUser.id)) {
    throw new EndpointError('Только организатор может редактировать участников', { code: 'FORBIDDEN' });
  }

  // Tournament-wide seeding shuffle / reorder actions don't require single playerId
  if (action === 'shuffle_seeding') {
    const allPlayers = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournamentId))
      .all();
    const ids = allPlayers.map((p) => p.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    for (let idx = 0; idx < ids.length; idx++) {
      await db
        .update(tournamentPlayers)
        .set({ sortOrder: idx + 1 })
        .where(eq(tournamentPlayers.id, ids[idx]));
    }
    await syncPublicLiveIfEnabled(tournamentId);
    return await getTournamentSnapshot(tournamentId, tgUser.id);
  }

  const player = playerId
    ? await db
        .select()
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.id, playerId))
        .get()
    : null;
  if (!player || player.tournamentId !== tournamentId) {
    throw new EndpointError('Игрок не найден', { code: 'NOT_FOUND' });
  }

  if (action === 'rename') {
    const nextName = String(input?.name || '').trim().slice(0, 60);
    if (!nextName) throw new EndpointError('Введите имя игрока', { code: 'INVALID_NAME' });
    await db
      .update(tournamentPlayers)
      .set({ name: nextName, initials: makeInitials(nextName) })
      .where(eq(tournamentPlayers.id, playerId));
  } else if (action === 'set_role') {
    const role = input?.dypRole === 'A' || input?.dypRole === 'B' ? input.dypRole : null;
    await db
      .update(tournamentPlayers)
      .set({ dypRole: role })
      .where(eq(tournamentPlayers.id, playerId));
  } else if (action === 'move_seeding') {
    const direction = input?.direction === 'up' ? -1 : 1;
    const allPlayers = (
      await db
        .select()
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.tournamentId, tournamentId))
        .all()
    ).sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));
    const idx = allPlayers.findIndex((p) => p.id === playerId);
    const swapIdx = idx + direction;
    if (idx >= 0 && swapIdx >= 0 && swapIdx < allPlayers.length) {
      [allPlayers[idx], allPlayers[swapIdx]] = [allPlayers[swapIdx], allPlayers[idx]];
      for (let i = 0; i < allPlayers.length; i++) {
        await db
          .update(tournamentPlayers)
          .set({ sortOrder: i + 1 })
          .where(eq(tournamentPlayers.id, allPlayers[i].id));
      }
    }
  } else if (action === 'delete_player') {
    const tMatches = await db
      .select()
      .from(matches)
      .where(eq(matches.tournamentId, tournamentId))
      .all();
    const hasPlayed = tMatches.some(
      (m) =>
        m.status !== 'CANCELLED' &&
        [m.team1Player1Id, m.team1Player2Id, m.team2Player1Id, m.team2Player2Id].includes(playerId)
    );
    if (hasPlayed) {
      throw new EndpointError(
        'Игрок уже участвовал в матчах — поставьте на паузу или используйте «Заменить»',
        { code: 'PLAYER_HAS_MATCHES' }
      );
    }
    await db.delete(tournamentPlayers).where(eq(tournamentPlayers.id, playerId));
  } else if (action === 'substitute') {
    const newName = String(input?.replacementName || '').trim().slice(0, 60);
    if (!newName) {
      throw new EndpointError('Укажите имя нового игрока для замены', { code: 'INVALID_NAME' });
    }
    const replacementTgId = input?.replacementTgId ? Number(input.replacementTgId) : null;
    const [inserted] = await db
      .insert(tournamentPlayers)
      .values({
        tournamentId,
        tgId: replacementTgId,
        name: newName,
        initials: makeInitials(newName),
        isActive: true,
        isGuest: !replacementTgId,
        dypRole: player.dypRole ?? null,
        byesCount: player.byesCount || 0,
        sortOrder: player.sortOrder ?? player.id,
        livesLeft: player.livesLeft ?? null,
      })
      .returning();

    await db
      .update(tournamentPlayers)
      .set({ isActive: false })
      .where(eq(tournamentPlayers.id, playerId));

    const openMatches = await db
      .select()
      .from(matches)
      .where(eq(matches.tournamentId, tournamentId))
      .all();
    for (const m of openMatches) {
      if (m.status === 'FINISHED' || m.status === 'CANCELLED') continue;
      const patch = {};
      if (m.team1Player1Id === playerId) patch.team1Player1Id = inserted.id;
      if (m.team1Player2Id === playerId) patch.team1Player2Id = inserted.id;
      if (m.team2Player1Id === playerId) patch.team2Player1Id = inserted.id;
      if (m.team2Player2Id === playerId) patch.team2Player2Id = inserted.id;
      if (Object.keys(patch).length > 0) {
        await db.update(matches).set(patch).where(eq(matches.id, m.id));
      }
    }
  } else if (action === 'toggle_coadmin') {
    if (Number(tournament.creatorTgId) !== Number(tgUser.id)) {
      throw new EndpointError('Только создатель турнира может назначать со-организаторов', {
        code: 'FORBIDDEN',
      });
    }
    if (!player.tgId) {
      throw new EndpointError('Со-организатором можно назначить только игрока с Telegram-аккаунтом', {
        code: 'NO_TG_ID',
      });
    }
    if (Number(player.tgId) === Number(tournament.creatorTgId)) {
      throw new EndpointError('Вы уже главный организатор турнира', { code: 'INVALID_TARGET' });
    }
    const existing = Array.isArray(tournament.coAdminTgIds) ? tournament.coAdminTgIds.map(Number) : [];
    const targetId = Number(player.tgId);
    const nextList = existing.includes(targetId)
      ? existing.filter((id) => id !== targetId)
      : [...existing, targetId];
    await db
      .update(tournaments)
      .set({ coAdminTgIds: nextList })
      .where(eq(tournaments.id, tournamentId));
    await syncTournamentAdminIndex(tournamentId, tournament.creatorTgId, nextList);
  } else {
    throw new EndpointError('Неизвестное действие', { code: 'INVALID_ACTION' });
  }

  await syncPublicLiveIfEnabled(tournamentId);
  return await getTournamentSnapshot(tournamentId, tgUser.id);
}
