import { db, EndpointError } from 'sdk';
import { eq, desc } from 'sdk/db';
import { clubPlayers } from '../schema.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация', { code: 'UNAUTHORIZED' });

  const action = String(input?.action || 'list');

  if (action === 'add') {
    const name = String(input?.name || '').trim().slice(0, 60);
    if (!name) throw new EndpointError('Введите имя игрока', { code: 'INVALID_NAME' });
    const dypRole = input?.dypRole === 'A' || input?.dypRole === 'B' ? input.dypRole : null;
    const playerTgId = input?.tgId ? Number(input.tgId) : null;

    const existing = await db
      .select()
      .from(clubPlayers)
      .where(eq(clubPlayers.ownerTgId, tgUser.id))
      .all();

    const duplicate = existing.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    if (!duplicate) {
      await db.insert(clubPlayers).values({
        ownerTgId: tgUser.id,
        name,
        tgId: playerTgId,
        dypRole,
      });
    }
  } else if (action === 'delete') {
    const id = Number(input?.id);
    const existing = await db
      .select()
      .from(clubPlayers)
      .where(eq(clubPlayers.id, id))
      .get();
    if (!existing || existing.ownerTgId !== tgUser.id) {
      throw new EndpointError('Игрок клуба не найден', { code: 'NOT_FOUND' });
    }
    await db.delete(clubPlayers).where(eq(clubPlayers.id, id));
  }

  const list = await db
    .select()
    .from(clubPlayers)
    .where(eq(clubPlayers.ownerTgId, tgUser.id))
    .orderBy(desc(clubPlayers.id))
    .all();

  return { clubPlayers: list };
}
