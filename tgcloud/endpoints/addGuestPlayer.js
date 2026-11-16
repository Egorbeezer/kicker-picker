import { db, EndpointError } from 'sdk';
import { eq, inArray } from 'sdk/db';
import { tournaments, tournamentPlayers, clubPlayers } from '../schema.js';
import { makeInitials, getTournamentSnapshot, isTournamentAdmin } from '../lib/helpers.js';
import { syncPublicLiveIfEnabled } from '../lib/publicLive.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация', { code: 'UNAUTHORIZED' });

  const tournamentId = Number(input?.tournamentId);
  if (!Number.isInteger(tournamentId) || tournamentId <= 0) {
    throw new EndpointError('Укажите турнир', { code: 'INVALID_INPUT' });
  }

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();

  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });
  if (!isTournamentAdmin(tournament, tgUser.id)) {
    throw new EndpointError('Только организатор может добавлять игроков', { code: 'FORBIDDEN' });
  }

  const dypRole = input?.dypRole === 'A' || input?.dypRole === 'B' ? input.dypRole : null;
  const shuffle = Boolean(input?.shuffle);
  const saveToClub = Boolean(input?.saveToClub);
  const clubPlayerIds = Array.isArray(input?.clubPlayerIds)
    ? input.clubPlayerIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];

  let entries = [];
  if (clubPlayerIds.length > 0) {
    const selectedClub = await db
      .select()
      .from(clubPlayers)
      .where(inArray(clubPlayers.id, clubPlayerIds.slice(0, 64)))
      .all();
    for (const cp of selectedClub) {
      if (cp.ownerTgId === tgUser.id) {
        entries.push({
          name: String(cp.name || '').trim().slice(0, 60),
          tgId: cp.tgId ?? null,
          dypRole: cp.dypRole ?? dypRole,
        });
      }
    }
  }

  if (Array.isArray(input?.names)) {
    for (const s of input.names.slice(0, 65)) {
      const name = String(s || '').trim().slice(0, 60);
      if (name) entries.push({ name, tgId: null, dypRole });
    }
  } else if (typeof input?.names === 'string') {
    for (const s of input.names.split(/[\n,;]+/).slice(0, 65)) {
      const name = s.trim().slice(0, 60);
      if (name) entries.push({ name, tgId: null, dypRole });
    }
  } else {
    const single = String(input?.name || '').trim().slice(0, 60);
    if (single) entries.push({ name: single, tgId: null, dypRole });
  }

  if (entries.length === 0) {
    throw new EndpointError('Укажите имя игрока', { code: 'INVALID_INPUT' });
  }

  if (entries.length > 64) {
    throw new EndpointError('За один раз можно добавить не более 64 игроков', { code: 'TOO_MANY' });
  }

  if (shuffle && entries.length > 1) {
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }
  }

  const existingPlayers = await db
    .select({ sortOrder: tournamentPlayers.sortOrder, tgId: tournamentPlayers.tgId })
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, tournamentId))
    .all();
  const existingTgIds = new Set(
    existingPlayers.map((p) => Number(p.tgId)).filter((id) => Number.isInteger(id) && id > 0)
  );
  let nextSort = existingPlayers.reduce((max, p) => Math.max(max, p.sortOrder || 0), existingPlayers.length) + 1;

  for (const item of entries) {
    if (item.tgId && existingTgIds.has(Number(item.tgId))) continue;
    if (item.tgId) existingTgIds.add(Number(item.tgId));
    await db.insert(tournamentPlayers).values({
      tournamentId,
      tgId: item.tgId ?? null,
      name: item.name,
      initials: makeInitials(item.name),
      isActive: true,
      isGuest: !item.tgId,
      dypRole: item.dypRole ?? null,
      byesCount: 0,
      sortOrder: nextSort++,
      livesLeft: tournament.dypMode === 'last_one_standing' ? tournament.losLives || 3 : null,
    });
  }

  if (saveToClub && tgUser?.id) {
    const existingClub = await db
      .select()
      .from(clubPlayers)
      .where(eq(clubPlayers.ownerTgId, tgUser.id))
      .all();
    const existingNames = new Set(existingClub.map((c) => c.name.trim().toLowerCase()));
    for (const item of entries) {
      const key = item.name.trim().toLowerCase();
      if (!existingNames.has(key)) {
        existingNames.add(key);
        await db.insert(clubPlayers).values({
          ownerTgId: tgUser.id,
          name: item.name,
          tgId: item.tgId ?? null,
          dypRole: item.dypRole ?? null,
        });
      }
    }
  }

  await syncPublicLiveIfEnabled(tournamentId);

  return await getTournamentSnapshot(tournamentId, tgUser.id);
}
