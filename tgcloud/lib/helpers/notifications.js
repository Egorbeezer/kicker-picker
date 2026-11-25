import { api, db } from 'sdk';
import { and, eq, inArray } from 'sdk/db';
import { matches, tournaments } from '../../schema.js';
import { toEpochMs } from '../dyp.js';
import { buildMainAppLink, escapeHtml, safeSendMessage } from './telegram.js';

function truncateName(name, max = 16) {
  const s = String(name || '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function formatMatchTeamsColumns(t1, t2) {
  const leftNames = t1.length > 0 ? t1.map((p) => truncateName(p.name, 16) || 'Игрок') : ['Команда 1'];
  const rightNames = t2.length > 0 ? t2.map((p) => truncateName(p.name, 16) || 'Игрок') : ['Команда 2'];
  const leftWidth = Math.max(...leftNames.map((n) => n.length));
  const rowCount = Math.max(leftNames.length, rightNames.length);
  const rows = [];

  for (let i = 0; i < rowCount; i += 1) {
    const left = leftNames[i] || '';
    const right = rightNames[i] || '';
    const sep = i === 0 ? '   vs   ' : '        ';
    rows.push(`${left.padEnd(leftWidth, ' ')}${sep}${right}`.trimEnd());
  }

  return rows.join('\n');
}

export function formatMatchTeamsSummary(match, playersById) {
  const t1 = [playersById.get(match.team1Player1Id), playersById.get(match.team1Player2Id)].filter(Boolean);
  const t2 = [playersById.get(match.team2Player1Id), playersById.get(match.team2Player2Id)].filter(Boolean);
  return {
    t1,
    t2,
    t1Names: t1.map((p) => p.name).join(' & ') || 'Команда 1',
    t2Names: t2.map((p) => p.name).join(' & ') || 'Команда 2',
  };
}

export function formatBracketSlotRu(slot) {
  if (!slot) return '';
  if (slot === 'FINAL') return 'Финал';
  if (slot === 'THIRD_PLACE') return 'За 3-е место';
  if (slot.startsWith('R32_')) return `1/16 финала ${slot.slice(4)}`;
  if (slot.startsWith('EF')) return `1/8 финала ${slot.slice(2)}`;
  if (slot.startsWith('QF')) return `Четвертьфинал ${slot.slice(2)}`;
  if (slot.startsWith('SF')) return `Полуфинал ${slot.slice(2)}`;
  return slot;
}

export function formatMatchStageLabel(match, tournament) {
  if (match.stage === 'PLAYOFF') {
    const setsPlayed = (match.setsWon1 || 0) + (match.setsWon2 || 0) + 1;
    const isSeries = tournament?.playoffFormat && tournament.playoffFormat !== 'best_of_1';
    const slotText = formatBracketSlotRu(match.bracketSlot) || 'Плей-офф';
    return isSeries ? `${slotText} (Сет ${setsPlayed})` : slotText;
  }
  return `Раунд ${match.roundNumber}`;
}

/**
 * @param {{ match: any; replacementText?: string; onlyRemoveButtons?: boolean; excludeMessage?: { chatId: number | string; messageId: number | string } | null }} params
 */
export async function clearConfirmMessages({
  match,
  replacementText = undefined,
  onlyRemoveButtons = false,
  excludeMessage = undefined,
}) {
  const list = Array.isArray(match?.confirmMessages) ? match.confirmMessages : [];
  for (const item of list) {
    if (!item?.chatId || !item?.messageId) continue;
    if (
      excludeMessage &&
      Number(item.chatId) === Number(excludeMessage.chatId) &&
      Number(item.messageId) === Number(excludeMessage.messageId)
    ) {
      continue;
    }
    try {
      if (onlyRemoveButtons) {
        await api.editMessageReplyMarkup({
          chat_id: item.chatId,
          message_id: item.messageId,
          reply_markup: { inline_keyboard: [] },
        });
      } else if (replacementText) {
        await api.editMessageText({
          chat_id: item.chatId,
          message_id: item.messageId,
          text: replacementText,
          parse_mode: 'HTML',
        });
      }
    } catch (_) {}
  }
}

export async function notifySubmittingTeam({ match, playersById, text, excludeTgId = null }) {
  const submittingTeamPlayers =
    match.submittedByTeam === 1
      ? [playersById.get(match.team1Player1Id), playersById.get(match.team1Player2Id)].filter(Boolean)
      : [playersById.get(match.team2Player1Id), playersById.get(match.team2Player2Id)].filter(Boolean);

  const recipients = new Set();
  for (const p of submittingTeamPlayers) {
    if (p.tgId && p.tgId !== excludeTgId) recipients.add(p.tgId);
  }
  if (match.submittedByTgId && match.submittedByTgId !== excludeTgId) {
    recipients.add(match.submittedByTgId);
  }

  for (const chatId of recipients) {
    await safeSendMessage({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
  }
}

export async function notifyRoundStart({ tournament, createdMatches, playersById, roundNumber }) {
  for (const m of createdMatches) {
    const { t1, t2 } = formatMatchTeamsSummary(m, playersById);
    const stageLabel =
      m.stage === 'PLAYOFF' ? formatBracketSlotRu(m.bracketSlot) || 'Плей-офф' : `Раунд ${roundNumber}`;

    for (const p of [...t1, ...t2]) {
      if (!p.tgId) continue;
      await safeSendMessage({
        chat_id: p.tgId,
        text:
          `⚽ <b>${escapeHtml(tournament.name)}</b> — ${escapeHtml(stageLabel)}\n` +
          `🪑 <b>Стол ${m.tableNumber}</b>\n\n` +
          `<pre>${escapeHtml(formatMatchTeamsColumns(t1, t2))}</pre>`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚽ Открыть матч', url: buildMainAppLink(tournament.id) }],
          ],
        },
      });
    }
  }
}

export async function notifyScoreConfirmation({ tournament, match, playersById, submittedByTeam, score1, score2 }) {
  await clearConfirmMessages({ match, onlyRemoveButtons: true });

  const targetTeamPlayers =
    submittedByTeam === 1
      ? [playersById.get(match.team2Player1Id), playersById.get(match.team2Player2Id)].filter(Boolean)
      : [playersById.get(match.team1Player1Id), playersById.get(match.team1Player2Id)].filter(Boolean);

  const { t1Names, t2Names } = formatMatchTeamsSummary(match, playersById);
  const stageLabel = formatMatchStageLabel(match, tournament);

  const sentMessages = [];
  const seenChatIds = new Set();
  for (const p of targetTeamPlayers) {
    if (!p.tgId || seenChatIds.has(p.tgId)) continue;
    seenChatIds.add(p.tgId);
    const res = await safeSendMessage({
      chat_id: p.tgId,
      text:
        `📊 <b>Подтвердите счет матча</b>\n` +
        `🏆 ${escapeHtml(tournament.name)} • ${escapeHtml(stageLabel)} • Стол ${match.tableNumber}\n\n` +
        `• ${escapeHtml(t1Names)}: <b>${score1}</b>\n` +
        `• ${escapeHtml(t2Names)}: <b>${score2}</b>\n\n` +
        `<i>Нажмите кнопку ниже, чтобы подтвердить или оспорить результат прямо здесь.</i>`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: `✅ Подтвердить (${score1}:${score2})`, callback_data: `confirm:${match.id}:${score1}:${score2}` },
            { text: '❌ Оспорить', callback_data: `dispute:${match.id}:${score1}:${score2}` },
          ],
        ],
      },
    });
    if (res?.message_id) {
      sentMessages.push({ chatId: p.tgId, messageId: res.message_id });
    }
  }

  await db
    .update(matches)
    .set({ confirmMessages: sentMessages })
    .where(eq(matches.id, match.id));

  return sentMessages.length;
}

export async function checkAndSendLongMatchReminders({
  tournament,
  players = [],
  allMatches = [],
  nowMs = Date.now(),
}) {
  if (!tournament || tournament.status === 'FINISHED' || tournament.status === 'REGISTRATION') {
    return 0;
  }
  const alertMs = Math.max(1, Number(tournament.longMatchAlertMin) || 15) * 60000;
  const repeatMs = Math.max(1, Number(tournament.scoreReminderMin) || 3) * 60000;
  const playersById = new Map(players.map((p) => [p.id, p]));
  const adminChatIds = new Set(
    [tournament.creatorTgId, ...(Array.isArray(tournament.coAdminTgIds) ? tournament.coAdminTgIds : [])].filter(Boolean)
  );

  let sentCount = 0;
  for (const m of allMatches) {
    if (m.status !== 'PLAYING') continue;
    const rawStart = m.startedAt ?? m.createdAt;
    const startMs =
      rawStart instanceof Date
        ? rawStart.getTime()
        : typeof rawStart === 'number'
          ? rawStart < 1e12
            ? rawStart * 1000
            : rawStart
          : null;
    if (!startMs) continue;

    const stage = Number(m.reminderStage) || 0;
    const rawLast = m.lastReminderAt;
    const lastMs =
      rawLast instanceof Date
        ? rawLast.getTime()
        : typeof rawLast === 'number'
          ? rawLast < 1e12
            ? rawLast * 1000
            : rawLast
          : 0;

    let nextStage = null;
    if (stage === 0 && nowMs - startMs >= alertMs) {
      nextStage = 1;
    } else if (stage === 1 && lastMs > 0 && nowMs - lastMs >= repeatMs) {
      nextStage = 2;
    }

    if (nextStage === null) continue;

    const { t1, t2 } = formatMatchTeamsSummary(m, playersById);
    const recipients = new Set(adminChatIds);
    for (const p of [...t1, ...t2]) {
      if (p.tgId) recipients.add(p.tgId);
    }

    const elapsedMin = Math.round((nowMs - startMs) / 60000);
    const columnsHtml = `<pre>${escapeHtml(formatMatchTeamsColumns(t1, t2))}</pre>`;
    const text =
      nextStage === 1
        ? `⏰ <b>Долгий матч (${elapsedMin} мин)</b>\n` +
          `🏆 ${escapeHtml(tournament.name)} • Стол ${m.tableNumber}\n\n` +
          `${columnsHtml}\n\n` +
          `<i>Если игра закончилась — внесите, пожалуйста, счёт.</i>`
        : `📊 <b>Напоминание: внесите счёт</b>\n` +
          `🏆 ${escapeHtml(tournament.name)} • Стол ${m.tableNumber} (идёт ${elapsedMin} мин)\n\n` +
          columnsHtml;

    const claimedRem = await db
      .update(matches)
      .set({
        reminderStage: nextStage,
        lastReminderAt: new Date(nowMs),
      })
      .where(
        and(
          eq(matches.id, m.id),
          eq(matches.status, 'PLAYING'),
          eq(matches.reminderStage, stage)
        )
      )
      .returning();
    if (!Array.isArray(claimedRem) || claimedRem.length === 0) continue;

    for (const chatId of recipients) {
      await safeSendMessage({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚽ Внести счёт', url: buildMainAppLink(tournament.id) }],
          ],
        },
      });
    }

    sentCount += 1;
  }

  return sentCount;
}

const AUTO_FINISH_INACTIVITY_MS = 24 * 60 * 60 * 1000;

/**
 * Автоматически завершает начатые турниры (QUALIFICATION / PLAYOFF),
 * по которым последняя активность была более 24 часов назад.
 * Возвращает список id завершённых турниров.
 */
export async function autoFinishExpiredTournaments(
  tournamentList,
  matchesByTournament,
  nowMs = Date.now()
) {
  const finishedIds = [];
  for (const t of tournamentList || []) {
    if (!t || (t.status !== 'QUALIFICATION' && t.status !== 'PLAYOFF')) continue;
    let lastActivityMs = toEpochMs(t.startedAt) || toEpochMs(t.createdAt) || 0;
    const tMatches = matchesByTournament?.get?.(t.id) || [];
    for (const m of tMatches) {
      const mMs = toEpochMs(m.finishedAt) || toEpochMs(m.createdAt) || 0;
      if (mMs > lastActivityMs) lastActivityMs = mMs;
    }
    if (!lastActivityMs || nowMs - lastActivityMs < AUTO_FINISH_INACTIVITY_MS) continue;

    const finishedAt = new Date(nowMs);
    await db
      .update(tournaments)
      .set({
        status: 'FINISHED',
        finishedAt,
        pendingPlayoff: false,
      })
      .where(and(eq(tournaments.id, t.id), eq(tournaments.status, t.status)));

    await db
      .update(matches)
      .set({
        status: 'CANCELLED',
        confirmMessages: null,
        finishedAt,
      })
      .where(and(eq(matches.tournamentId, t.id), inArray(matches.status, ['PLAYING', 'WAITING_CONFIRM'])));

    for (const m of tMatches) {
      if (m.status === 'PLAYING' || m.status === 'WAITING_CONFIRM') {
        m.status = 'CANCELLED';
        m.confirmMessages = null;
        m.finishedAt = finishedAt;
      }
    }

    t.status = 'FINISHED';
    t.finishedAt = finishedAt;
    t.pendingPlayoff = false;
    finishedIds.push(t.id);
  }
  return finishedIds;
}
