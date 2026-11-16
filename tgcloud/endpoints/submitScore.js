import { db, EndpointError } from 'sdk';
import { eq, and, gt, inArray } from 'sdk/db';
import { tournaments, tournamentPlayers, matches } from '../schema.js';
import { validateMatchScore } from '../lib/dyp.js';
import {
  adjustLosLivesForMatch,
  getMatchRules,
  getSetsNeededToWin,
  applyMatchFinish,
  clearConfirmMessages,
  notifyScoreConfirmation,
  getTournamentSnapshot,
  isTournamentAdmin,
} from '../lib/helpers.js';
import { syncPublicLiveIfEnabled } from '../lib/publicLive.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация', { code: 'UNAUTHORIZED' });

  const matchId = Number(input?.matchId);
  const score1 = Number(input?.score1);
  const score2 = Number(input?.score2);
  const forceAdmin = Boolean(input?.forceAdmin);

  const match = await db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!match) throw new EndpointError('Матч не найден', { code: 'NOT_FOUND' });

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, match.tournamentId))
    .get();
  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });

  const isAdmin = isTournamentAdmin(tournament, tgUser.id);
  if (forceAdmin && !isAdmin) {
    throw new EndpointError('Только организатор может редактировать любой матч', { code: 'FORBIDDEN' });
  }

  if (forceAdmin) {
    if (match.status === 'CANCELLED') {
      throw new EndpointError('Отменённый матч нельзя изменить — сначала восстановите его', {
        code: 'MATCH_CANCELLED',
      });
    }

    const rules = getMatchRules(tournament, match.stage);
    const v = validateMatchScore(score1, score2, rules);
    if (!v.valid) throw new EndpointError(v.reason || 'Неверный счёт', { code: 'INVALID_SCORE' });

    await clearConfirmMessages({
      match,
      replacementText: `✏️ Организатор зафиксировал счет <b>${score1}:${score2}</b> (Стол ${match.tableNumber}).`,
    });

    if (match.status === 'FINISHED' && match.stage === 'QUALIFICATION') {
      const prevWinner = match.score1 > match.score2 ? 1 : 2;
      if (prevWinner !== v.winner && tournament.dypMode === 'last_one_standing') {
        await adjustLosLivesForMatch({ tournament, match, winnerTeam: prevWinner, delta: 1 });
        await adjustLosLivesForMatch({ tournament, match, winnerTeam: v.winner, delta: -1 });
      }
      await db
        .update(matches)
        .set({
          score1,
          score2,
          setsWon1: v.winner === 1 ? 1 : 0,
          setsWon2: v.winner === 2 ? 1 : 0,
          setsHistory: [{ score1, score2 }],
          confirmMessages: null,
        })
        .where(eq(matches.id, match.id));
    } else if (match.status === 'FINISHED' && match.stage === 'PLAYOFF') {
      const laterPlayoff = await db
        .select({ id: matches.id })
        .from(matches)
        .where(
          and(
            eq(matches.tournamentId, tournament.id),
            eq(matches.stage, 'PLAYOFF'),
            gt(matches.roundNumber, match.roundNumber)
          )
        )
        .get();
      if (laterPlayoff) {
        throw new EndpointError(
          'Следующий раунд плей-офф уже создан — сначала удалите его или сбросьте матч',
          { code: 'PLAYOFF_NEXT_ROUND_EXISTS' }
        );
      }

      const prevHistory = Array.isArray(match.setsHistory) ? [...match.setsHistory] : [];
      if (prevHistory.length > 0) {
        prevHistory[prevHistory.length - 1] = { score1, score2 };
      } else {
        prevHistory.push({ score1, score2 });
      }
      let nextSets1 = 0;
      let nextSets2 = 0;
      for (const s of prevHistory) {
        if (Number(s.score1) > Number(s.score2)) nextSets1 += 1;
        else if (Number(s.score2) > Number(s.score1)) nextSets2 += 1;
      }
      const neededSets = getSetsNeededToWin(rules.format);
      const stillFinished = nextSets1 >= neededSets || nextSets2 >= neededSets;
      await db
        .update(matches)
        .set({
          status: stillFinished ? 'FINISHED' : 'PLAYING',
          score1: stillFinished ? score1 : 0,
          score2: stillFinished ? score2 : 0,
          setsWon1: nextSets1,
          setsWon2: nextSets2,
          setsHistory: prevHistory,
          confirmMessages: null,
          ...(stillFinished ? {} : { finishedAt: null }),
        })
        .where(eq(matches.id, match.id));
    } else {
      await applyMatchFinish({
        tournament,
        match,
        score1,
        score2,
        expectedStatuses: ['PLAYING', 'WAITING_CONFIRM'],
      });
    }
    await syncPublicLiveIfEnabled(tournament.id);
    return await getTournamentSnapshot(tournament.id, tgUser.id);
  }

  if (match.status === 'FINISHED') {
    throw new EndpointError('Матч уже завершен', { code: 'ALREADY_FINISHED' });
  }
  if (match.status === 'CANCELLED') {
    throw new EndpointError('Матч отменён', { code: 'MATCH_CANCELLED' });
  }

  const players = await db
    .select()
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, tournament.id))
    .all();
  const playersById = new Map(players.map((p) => [p.id, p]));

  const myPlayer = players.find((p) => p.tgId === tgUser.id);
  if (!myPlayer) throw new EndpointError('Вы не участвуете в этом турнире', { code: 'FORBIDDEN' });

  const inTeam1 = match.team1Player1Id === myPlayer.id || match.team1Player2Id === myPlayer.id;
  const inTeam2 = match.team2Player1Id === myPlayer.id || match.team2Player2Id === myPlayer.id;

  if (!inTeam1 && !inTeam2) {
    throw new EndpointError('Вы не играете в этом матче', { code: 'FORBIDDEN' });
  }

  const rules = getMatchRules(tournament, match.stage);
  const validation = validateMatchScore(score1, score2, rules);
  if (!validation.valid) {
    throw new EndpointError(validation.reason || 'Неверный счёт', { code: 'INVALID_SCORE' });
  }

  const submittedByTeam = inTeam1 ? 1 : 2;
  if (
    match.status === 'WAITING_CONFIRM' &&
    match.submittedByTeam === submittedByTeam &&
    match.score1 === score1 &&
    match.score2 === score2
  ) {
    const snapshot = await getTournamentSnapshot(tournament.id, tgUser.id);
    return { ...snapshot, notifiedCount: 0, alreadySubmitted: true };
  }

  const opponentPlayers =
    submittedByTeam === 1
      ? [playersById.get(match.team2Player1Id), playersById.get(match.team2Player2Id)].filter(Boolean)
      : [playersById.get(match.team1Player1Id), playersById.get(match.team1Player2Id)].filter(Boolean);

  // If opponents are all guests (no tgId), auto-confirm or let admin handle; here if all guests, finish immediately
  const opponentHasTelegram = opponentPlayers.some((p) => Boolean(p.tgId));
  if (!opponentHasTelegram) {
    await applyMatchFinish({
      tournament,
      match,
      score1,
      score2,
      expectedStatuses: ['PLAYING', 'WAITING_CONFIRM'],
    });
    await syncPublicLiveIfEnabled(tournament.id);
    return await getTournamentSnapshot(tournament.id, tgUser.id);
  }

  const [claimedWaiting] = await db
    .update(matches)
    .set({
      status: 'WAITING_CONFIRM',
      score1,
      score2,
      submittedByTeam,
      submittedByTgId: tgUser.id,
    })
    .where(and(eq(matches.id, match.id), inArray(matches.status, ['PLAYING', 'WAITING_CONFIRM'])))
    .returning();
  if (!claimedWaiting) {
    throw new EndpointError('Матч уже завершён или изменён', { code: 'CONFLICT' });
  }

  const notifiedCount = await notifyScoreConfirmation({
    tournament,
    match,
    playersById,
    submittedByTeam,
    score1,
    score2,
  });

  await syncPublicLiveIfEnabled(tournament.id);
  const snapshot = await getTournamentSnapshot(tournament.id, tgUser.id);
  return { ...snapshot, notifiedCount };
}
