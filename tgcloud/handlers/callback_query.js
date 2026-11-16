import { db, api } from 'sdk';
import { eq } from 'sdk/db';
import { tournaments, tournamentPlayers, matches } from '../schema.js';
import { escapeHtml, processScoreConfirmation } from '../lib/helpers.js';
import { syncPublicLiveIfEnabled } from '../lib/publicLive.js';

async function editSingleMessage(chatId, messageId, text) {
  if (!chatId || !messageId) return;
  try {
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
    });
  } catch (_) {}
}

export default async function (callbackQuery) {
  const data = String(callbackQuery?.data || '');
  const tgUser = callbackQuery?.from;
  if (!tgUser?.id) return;

  const parts = data.split(':');
  const action = parts[0];
  const matchId = Number(parts[1]);
  const expectedS1 = parts.length >= 4 ? Number(parts[2]) : null;
  const expectedS2 = parts.length >= 4 ? Number(parts[3]) : null;

  if (!matchId || (action !== 'confirm' && action !== 'dispute')) {
    await api.answerCallbackQuery({ callback_query_id: callbackQuery.id }).catch(() => {});
    return;
  }

  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;

  try {
    const match = await db.select().from(matches).where(eq(matches.id, matchId)).get();
    if (!match) {
      await api.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: 'Матч не найден',
        show_alert: true,
      });
      return;
    }

    if (match.status !== 'WAITING_CONFIRM') {
      const statusText =
        match.status === 'FINISHED'
          ? `✅ Матч (Стол ${match.tableNumber}) уже подтвержден со счетом ${match.score1}:${match.score2}.`
          : `ℹ️ Матч (Стол ${match.tableNumber}) уже возвращен в игру.`;
      await editSingleMessage(chatId, messageId, statusText);
      await api.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: match.status === 'FINISHED' ? 'Матч уже подтвержден' : 'Матч уже возвращен в игру',
        show_alert: true,
      });
      return;
    }

    if (
      expectedS1 !== null &&
      expectedS2 !== null &&
      !Number.isNaN(expectedS1) &&
      !Number.isNaN(expectedS2) &&
      (match.score1 !== expectedS1 || match.score2 !== expectedS2)
    ) {
      await editSingleMessage(
        chatId,
        messageId,
        `⚠️ Предложенный счет ${expectedS1}:${expectedS2} (Стол ${match.tableNumber}) уже устарел.`
      );
      await api.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: 'Этот счет уже устарел, проверьте новое сообщение',
        show_alert: true,
      });
      return;
    }

    const tournament = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, match.tournamentId))
      .get();
    if (!tournament) {
      await api.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: 'Турнир не найден',
        show_alert: true,
      });
      return;
    }
    if (tournament.status === 'FINISHED') {
      await editSingleMessage(chatId, messageId, `ℹ️ Турнир «${escapeHtml(tournament.name)}» уже завершён.`);
      await api.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: 'Турнир уже завершён',
        show_alert: true,
      });
      return;
    }

    const players = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, match.tournamentId))
      .all();

    const result = await processScoreConfirmation({
      tournament,
      match,
      players,
      tgUser,
      action,
    });

    if (chatId && messageId) {
      const alreadyUpdated =
        Array.isArray(match.confirmMessages) &&
        match.confirmMessages.some(
          (m) => Number(m.chatId) === Number(chatId) && Number(m.messageId) === Number(messageId)
        );
      if (!alreadyUpdated) {
        await editSingleMessage(chatId, messageId, result.messageText);
      }
    }

    if (action === 'confirm') {
      await syncPublicLiveIfEnabled(tournament.id);
    }

    await api.answerCallbackQuery({
      callback_query_id: callbackQuery.id,
      text:
        action === 'dispute'
          ? 'Счет оспорен'
          : result.seriesOver
            ? 'Счет подтвержден!'
            : 'Сет подтвержден!',
    });
  } catch (err) {
    const errCode = err?.parameters?.code || err?.code;
    const msg =
      errCode === 'CONFLICT'
        ? 'Матч уже обработан другим игроком'
        : errCode === 'FORBIDDEN' || errCode === 'WRONG_TEAM'
          ? err.message
          : 'Не удалось обработать действие, попробуйте снова';
    await api
      .answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: String(msg).slice(0, 190),
        show_alert: true,
      })
      .catch(() => {});
  }
}
