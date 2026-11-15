import { api, db } from 'sdk';
import { eq, inArray } from 'sdk/db';
import { users } from '../../schema.js';

export const BOT_USERNAME = 'kickerpickerbot';
export const BOT_OWNER_USERNAME = 'egor_beezer';

/**
 * Отправляет владельцу бота (@egor_beezer) уведомление об ошибке в Telegram.
 * Ищет числовой tgId в таблице users (работает после первого /start или входа в Mini App).
 * @param {object} [params]
 * @param {string} [params.source]
 * @param {string} [params.message]
 * @param {string | null} [params.stack]
 * @param {{ id?: number; username?: string; first_name?: string; last_name?: string } | null} [params.tgUser]
 * @param {string | null} [params.context]
 */
export async function notifyBotOwnerAlert({
  source = 'app',
  message = '',
  stack = null,
  tgUser = null,
  context = null,
} = {}) {
  try {
    const owner = await db
      .select({ tgId: users.tgId })
      .from(users)
      .where(inArray(users.username, [BOT_OWNER_USERNAME, 'Egor_Beezer', 'EGOR_BEEZER']))
      .get();
    if (!owner?.tgId) return false;

    const who = tgUser
      ? `${escapeHtml(formatPlayerDisplayName(tgUser))} (id: <code>${tgUser.id}</code>${
          tgUser.username ? `, @${escapeHtml(tgUser.username)}` : ''
        })`
      : 'система';
    const parts = [
      `🚨 <b>Ошибка [${escapeHtml(String(source))}]</b>`,
      `<b>От:</b> ${who}`,
      context ? `<b>Контекст:</b> <code>${escapeHtml(String(context).slice(0, 200))}</code>` : null,
      `<b>Сообщение:</b>\n<pre>${escapeHtml(String(message || 'Неизвестная ошибка').slice(0, 1200))}</pre>`,
      stack ? `<b>Стек:</b>\n<pre>${escapeHtml(String(stack).slice(0, 1500))}</pre>` : null,
    ].filter(Boolean);

    await safeSendMessage({
      chat_id: owner.tgId,
      text: parts.join('\n').slice(0, 3900),
      parse_mode: 'HTML',
      disable_notification: false,
    });
    return true;
  } catch (err) {
    console.warn('notifyBotOwnerAlert failed:', err?.message || err);
    return false;
  }
}

export function makeInitials(name) {
  const parts = String(name || 'P').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

function uint8ToBase64(bytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    result += chars[(triple >> 18) & 63];
    result += chars[(triple >> 12) & 63];
    result += i + 1 < len ? chars[(triple >> 6) & 63] : '=';
    result += i + 2 < len ? chars[triple & 63] : '=';
  }
  return result;
}

async function fetchUserAvatarDataUrl(tgId) {
  try {
    const photos = await api.getUserProfilePhotos({ user_id: tgId, limit: 1 });
    const sizes = photos?.photos?.[0];
    if (!sizes || sizes.length === 0) return '';
    // Pick smallest thumbnail (~160x160) for fast DB caching and UI rendering
    const thumb = sizes[0];
    const bytes = await api.getFileContent(thumb.file_id);
    if (!bytes || bytes.length === 0) return '';
    return `data:image/jpeg;base64,${uint8ToBase64(bytes)}`;
  } catch (err) {
    console.warn('fetchUserAvatarDataUrl failed:', err?.code, err?.description || err?.message);
    return null;
  }
}

export async function upsertUser(tgUser, { refreshAvatar = false } = {}) {
  if (!tgUser || !tgUser.id) return null;
  const firstName = tgUser.first_name || tgUser.username || `User ${tgUser.id}`;

  const existing = await db
    .select({ photoUrl: users.photoUrl })
    .from(users)
    .where(eq(users.tgId, tgUser.id))
    .get();

  let photoUrl = existing?.photoUrl ?? null;
  if (refreshAvatar || photoUrl === null) {
    const fetched = await fetchUserAvatarDataUrl(tgUser.id);
    if (fetched !== null) {
      photoUrl = fetched;
    } else if (tgUser.photo_url) {
      photoUrl = tgUser.photo_url;
    } else if (photoUrl === null) {
      photoUrl = '';
    }
  }

  await db
    .insert(users)
    .values({
      tgId: tgUser.id,
      username: tgUser.username || null,
      firstName,
      lastName: tgUser.last_name || null,
      photoUrl,
    })
    .onConflictDoUpdate({
      target: users.tgId,
      set: {
        username: tgUser.username || null,
        firstName,
        lastName: tgUser.last_name || null,
        photoUrl,
      },
    });
  return {
    ...tgUser,
    avatarUrl: photoUrl || null,
  };
}

/**
 * Единая точка входа в Telegram — только Main Mini App через t.me/<bot>?startapp=...
 * Использование прямых web_app URL в кнопках создаёт дублирующиеся копии приложения.
 * @param {string | number} [startParam='open']
 */
export function buildMainAppLink(startParam = 'open') {
  const safeParam = String(startParam ?? 'open').trim() || 'open';
  return `https://t.me/${BOT_USERNAME}?startapp=${encodeURIComponent(safeParam)}`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatPlayerDisplayName(tgUser) {
  if (!tgUser) return 'Игрок';
  const full = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (tgUser.username) return `@${tgUser.username}`;
  return `Игрок ${tgUser.id}`;
}

export async function safeSendMessage(params) {
  try {
    return await api.sendMessage(params);
  } catch (err) {
    console.warn('safeSendMessage failed:', err?.code, err?.description || err?.message);
    return null;
  }
}
