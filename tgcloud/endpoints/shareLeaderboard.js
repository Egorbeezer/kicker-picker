import { db, api, InputFile, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { tournaments, tournamentPlayers } from '../schema.js';
import { escapeHtml, isTournamentAdmin } from '../lib/helpers.js';

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

  const kind =
    input?.kind === 'podium'
      ? 'podium'
      : input?.kind === 'playoff'
        ? 'playoff'
        : 'standings';
  const stageLabel =
    kind === 'podium'
      ? 'Победители и призёры турнира'
      : kind === 'playoff'
        ? 'Сетка плей-офф'
        : tournament.status === 'FINISHED'
          ? 'Итоги турнира'
          : tournament.status === 'PLAYOFF'
            ? `Плей-офф • Раунд ${tournament.currentRound}`
            : tournament.status === 'QUALIFICATION'
              ? `Квалификация • Раунд ${tournament.currentRound}`
              : 'Регистрация';

  const caption =
    kind === 'podium'
      ? `🏆 <b>${escapeHtml(tournament.name)}</b>\n🥇 ${escapeHtml(stageLabel)}`
      : kind === 'playoff'
        ? `🏆 <b>${escapeHtml(tournament.name)}</b>\n⚔️ ${escapeHtml(stageLabel)}`
        : `🏆 <b>${escapeHtml(tournament.name)}</b>\n📊 ${escapeHtml(stageLabel)}`;

  const prepareOnly = Boolean(input?.prepareOnly);
  const filePrefix = kind === 'podium' ? 'podium' : kind === 'playoff' ? 'playoff' : 'table';
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const filename = `${filePrefix}-${tournamentId}.${isJpeg ? 'jpg' : 'png'}`;
  const mimeType = isJpeg ? 'image/jpeg' : 'image/png';

  try {
    const sent = await api.sendPhoto({
      chat_id: tgUser.id,
      photo: new InputFile(bytes, filename, { type: mimeType }),
      caption,
      parse_mode: 'HTML',
      disable_notification: true,
    });

    const photos = Array.isArray(sent?.photo) ? sent.photo : [];
    const fileId = photos.length ? photos[photos.length - 1].file_id : null;

    let preparedMessageId = null;
    if (fileId) {
      try {
        const prepared = await api.savePreparedInlineMessage({
          user_id: tgUser.id,
          result: {
            type: 'photo',
            id: `${kind}-${tournamentId}-${Date.now()}`,
            photo_file_id: fileId,
            title: tournament.name,
            caption: `🏆 ${tournament.name} — ${stageLabel}`,
          },
          allow_user_chats: true,
          allow_group_chats: true,
          allow_channel_chats: true,
        });
        preparedMessageId = prepared?.id || null;
      } catch (prepErr) {
        console.warn('savePreparedInlineMessage skipped:', prepErr?.description || prepErr?.message);
      }
    }

    // При фоновой подготовке (prepareOnly) всегда удаляем временное фото;
    // при явном нажатии «Поделиться» оставляем фото в ЛС, если inline-подготовка не сработала.
    let sentToPm = !prepareOnly && Boolean(sent?.message_id);
    if ((preparedMessageId || prepareOnly) && sent?.message_id) {
      try {
        await api.deleteMessage({
          chat_id: tgUser.id,
          message_id: sent.message_id,
        });
        sentToPm = false;
      } catch (delErr) {
        console.warn('deleteMessage after share skipped:', delErr?.description || delErr?.message);
        sentToPm = !prepareOnly;
      }
    }

    return { sentToPm, preparedMessageId };
  } catch (err) {
    console.warn('shareLeaderboard sendPhoto failed:', err?.code, err?.description || err?.message);
    return { sentToPm: false, preparedMessageId: null };
  }
}
