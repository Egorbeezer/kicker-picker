import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { tournaments, tournamentPlayers } from '../schema.js';
import { isTournamentAdmin } from '../lib/helpers.js';

function base64ToUint8(base64) {
  const clean = String(base64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
  if (!clean) return new Uint8Array(0);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  lookup.fill(255);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }

  let padding = 0;
  if (clean.endsWith('==')) padding = 2;
  else if (clean.endsWith('=')) padding = 1;

  const len = clean.length;
  const byteLen = (len * 3) / 4 - padding;
  const out = new Uint8Array(byteLen);
  let p = 0;

  for (let i = 0; i < len; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)];
    const d = lookup[clean.charCodeAt(i + 3)];
    const n = (a << 18) | (b << 12) | ((c === 255 ? 0 : c) << 6) | (d === 255 ? 0 : d);
    if (p < byteLen) out[p++] = (n >> 16) & 255;
    if (p < byteLen && c !== 255) out[p++] = (n >> 8) & 255;
    if (p < byteLen && d !== 255) out[p++] = n & 255;
  }
  return out;
}

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация Telegram', { code: 'UNAUTHORIZED' });

  const tournamentId = Number(input?.tournamentId);
  if (!tournamentId) throw new EndpointError('Не указан турнир', { code: 'MISSING_TOURNAMENT' });

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();
  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });

  const isAdmin = isTournamentAdmin(tournament, tgUser.id);
  if (!isAdmin && !tournament.publicPath) {
    const member = await db
      .select({ id: tournamentPlayers.id })
      .from(tournamentPlayers)
      .where(
        and(
          eq(tournamentPlayers.tournamentId, tournamentId),
          eq(tournamentPlayers.tgId, tgUser.id)
        )
      )
      .get();
    if (!member) {
      throw new EndpointError('Нет доступа к экспорту этого турнира', { code: 'FORBIDDEN' });
    }
  }

  const bytes = base64ToUint8(input?.imageBase64);
  if (bytes.length < 100 || bytes.length > 5 * 1024 * 1024) {
    throw new EndpointError('Некорректное изображение таблицы', { code: 'INVALID_IMAGE' });
  }

  // Экспорт скриншота перенесён на клиент (Web Share API / буфер обмена),
  // поэтому бот больше не отправляет фото в личные сообщения пользователю.
  return { sentToPm: false, preparedMessageId: null };
}
