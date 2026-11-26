import { api, EndpointError } from 'sdk';
import { BOT_USERNAME, escapeHtml } from '../lib/helpers/telegram.js';

export default async function (input, ctx) {
  const callerTgId = Number(ctx?.initData?.user?.id);
  if (!Number.isFinite(callerTgId) || callerTgId <= 0) {
    throw new EndpointError('Необходима авторизация Telegram', { code: 'UNAUTHORIZED' });
  }

  const kind = input?.kind;
  const cleanName = String(input?.name || '').trim().slice(0, 120);
  const url = String(input?.url || '').trim();

  const validKind = kind === 'live' || kind === 'invite';
  const validUrl =
    (kind === 'live' && url.startsWith('https://live.djbeezer.su/')) ||
    (kind === 'invite' && url.startsWith(`https://t.me/${BOT_USERNAME}`));

  if (!validKind || !cleanName || !validUrl) {
    return { id: null, fallback: true, reason: 'invalid_params' };
  }

  const title =
    kind === 'live'
      ? `📺 Live-трансляция турнира «${cleanName}»`
      : `⚽ Приглашение в турнир «${cleanName}»`;

  const messageText =
    kind === 'live'
      ? `📺 <b>Live-трансляция турнира «${escapeHtml(cleanName)}»</b>\n\n<a href="${escapeHtml(url)}">Открыть таблицу онлайн →</a>`
      : `⚽ <b>Приглашение в турнир «${escapeHtml(cleanName)}»</b>\n\n<a href="${escapeHtml(url)}">Присоединиться к турниру →</a>`;

  const buttonText =
    kind === 'live' ? '📺 Открыть Live-таблицу' : '⚽ Присоединиться к турниру';

  try {
    const prepared = await api.savePreparedInlineMessage({
      user_id: callerTgId,
      result: {
        type: 'article',
        id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        input_message_content: {
          message_text: messageText,
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        },
        reply_markup: {
          inline_keyboard: [[{ text: buttonText, url }]],
        },
      },
      allow_user_chats: true,
      allow_bot_chats: true,
      allow_group_chats: true,
      allow_channel_chats: true,
    });

    return { id: prepared?.id || null };
  } catch (err) {
    console.warn('prepareShareMessage failed:', err?.description || err?.message || err);
    return {
      id: null,
      fallback: true,
      reason: err?.description || err?.message || 'unavailable',
    };
  }
}
