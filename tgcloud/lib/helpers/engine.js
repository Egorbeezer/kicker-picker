import { db, EndpointError } from 'sdk';
import { eq, and, inArray, sql } from 'sdk/db';
import { tournaments, tournamentPlayers, matches } from '../../schema.js';
import {
  computeLeaderboard,
  generateDypRound,
  generatePlayoffFirstRound,
  getNextPlayoffMatches,
  validateMatchScore,
} from '../dyp.js';
import { VALID_DYP_MODES, getActiveTablesList, getMatchRules, getSetsNeededToWin, isTournamentAdmin } from './access.js';
import {
  clearConfirmMessages,
  formatMatchStageLabel,
  formatMatchTeamsSummary,
  notifyRoundStart,
  notifySubmittingTeam,
} from './notifications.js';
import { escapeHtml, formatPlayerDisplayName } from './telegram.js';

/**
 * Списывает (-1) или возвращает (+1) жизнь игрокам проигравшей команды в режиме Last One Standing.
 * @param {{ tournament: any; match: any; winnerTeam?: number; delta: -1 | 1 }} params
 */
export async function adjustLosLivesForMatch({ tournament, match, winnerTeam, delta }) {
  if (!tournament || tournament.dypMode !== 'last_one_standing' || match?.stage === 'PLAYOFF' || !winnerTeam) {
    return;
  }
  const loserIds =
    winnerTeam === 1
      ? [match.team2Player1Id, match.team2Player2Id].filter(Boolean)
      : [match.team1Player1Id, match.team1Player2Id].filter(Boolean);
  const defaultLives = Math.max(1, Number(tournament.losLives) || 3);
  for (const lid of loserIds) {
    const p = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.id, lid))
      .get();
    if (!p) continue;
    const curLives = p.livesLeft !== null && p.livesLeft !== undefined ? p.livesLeft : defaultLives;
    const nextLives = Math.max(0, Math.min(defaultLives, curLives + delta));
    await db
      .update(tournamentPlayers)
      .set({ livesLeft: nextLives })
      .where(eq(tournamentPlayers.id, lid));
  }
}

/**
 * @param {{ tournament: any; match: any; score1: number; score2: number; expectedStatuses?: string[] | null }} params
 */
export async function applyMatchFinish({
  tournament,
  match,
  score1,
  score2,
  expectedStatuses = null,
}) {
  const rules = getMatchRules(tournament, match.stage);
  const validation = validateMatchScore(score1, score2, rules);
  if (!validation.valid) {
    throw new EndpointError(validation.reason || 'Неверный счёт', { code: 'INVALID_SCORE' });
  }

  const neededSets = getSetsNeededToWin(rules.format);
  const prevHistory = Array.isArray(match.setsHistory) ? match.setsHistory : [];
  const nextHistory = [...prevHistory, { score1, score2 }];
  const nextSets1 = (match.setsWon1 || 0) + (validation.winner === 1 ? 1 : 0);
  const nextSets2 = (match.setsWon2 || 0) + (validation.winner === 2 ? 1 : 0);
  const isSeriesOver = nextSets1 >= neededSets || nextSets2 >= neededSets;

  const statusCond =
    Array.isArray(expectedStatuses) && expectedStatuses.length > 0
      ? and(eq(matches.id, match.id), inArray(matches.status, expectedStatuses))
      : eq(matches.id, match.id);

  if (!isSeriesOver) {
    const updatedSet = await db
      .update(matches)
      .set({
        status: 'PLAYING',
        score1: 0,
        score2: 0,
        setsWon1: nextSets1,
        setsWon2: nextSets2,
        setsHistory: nextHistory,
        submittedByTeam: null,
        submittedByTgId: null,
        confirmMessages: null,
      })
      .where(statusCond)
      .returning();
    if (Array.isArray(expectedStatuses) && (!Array.isArray(updatedSet) || updatedSet.length === 0)) {
      throw new EndpointError('Матч уже обработан другим игроком или организатором', {
        code: 'CONFLICT',
      });
    }
    return { seriesOver: false, nextRoundCreated: false, setsWon1: nextSets1, setsWon2: nextSets2 };
  }

  const finishedRows = await db
    .update(matches)
    .set({
      status: 'FINISHED',
      score1,
      score2,
      setsWon1: nextSets1,
      setsWon2: nextSets2,
      setsHistory: nextHistory,
      confirmMessages: null,
      finishedAt: new Date(),
    })
    .where(statusCond)
    .returning();
  if (Array.isArray(expectedStatuses) && (!Array.isArray(finishedRows) || finishedRows.length === 0)) {
    throw new EndpointError('Матч уже завершён другим игроком или организатором', {
      code: 'CONFLICT',
    });
  }

  if (match.stage !== 'PLAYOFF') {
    await adjustLosLivesForMatch({
      tournament,
      match,
      winnerTeam: validation.winner,
      delta: -1,
    });
    if (tournament.pendingPlayoff || tournament.autoRounds) {
      const qualRoundMatches = await db
        .select()
        .from(matches)
        .where(
          and(
            eq(matches.tournamentId, tournament.id),
            eq(matches.stage, 'QUALIFICATION'),
            eq(matches.roundNumber, match.roundNumber)
          )
        )
        .all();

      const allDone =
        qualRoundMatches.length > 0 &&
        qualRoundMatches.every((m) => m.status === 'FINISHED' || m.status === 'CANCELLED');
      if (allDone) {
        if (tournament.pendingPlayoff) {
          await createPlayoffFirstRound(tournament, { silentIfLowPlayers: true });
          return { seriesOver: true, nextRoundCreated: false, playoffStarted: true };
        }
        const created = await createNextQualificationRound(tournament, { silentIfLowPlayers: true });
        return { seriesOver: true, nextRoundCreated: created };
      }
    }
    return { seriesOver: true, nextRoundCreated: false };
  }

  // Check if all playoff matches in this round are finished
  const roundMatches = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.tournamentId, tournament.id),
        eq(matches.stage, 'PLAYOFF'),
        eq(matches.roundNumber, match.roundNumber)
      )
    )
    .all();

  const { done, nextMatches } = getNextPlayoffMatches({
    currentRoundMatches: roundMatches,
    thirdPlaceMatch: tournament.thirdPlaceMatch,
    tablesCount: tournament.tablesCount,
    activeTables: getActiveTablesList(tournament),
  });

  if (done) {
    return { seriesOver: true, nextRoundCreated: false, readyToFinish: true };
  }

  if (nextMatches.length > 0) {
    const targetPlayoffRound = nextMatches[0].roundNumber;
    const claimedPlayoff = await db
      .update(tournaments)
      .set({ currentRound: targetPlayoffRound })
      .where(
        and(
          eq(tournaments.id, tournament.id),
          eq(tournaments.status, 'PLAYOFF'),
          eq(tournaments.currentRound, match.roundNumber)
        )
      )
      .returning();
    if (!Array.isArray(claimedPlayoff) || claimedPlayoff.length === 0) {
      return { seriesOver: true, nextRoundCreated: false };
    }

    const inserted = [];
    for (const nm of nextMatches) {
      const [row] = await db
        .insert(matches)
        .values({
          tournamentId: tournament.id,
          stage: 'PLAYOFF',
          roundNumber: nm.roundNumber,
          bracketSlot: nm.bracketSlot,
          tableNumber: nm.tableNumber,
          team1Player1Id: nm.team1[0],
          team1Player2Id: nm.team1[1] ?? null,
          team2Player1Id: nm.team2[0],
          team2Player2Id: nm.team2[1] ?? null,
          status: 'PLAYING',
        })
        .returning();
      inserted.push(row);
    }

    const allPlayers = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournament.id))
      .all();
    const playersById = new Map(allPlayers.map((p) => [p.id, p]));
    await notifyRoundStart({
      tournament,
      createdMatches: inserted,
      playersById,
      roundNumber: targetPlayoffRound,
    });
    return { seriesOver: true, nextRoundCreated: true };
  }

  return { seriesOver: true, nextRoundCreated: false };
}

/**
 * @param {any} tournament
 * @param {{ silentIfLowPlayers?: boolean; preserveOrder?: boolean; targetRoundNumber?: number | null }} [opts]
 */
export async function createNextQualificationRound(
  tournament,
  { silentIfLowPlayers = false, preserveOrder = false, targetRoundNumber = null } = {}
) {
  const players = (
    await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournament.id))
      .all()
  ).sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));

  const previousMatches = await db
    .select()
    .from(matches)
    .where(and(eq(matches.tournamentId, tournament.id), eq(matches.stage, 'QUALIFICATION')))
    .all();

  const activeTables = getActiveTablesList(tournament);
  const nextRound = targetRoundNumber ?? tournament.currentRound + 1;
  const dypMode = VALID_DYP_MODES.includes(tournament.dypMode) ? tournament.dypMode : 'monster';

  let generated;
  try {
    generated = generateDypRound({
      players,
      previousMatches,
      tablesCount: tournament.tablesCount,
      activeTables,
      dypMode,
      teamFormat: tournament.teamFormat === 'single' ? 'single' : 'pairs',
      roundRobinLoops: Number(tournament.roundRobinLoops) || 1,
      roundNumber: nextRound,
      losLives: Number(tournament.losLives) || 3,
      useBuckets: Boolean(tournament.useBuckets),
      preserveOrder,
    });
  } catch (err) {
    if (silentIfLowPlayers) return false;
    throw new EndpointError(err.message, { code: 'CANNOT_GENERATE_ROUND' });
  }

  if (generated.done) {
    if (silentIfLowPlayers) return false;
    const msg =
      dypMode === 'last_one_standing'
        ? 'Все соперники выбыли — победитель Last One Standing уже определён!'
        : 'Все туры круговой системы уже сыграны — можно запускать плей-офф!';
    throw new EndpointError(msg, { code: 'MODE_COMPLETED' });
  }

  if (targetRoundNumber === null) {
    const claimedRound = await db
      .update(tournaments)
      .set({
        status: 'QUALIFICATION',
        currentRound: nextRound,
        lastRoundByes: generated.byePlayerIds,
        ...(tournament.startedAt ? {} : { startedAt: new Date() }),
      })
      .where(
        and(
          eq(tournaments.id, tournament.id),
          eq(tournaments.currentRound, tournament.currentRound),
          inArray(tournaments.status, ['REGISTRATION', 'QUALIFICATION'])
        )
      )
      .returning();
    if (!Array.isArray(claimedRound) || claimedRound.length === 0) {
      if (silentIfLowPlayers) return false;
      throw new EndpointError('Раунд уже запущен другим запросом', { code: 'CONFLICT' });
    }
  } else {
    await db
      .update(tournaments)
      .set({
        status: 'QUALIFICATION',
        currentRound: nextRound,
        lastRoundByes: generated.byePlayerIds,
        ...(tournament.startedAt ? {} : { startedAt: new Date() }),
      })
      .where(eq(tournaments.id, tournament.id));
  }

  const createdMatches = [];

  for (const pairing of generated.pairings) {
    const [row] = await db
      .insert(matches)
      .values({
        tournamentId: tournament.id,
        stage: 'QUALIFICATION',
        roundNumber: nextRound,
        tableNumber: pairing.tableNumber,
        team1Player1Id: pairing.team1[0],
        team1Player2Id: pairing.team1[1] ?? null,
        team2Player1Id: pairing.team2[0],
        team2Player2Id: pairing.team2[1] ?? null,
        status: 'PLAYING',
      })
      .returning();
    createdMatches.push(row);
  }

  if (generated.byePlayerIds.length > 0) {
    await db
      .update(tournamentPlayers)
      .set({ byesCount: sql`${tournamentPlayers.byesCount} + 1` })
      .where(inArray(tournamentPlayers.id, generated.byePlayerIds));
  }

  const playersById = new Map(players.map((p) => [p.id, p]));
  await notifyRoundStart({
    tournament,
    createdMatches,
    playersById,
    roundNumber: nextRound,
  });

  return true;
}
/**
 * @param {any} tournament
 * @param {{ silentIfLowPlayers?: boolean; overrides?: { playoffSize?: number; thirdPlaceMatch?: boolean } | null }} [opts]
 */
export async function createPlayoffFirstRound(
  tournament,
  { silentIfLowPlayers = false, overrides = null } = {}
) {
  const effectivePlayoffSize =
    overrides?.playoffSize !== undefined &&
    [2, 4, 8, 16, 32].includes(Number(overrides.playoffSize))
      ? Number(overrides.playoffSize)
      : tournament.playoffSize;

  const effectiveThirdPlace =
    overrides?.thirdPlaceMatch !== undefined
      ? Boolean(overrides.thirdPlaceMatch)
      : tournament.thirdPlaceMatch;

  const allMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, tournament.id))
    .all();

  const players = (
    await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournament.id))
      .all()
  ).sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));

  const qualFinishedCount = allMatches.filter(
    (m) => m.status === 'FINISHED' && (!m.stage || m.stage === 'QUALIFICATION')
  ).length;

  const rawLeaderboard =
    qualFinishedCount > 0
      ? computeLeaderboard({
          players,
          matches: allMatches,
          tableConfig: tournament.tableConfig,
        })
      : players
          .filter((p) => p.isActive)
          .map((p, idx) => ({
            playerId: p.id,
            rank: idx + 1,
            isActive: true,
          }));
  const leaderboard = rawLeaderboard.filter((row) => row.isActive !== false);

  let firstRound;
  try {
    firstRound = generatePlayoffFirstRound({
      leaderboard,
      playoffSize: effectivePlayoffSize,
      tablesCount: tournament.tablesCount,
      activeTables: getActiveTablesList(tournament),
      teamFormat: tournament.teamFormat === 'single' ? 'single' : 'pairs',
    });
  } catch (err) {
    if (silentIfLowPlayers) return false;
    throw new EndpointError(err.message, { code: 'CANNOT_START_PLAYOFF' });
  }

  const claimedStart = await db
    .update(tournaments)
    .set({
      status: 'PLAYOFF',
      currentRound: 1,
      autoRounds: false,
      pendingPlayoff: false,
      ...(overrides
        ? {
            playoffSize: effectivePlayoffSize,
            thirdPlaceMatch: effectiveThirdPlace,
          }
        : {}),
      ...(tournament.startedAt ? {} : { startedAt: new Date() }),
    })
    .where(
      and(
        eq(tournaments.id, tournament.id),
        inArray(tournaments.status, ['REGISTRATION', 'QUALIFICATION'])
      )
    )
    .returning();
  if (!Array.isArray(claimedStart) || claimedStart.length === 0) {
    if (silentIfLowPlayers) return false;
    throw new EndpointError('Плей-офф уже запущен', { code: 'CONFLICT' });
  }

  const createdMatches = [];
  for (const m of firstRound) {
    const [row] = await db
      .insert(matches)
      .values({
        tournamentId: tournament.id,
        stage: 'PLAYOFF',
        roundNumber: m.roundNumber,
        bracketSlot: m.bracketSlot,
        tableNumber: m.tableNumber,
        team1Player1Id: m.team1[0],
        team1Player2Id: m.team1[1] ?? null,
        team2Player1Id: m.team2[0],
        team2Player2Id: m.team2[1] ?? null,
        status: 'PLAYING',
      })
      .returning();
    createdMatches.push(row);
  }

  const playersById = new Map(players.map((p) => [p.id, p]));
  await notifyRoundStart({
    tournament,
    createdMatches,
    playersById,
    roundNumber: 1,
  });

  return true;
}

/**
 * Общая CAS-обработка подтверждения или оспаривания счёта (используется в confirmScore.js и callback_query.js).
 * @param {{ tournament: any; match: any; players: any[]; tgUser: any; action: 'confirm' | 'dispute'; excludeMessage?: { chatId: number | string; messageId: number | string } }} params
 */
export async function processScoreConfirmation({
  tournament,
  match,
  players,
  tgUser,
  action,
  excludeMessage = undefined,
}) {
  const myPlayer = players.find((p) => Number(p.tgId) === Number(tgUser.id));
  const isAdmin = isTournamentAdmin(tournament, tgUser.id);
  const inTeam1 =
    myPlayer && (match.team1Player1Id === myPlayer.id || match.team1Player2Id === myPlayer.id);
  const inTeam2 =
    myPlayer && (match.team2Player1Id === myPlayer.id || match.team2Player2Id === myPlayer.id);

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

    const messageText =
      `❌ <b>Счет ${scorePair} оспорен</b> (${actorName})\n` +
      `🏆 ${tourneyName} • ${stageLabel} • Стол ${match.tableNumber}\n\n` +
      `${escapeHtml(t1Names)} — ${escapeHtml(t2Names)}\n` +
      `<i>Матч возвращен в игру.</i>`;

    await clearConfirmMessages({ match, replacementText: messageText, excludeMessage });

    await notifySubmittingTeam({
      match,
      playersById,
      excludeTgId: tgUser.id,
      text:
        `⚠️ <b>Соперники оспорили счет ${scorePair}</b> (Стол ${match.tableNumber})\n` +
        `Уточните результат и отправьте его заново.`,
    });

    return { action: 'dispute', messageText, seriesOver: false };
  }

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

  const messageText =
    `${confirmedHeader}\n` +
    `🏆 ${tourneyName} • ${stageLabel} • Стол ${match.tableNumber}\n\n` +
    `• ${escapeHtml(t1Names)}: <b>${match.score1}</b>\n` +
    `• ${escapeHtml(t2Names)}: <b>${match.score2}</b>`;

  await clearConfirmMessages({ match, replacementText: messageText, excludeMessage });

  await notifySubmittingTeam({
    match,
    playersById,
    excludeTgId: tgUser.id,
    text: messageText,
  });

  return { action: 'confirm', messageText, seriesOver: Boolean(finishRes?.seriesOver) };
}
