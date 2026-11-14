import { db, api } from 'sdk';
import { eq, and } from 'sdk/db';
import { tournaments, tournamentPlayers, matches } from '../schema.js';
import {
  applyMatchFinish,
  clearConfirmMessages,
  escapeHtml,
  formatMatchStageLabel,
  formatMatchTeamsSummary,
  formatPlayerDisplayName,
  isTournamentAdmin,
  notifySubmittingTeam,
} from '../lib/helpers.js';
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
    await api.answerCallbackQuery({ callback_query_id: callbackQuery.id });
    return;
  }

  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;

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
  const players = await db
    .select()
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, match.tournamentId))
    .all();
  const playersById = new Map(players.map((p) => [p.id, p]));

  const myPlayer = players.find((p) => p.tgId === tgUser.id);
  const isAdmin = isTournamentAdmin(tournament, tgUser.id);
  const inTeam1 = myPlayer && (match.team1Player1Id === myPlayer.id || match.team1Player2Id === myPlayer.id);
  const inTeam2 = myPlayer && (match.team2Player1Id === myPlayer.id || match.team2Player2Id === myPlayer.id);

  if (!isAdmin) {
    if (!inTeam1 && !inTeam2) {
      await api.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: 'Вы не участвуете в этом матче',
        show_alert: true,
      });
      return;
    }
    const myTeam = inTeam1 ? 1 : 2;
    if (myTeam === match.submittedByTeam) {
      await api.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: 'Подтвердить должен соперник',
        show_alert: true,
      });
      return;
    }
  }

  const actorName = escapeHtml(myPlayer?.name || formatPlayerDisplayName(tgUser));
  const { t1Names, t2Names } = formatMatchTeamsSummary(match, playersById);
  const stageLabel = escapeHtml(formatMatchStageLabel(match, tournament));
  const tourneyName = escapeHtml(tournament?.name || 'Турнир');
  const scorePair = `${match.score1}:${match.score2}`;

  if (action === 'dispute') {
    const claimedDispute = await db
      .update(matches)
      .set({
        status: 'PLAYING',
        submittedByTeam: null,
        submittedByTgId: null,
        confirmMessages: null,
      })
      .where(and(eq(matches.id, match.id), eq(matches.status, 'WAITING_CONFIRM')))
      .returning();

    if (!Array.isArray(claimedDispute) || claimedDispute.length === 0) {
      await api.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: 'Матч уже обработан другим игроком',
        show_alert: true,
      });
      return;
    }

    const disputedText =
      `❌ <b>Счет ${scorePair} оспорен</b> (${actorName})\n` +
      `🏆 ${tourneyName} • ${stageLabel} • Стол ${match.tableNumber}\n\n` +
      `${escapeHtml(t1Names)} — ${escapeHtml(t2Names)}\n` +
      `<i>Матч возвращен в игру.</i>`;

    await clearConfirmMessages({ match, replacementText: disputedText });
    if (chatId && messageId) {
      const alreadyUpdated = Array.isArray(match.confirmMessages) &&
        match.confirmMessages.some((m) => Number(m.chatId) === Number(chatId) && Number(m.messageId) === Number(messageId));
      if (!alreadyUpdated) {
        await editSingleMessage(chatId, messageId, disputedText);
      }
    }

    await notifySubmittingTeam({
      match,
      playersById,
      excludeTgId: tgUser.id,
      text:
        `⚠️ <b>Соперники оспорили счет ${scorePair}</b> (Стол ${match.tableNumber})\n` +
        `Уточните результат и отправьте его заново.`,
    });

    await api.answerCallbackQuery({
      callback_query_id: callbackQuery.id,
      text: 'Счет оспорен',
    });
    return;
  }

  // Confirm (with CAS on WAITING_CONFIRM to block simultaneous duplicate clicks)
  let finishRes;
  try {
    finishRes = await applyMatchFinish({
      tournament,
      match,
      score1: match.score1,
      score2: match.score2,
      expectedStatuses: ['WAITING_CONFIRM'],
    });
  } catch (err) {
    if (err?.parameters?.code === 'CONFLICT' || err?.code === 'CONFLICT') {
      await api.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: 'Матч уже обработан другим игроком',
        show_alert: true,
      });
      return;
    }
    throw err;
  }

  const confirmedHeader = finishRes?.seriesOver
    ? `✅ <b>Счет ${scorePair} подтвержден!</b> (${actorName})`
    : `✅ <b>Сет подтвержден (${scorePair})!</b> (${actorName})\nСчет по сетам: <b>${finishRes.setsWon1}:${finishRes.setsWon2}</b>. Начинайте следующий сет!`;

  const confirmedText =
    `${confirmedHeader}\n` +
    `🏆 ${tourneyName} • ${stageLabel} • Стол ${match.tableNumber}\n\n` +
    `• ${escapeHtml(t1Names)}: <b>${match.score1}</b>\n` +
    `• ${escapeHtml(t2Names)}: <b>${match.score2}</b>`;

  await clearConfirmMessages({ match, replacementText: confirmedText });
  if (chatId && messageId) {
    const alreadyUpdated = Array.isArray(match.confirmMessages) &&
      match.confirmMessages.some((m) => Number(m.chatId) === Number(chatId) && Number(m.messageId) === Number(messageId));
    if (!alreadyUpdated) {
      await editSingleMessage(chatId, messageId, confirmedText);
    }
  }

  await notifySubmittingTeam({
    match,
    playersById,
    excludeTgId: tgUser.id,
    text: confirmedText,
  });

  await syncPublicLiveIfEnabled(tournament.id);

  await api.answerCallbackQuery({
    callback_query_id: callbackQuery.id,
    text: finishRes?.seriesOver ? 'Счет подтвержден!' : 'Сет подтвержден!',
  });
}
