import { db, api } from 'sdk';
import { eq } from 'sdk/db';
import { tournaments } from '../schema.js';
import { upsertUser, escapeHtml, buildMainAppLink } from '../lib/helpers.js';

export default async function (message) {
  if (!message?.chat?.id) return;

  if (message.from) {
    await upsertUser(message.from, { refreshAvatar: true });
  }

  const text = String(message.text || '').trim();
  const matchStart = text.match(/^\/start(?:\s+(\d+))?/);
  const parsedId = matchStart?.[1] ? Number(matchStart[1]) : null;
  const startTournamentId = parsedId && Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;

  const appUrl = buildMainAppLink(startTournamentId || 'open');

  let greeting =
    `⚽ <b>Kicker Picker</b> — турнирный движок для кикера (Monster DYP).\n\n` +
    `Создавайте турниры, следите за столами, бросайте монетку и подтверждайте счет прямо в Telegram.`;

  let buttonText = '🏆 Открыть Kicker Picker';

  if (startTournamentId) {
    const tournament = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, startTournamentId))
      .get();

    if (tournament) {
      greeting =
        `⚽ Приглашение в турнир <b>«${escapeHtml(tournament.name)}»</b>\n\n` +
        `Нажмите кнопку ниже, чтобы присоединиться и открыть Mini App.`;
      buttonText = `⚽ Войти в «${tournament.name}»`;
    } else {
      greeting =
        `⚽ Добро пожаловать в <b>Kicker Picker</b>!\n\n` +
        `Турнир не найден. Нажмите кнопку ниже, чтобы открыть приложение.`;
    }
  }

  await api.sendMessage({
    chat_id: message.chat.id,
    text: greeting,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: buttonText, url: appUrl }]],
    },
  });
}
