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
    `⚽ <b>Кикер Пикер</b> — турнирный бот для настольного футбола (кикера) прямо в Telegram.\n\n` +
    `<b>🎮 Форматы турниров (2×2 и 1×1):</b>\n` +
    `• 🎲 <b>Monster DYP</b> — новый напарник каждый раунд без повторов\n` +
    `• 🤝 <b>Classic DYP</b> — постоянные случайные пары на весь отбор\n` +
    `• ♟️ <b>Швейцарка (Swiss)</b> — сильные встречаются с сильными по очкам\n` +
    `• 🔄 <b>Круговой (Round Robin)</b> — каждый с каждым в 1 или 2 круга\n` +
    `• 🎰 <b>Random DYP</b> — чистый случайный жребий\n` +
    `• 🃏 <b>Whist</b> — максимум уникальных напарников и соперников\n` +
    `• ❤️ <b>Last One Standing</b> — игра на жизни до последнего героя\n` +
    `• ⚡ <b>Сразу Плей-офф</b> — быстрая сетка на выбывание\n\n` +
    `<b>✨ Возможности:</b>\n` +
    `• ⚖️ Корзины A/B, игра до N голов, баланс +2 мяча, серии до 1/2/3 побед\n` +
    `• 🪙 Бросок монетки за право выбора стороны/подачи\n` +
    `• ✅ Ввод и подтверждение счёта в Mini App или в чате с ботом\n` +
    `• 📊 Рейтинговая таблица, скриншот результатов и профиль игрока со статистикой\n` +
    `• 🔗 Приглашения в турнир и трансляция LIVE-таблицы`;

  let buttonText = '🏆 Открыть Кикер Пикер';

  if (startTournamentId) {
    const tournament = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, startTournamentId))
      .get();

    if (tournament) {
      greeting =
        `⚽ Приглашение в турнир <b>«${escapeHtml(tournament.name)}»</b>\n\n` +
        `Нажмите кнопку ниже, чтобы присоединиться в «Кикер Пикер».`;
      buttonText = `⚽ Войти в «${tournament.name}»`;
    } else {
      greeting =
        `⚽ Добро пожаловать в <b>Кикер Пикер</b>!\n\n` +
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
