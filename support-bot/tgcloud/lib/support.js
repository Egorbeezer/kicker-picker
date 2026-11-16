import { api, db } from 'sdk';
import { desc, eq, gt } from 'sdk/db';
import {
  supportConfig,
  supportDialogs,
  supportMessages,
  supportTargets,
} from '../schema.js';

export const ADMIN_CONFIG_KEY = 'admin_chat_id';
export const SUPPORT_OWNER_USERNAMES = ['egor_beezer'];
export const TARGET_FRESH_MS = 15 * 60_000;
export const DIALOGS_WINDOW_MS = 24 * 60 * 60_000;
const ANSWER_PREFIX = 'answer:';

export const USER_HELLO =
  'Здравствуйте! Это поддержка «кикер пикер». Напишите здесь или отправьте скриншот, файл, голосовое или видео — ответим в этом же чате.';

export const USER_ACK =
  'Спасибо, получили. Ответ придёт сюда же, можно писать или присылать файлы ещё.';

export const ADMIN_HELLO =
  'Здесь письма пользователей «кикер пикер». Ответьте (reply) на письмо — ответ (текст, фото, голосовое или файл) уйдёт человеку от лица бота.\nЕсли отвечаете не реплаем, выберите человека кнопкой: дальше сообщения пойдут ему.';

export const NO_DIALOGS =
  'Пока никто не писал. Как только напишут, письма будут приходить сюда.';

export const UNKNOWN_REPLY =
  'Не нашёл, кому это письмо: возможно, оно отправлено давно. Выберите человека кнопкой ниже.';

export const LIST_HEADER =
  'Кому ответить? Выберите человека: следующее сообщение уйдёт ему.';

export const NO_ADMIN_YET =
  'Администратор поддержки ещё не привязан. Владелец должен один раз отправить боту команду /setadmin.';

export function sentTo(name) {
  return `Отправлено ${name}. Можно писать дальше.`;
}

export function answering(name) {
  return `Отвечаете ${name}. Напишите или отправьте файл — сообщение уйдёт человеку.`;
}

export function failedToUser(reason) {
  return `Отправить не получилось: ${reason}. Попробуйте ещё раз через минуту.`;
}

export function couldNotReach(name) {
  return `«${name}»: отправить не получилось. Похоже, человек удалил переписку с ботом или ещё её не открывал — отсюда ответа он не увидит. Выберите, кому ответить:`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function displayName(from) {
  const parts = [from?.first_name, from?.last_name]
    .filter((p) => typeof p === 'string' && p.trim().length > 0)
    .map((p) => p.trim());
  return parts.join(' ').trim() || 'без имени';
}

export function dialogInfo(message) {
  const chatId = message?.chat?.id;
  if (chatId === undefined || chatId === null) return null;
  const id = message?.from?.id;
  return {
    chatId: String(chatId),
    telegramId: id === undefined || id === null ? null : String(id),
    name: displayName(message?.from),
    username: message?.from?.username ? String(message.from.username) : null,
  };
}

export function dialogHeader(user, first) {
  const who = user.username
    ? `${escapeHtml(user.name)} (@${escapeHtml(user.username)})`
    : escapeHtml(user.name);
  const hint = first ? '\nОтветьте на это письмо — ответ уйдёт человеку.' : '';
  return `📨 ${who}${hint}`;
}

export function withHeader(header, text) {
  const trimmed = String(text ?? '').trim();
  const body = trimmed ? `\n\n${escapeHtml(trimmed)}` : '';
  return `${header}${body}`;
}

const ATTACHMENTS = [
  { field: 'photo', word: 'фото', supportsCaption: true },
  { field: 'video', word: 'видео', supportsCaption: true },
  { field: 'video_note', word: 'кружок', supportsCaption: false },
  { field: 'voice', word: 'голосовое', supportsCaption: true },
  { field: 'audio', word: 'аудио', supportsCaption: true },
  { field: 'document', word: 'файл', supportsCaption: true },
  { field: 'sticker', word: 'стикер', supportsCaption: false },
  { field: 'animation', word: 'гифка', supportsCaption: true },
  { field: 'location', word: 'место на карте', supportsCaption: false },
  { field: 'contact', word: 'контакт', supportsCaption: false },
];

export function detectAttachment(message) {
  if (!message || typeof message !== 'object') return null;
  return ATTACHMENTS.find(({ field }) => message[field] !== undefined && message[field] !== null) || null;
}

export function attachmentWord(message) {
  return detectAttachment(message)?.word ?? null;
}

export function fallbackText(user, message) {
  const attachment = attachmentWord(message);
  const text = String(message?.text ?? message?.caption ?? '').trim();
  const parts = [
    `📨 ${user.username ? `${escapeHtml(user.name)} (@${escapeHtml(user.username)})` : escapeHtml(user.name)}`,
  ];
  if (text) parts.push(escapeHtml(text));
  if (attachment) parts.push(`(во вложении было: ${attachment})`);
  return parts.join('\n');
}

export function answerData(chatId) {
  return `${ANSWER_PREFIX}${chatId}`;
}

export function parseAnswerData(data) {
  const value = String(data ?? '');
  if (!value.startsWith(ANSWER_PREFIX)) return null;
  const chatId = value.slice(ANSWER_PREFIX.length).trim();
  return /^-?[0-9]{1,20}$/.test(chatId) ? chatId : null;
}

export function answerKeyboard(dialogs) {
  return {
    inline_keyboard: dialogs.map((d) => [
      {
        text: (d.userName || '').trim().slice(0, 40) || 'без имени',
        callback_data: answerData(d.userChatId),
      },
    ]),
  };
}

export function replyFailureKind(errorCode, description) {
  const text = String(description || '').toLowerCase();
  if (Number(errorCode) === 403) return 'gone';
  if (text.includes('chat not found')) return 'gone';
  if (text.includes("can't initiate")) return 'gone';
  if (text.includes('blocked')) return 'gone';
  if (text.includes('deactivated')) return 'gone';
  return 'temporary';
}

export function isSupportOwner(from) {
  const uname = String(from?.username || '').trim().toLowerCase();
  return Boolean(uname && SUPPORT_OWNER_USERNAMES.includes(uname));
}

export async function getAdminChatId() {
  const row = await db
    .select()
    .from(supportConfig)
    .where(eq(supportConfig.key, ADMIN_CONFIG_KEY))
    .get();
  return row?.value || null;
}

export async function claimAdminChatId(chatId, nowMs = Date.now(), { force = false } = {}) {
  const strId = String(chatId);
  const existing = await getAdminChatId();
  if (existing && !force) {
    return { ok: existing === strId, alreadyClaimedByOther: existing !== strId, adminChatId: existing };
  }
  if (existing && force) {
    await db
      .update(supportConfig)
      .set({ value: strId, updatedAt: nowMs })
      .where(eq(supportConfig.key, ADMIN_CONFIG_KEY));
  } else {
    await db
      .insert(supportConfig)
      .values({
        key: ADMIN_CONFIG_KEY,
        value: strId,
        updatedAt: nowMs,
      })
      .onConflictDoNothing();
  }
  const after = await getAdminChatId();
  return {
    ok: after === strId,
    alreadyClaimedByOther: after !== strId,
    reassigned: Boolean(existing && existing !== strId && after === strId),
    adminChatId: after,
  };
}

export async function rememberDialog(user, nowMs = Date.now()) {
  const existing = await db
    .select()
    .from(supportDialogs)
    .where(eq(supportDialogs.userChatId, user.chatId))
    .get();
  if (existing) {
    await db
      .update(supportDialogs)
      .set({
        userName: user.name,
        userUsername: user.username,
        userTelegramId: user.telegramId,
        lastMessageAt: nowMs,
      })
      .where(eq(supportDialogs.userChatId, user.chatId));
    return false;
  }
  await db.insert(supportDialogs).values({
    userChatId: user.chatId,
    userTelegramId: user.telegramId,
    userName: user.name,
    userUsername: user.username,
    lastMessageAt: nowMs,
  });
  return true;
}

export async function rememberAdminMessage(adminMessageId, userChatId) {
  if (adminMessageId === undefined || adminMessageId === null) return;
  const key = String(adminMessageId);
  const existing = await db
    .select({ id: supportMessages.id })
    .from(supportMessages)
    .where(eq(supportMessages.adminMessageId, key))
    .get();
  if (existing) {
    await db
      .update(supportMessages)
      .set({ userChatId: String(userChatId), answeredAt: null })
      .where(eq(supportMessages.adminMessageId, key));
    return;
  }
  await db.insert(supportMessages).values({
    adminMessageId: key,
    userChatId: String(userChatId),
    answeredAt: null,
  });
}

export async function findByAdminMessage(adminMessageId) {
  if (adminMessageId === undefined || adminMessageId === null) return null;
  const row = await db
    .select({ userChatId: supportMessages.userChatId })
    .from(supportMessages)
    .where(eq(supportMessages.adminMessageId, String(adminMessageId)))
    .get();
  return row?.userChatId ?? null;
}

export async function markAnswered(adminMessageId, nowMs = Date.now()) {
  if (adminMessageId === undefined || adminMessageId === null) return;
  await db
    .update(supportMessages)
    .set({ answeredAt: nowMs })
    .where(eq(supportMessages.adminMessageId, String(adminMessageId)));
}

export async function setAdminTarget(adminChatId, userChatId, nowMs = Date.now()) {
  const existing = await db
    .select({ id: supportTargets.id })
    .from(supportTargets)
    .where(eq(supportTargets.adminChatId, String(adminChatId)))
    .get();
  if (existing) {
    await db
      .update(supportTargets)
      .set({ userChatId: String(userChatId), updatedAt: nowMs })
      .where(eq(supportTargets.adminChatId, String(adminChatId)));
    return;
  }
  await db.insert(supportTargets).values({
    adminChatId: String(adminChatId),
    userChatId: String(userChatId),
    updatedAt: nowMs,
  });
}

export async function clearAdminTarget(adminChatId) {
  await db
    .delete(supportTargets)
    .where(eq(supportTargets.adminChatId, String(adminChatId)));
}

export async function resolveTarget({ replyToMessageId, adminChatId, nowMs = Date.now() }) {
  if (replyToMessageId !== undefined && replyToMessageId !== null) {
    const byReply = await findByAdminMessage(replyToMessageId);
    if (byReply) return { chatId: byReply, via: 'reply' };
  }
  const target = await db
    .select()
    .from(supportTargets)
    .where(eq(supportTargets.adminChatId, String(adminChatId)))
    .get();
  if (!target) return null;
  if (nowMs - Number(target.updatedAt || 0) > TARGET_FRESH_MS) return null;
  return { chatId: target.userChatId, via: 'target' };
}

export async function dialogsForAnswer(nowMs = Date.now(), limit = 6) {
  const since = nowMs - DIALOGS_WINDOW_MS;
  const rows = await db
    .select()
    .from(supportDialogs)
    .where(gt(supportDialogs.lastMessageAt, since))
    .orderBy(desc(supportDialogs.lastMessageAt))
    .all();
  return rows.slice(0, limit);
}

export async function dialogName(userChatId) {
  const row = await db
    .select({ userName: supportDialogs.userName })
    .from(supportDialogs)
    .where(eq(supportDialogs.userChatId, String(userChatId)))
    .get();
  return (row?.userName || '').trim() || 'человеку';
}

/**
 * @param {number | string} chatId
 * @param {string} text
 * @param {any} [keyboard]
 */
export async function sendSupportMessage(chatId, text, keyboard = undefined) {
  try {
    const body = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };
    if (keyboard) body.reply_markup = keyboard;
    const res = await api.sendMessage(body);
    return {
      ok: true,
      messageId: res?.message_id ?? null,
      errorCode: 0,
      reason: '',
    };
  } catch (err) {
    return {
      ok: false,
      messageId: null,
      errorCode: Number(err?.code || 0),
      reason: String(err?.description || err?.message || 'Bot API error'),
    };
  }
}

/**
 * @param {number | string} fromChatId
 * @param {number} messageId
 * @param {number | string} toChatId
 * @param {string} [caption]
 */
export async function copySupportMessage(fromChatId, messageId, toChatId, caption = undefined) {
  try {
    const body = {
      chat_id: toChatId,
      from_chat_id: fromChatId,
      message_id: messageId,
    };
    if (caption) {
      body.caption = caption;
      body.parse_mode = 'HTML';
    }
    const res = await api.copyMessage(body);
    return {
      ok: true,
      messageId: res?.message_id ?? null,
      errorCode: 0,
      reason: '',
    };
  } catch (err) {
    return {
      ok: false,
      messageId: null,
      errorCode: Number(err?.code || 0),
      reason: String(err?.description || err?.message || 'Bot API error'),
    };
  }
}

export async function markDelivered(chatId, messageId) {
  try {
    await api.setMessageReaction({
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: 'emoji', emoji: '👌' }],
    });
  } catch {
    // старый клиент или запрет реакций не считается ошибкой доставки
  }
}

export async function answerCallback(callbackId, text) {
  try {
    await api.answerCallbackQuery({
      callback_query_id: callbackId,
      text: String(text || '').slice(0, 200),
    });
  } catch {
    // best-effort
  }
}
