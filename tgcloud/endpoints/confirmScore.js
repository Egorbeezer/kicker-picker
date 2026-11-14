import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { tournaments, tournamentPlayers, matches } from '../schema.js';
import {
  applyMatchFinish,
  clearConfirmMessages,
  escapeHtml,
  formatMatchStageLabel,
  formatMatchTeamsSummary,
  formatPlayerDisplayName,
  getTournamentSnapshot,
  isTournamentAdmin,
  notifySubmittingTeam,
} from '../lib/helpers.js';
import { syncPublicLiveIfEnabled } from '../lib/publicLive.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация', { code: 'UNAUTHORIZED' });

  const matchId = Number(input?.matchId);
  const action = input?.action === 'dispute' ? 'dispute' : 'confirm';

  const match = await db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!match) throw new EndpointError('Матч не найден', { code: 'NOT_FOUND' });
  if (match.status !== 'WAITING_CONFIRM') {
    throw new EndpointError('Матч не ожидает подтверждения', { code: 'INVALID_STATE' });
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

  const myPlayer = players.find((p) => p.tgId === tgUser.id);
  const isAdmin = isTournamentAdmin(tournament, tgUser.id);
  const inTeam1 = myPlayer && (match.team1Player1Id === myPlayer.id || match.team1Player2Id === myPlayer.id);
  const inTeam2 = myPlayer && (match.team2Player1Id === myPlayer.id || match.team2Player2Id === myPlayer.id);

  if (!isAdmin) {
    if (!inTeam1 && !inTeam2) {
      throw new EndpointError('Вы не участвуете в этом матче', { code: 'FORBIDDEN' });
    }
    const myTeam = inTeam1 ? 1 : 2;
    if (myTeam === match.submittedByTeam) {
      throw new EndpointError('Подтвердить или оспорить счет должна команда соперников', {
        code: 'WRONG_TEAM',
      });
    }
  }

  const playersById = new Map(players.map((p) => [p.id, p]));
  const actorName = escapeHtml(myPlayer?.name || formatPlayerDisplayName(tgUser));
  const { t1Names, t2Names } = formatMatchTeamsSummary(match, playersById);
  const stageLabel = escapeHtml(formatMatchStageLabel(match, tournament));
  const tourneyName = escapeHtml(tournament?.name || 'Турнир');
  const scorePair = `${match.score1}:${match.score2}`;

  if (action === 'dispute') {
    const [claimedDispute] = await db
      .update(matches)
      .set({
        status: 'PLAYING',
        submittedByTeam: null,
        submittedByTgId: null,
        confirmMessages: null,
      })
      .where(and(eq(matches.id, match.id), eq(matches.status, 'WAITING_CONFIRM')))
      .returning();
    if (!claimedDispute) {
      throw new EndpointError('Матч уже обработан другим игроком', { code: 'CONFLICT' });
    }

    await clearConfirmMessages({
      match,
      replacementText:
        `❌ <b>Счет ${scorePair} оспорен</b> (${actorName})\n` +
        `🏆 ${tourneyName} • ${stageLabel} • Стол ${match.tableNumber}\n\n` +
        `${escapeHtml(t1Names)} — ${escapeHtml(t2Names)}\n` +
        `<i>Матч возвращен в игру.</i>`,
    });

    await notifySubmittingTeam({
      match,
      playersById,
      excludeTgId: tgUser.id,
      text:
        `⚠️ <b>Соперники оспорили счет ${scorePair}</b> (Стол ${match.tableNumber})\n` +
        `Уточните результат и отправьте его заново.`,
    });
  } else {
    const finishRes = await applyMatchFinish({
      tournament,
      match,
      score1: match.score1,
      score2: match.score2,
      expectedStatuses: ['WAITING_CONFIRM'],
    });

    const confirmedHeader = finishRes?.seriesOver
      ? `✅ <b>Счет ${scorePair} подтвержден!</b> (${actorName})`
      : `✅ <b>Сет подтвержден (${scorePair})!</b> (${actorName})\nСчет по сетам: <b>${finishRes.setsWon1}:${finishRes.setsWon2}</b>. Начинайте следующий сет!`;

    const confirmedText =
      `${confirmedHeader}\n` +
      `🏆 ${tourneyName} • ${stageLabel} • Стол ${match.tableNumber}\n\n` +
      `• ${escapeHtml(t1Names)}: <b>${match.score1}</b>\n` +
      `• ${escapeHtml(t2Names)}: <b>${match.score2}</b>`;

    await clearConfirmMessages({ match, replacementText: confirmedText });

    await notifySubmittingTeam({
      match,
      playersById,
      excludeTgId: tgUser.id,
      text: confirmedText,
    });
  }

  await syncPublicLiveIfEnabled(tournament.id);
  return await getTournamentSnapshot(tournament.id, tgUser.id);
}
