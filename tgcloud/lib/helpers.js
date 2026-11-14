import { db, api, EndpointError } from 'sdk';
import { eq, and, desc, inArray, sql } from 'sdk/db';
import { users, tournaments, tournamentPlayers, tournamentAdmins, matches } from '../schema.js';
import {
  computeLeaderboard,
  computeTournamentTimings,
  generateDypRound,
  generatePlayoffFirstRound,
  getNextPlayoffMatches,
  toEpochMs,
  validateMatchScore,
} from './dyp.js';

export const BOT_USERNAME = 'kickerpickerbot';

export async function syncTournamentAdminIndex(tournamentId, creatorTgId, coAdminTgIds = []) {
  if (!tournamentId || typeof db.delete !== 'function' || typeof db.insert !== 'function') return;
  const adminIds = [
    ...new Set(
      [Number(creatorTgId), ...(Array.isArray(coAdminTgIds) ? coAdminTgIds.map(Number) : [])].filter(
        (id) => Number.isFinite(id) && id > 0
      )
    ),
  ];
  await db.delete(tournamentAdmins).where(eq(tournamentAdmins.tournamentId, tournamentId));
  for (const tgId of adminIds) {
    await db
      .insert(tournamentAdmins)
      .values({
        tournamentId,
        tgId,
        role: tgId === Number(creatorTgId) ? 'creator' : 'coadmin',
      })
      .onConflictDoNothing();
  }
}

export function getActiveTablesList(tournament) {
  const count = Math.max(1, Number(tournament?.tablesCount) || 1);
  const disabledSet = new Set(
    Array.isArray(tournament?.disabledTables)
      ? tournament.disabledTables.map((n) => Number(n)).filter((n) => n >= 1 && n <= count)
      : []
  );
  const active = [];
  for (let i = 1; i <= count; i++) {
    if (!disabledSet.has(i)) active.push(i);
  }
  return active.length > 0 ? active : [1];
}

export const VALID_DYP_MODES = [
  'monster',
  'classic',
  'random_dyp',
  'swiss',
  'round_robin',
  'last_one_standing',
  'whist',
  'elimination',
];

export function isTournamentAdmin(tournament, tgId) {
  if (!tournament || !tgId) return false;
  const numericId = Number(tgId);
  if (Number(tournament.creatorTgId) === numericId) return true;
  if (Array.isArray(tournament.coAdminTgIds)) {
    return tournament.coAdminTgIds.map(Number).includes(numericId);
  }
  return false;
}

export function sanitizeTournament(t) {
  if (!t) return null;
  const { publicToken: _omit, ...rest } = t;
  const count = Math.max(1, Number(t.tablesCount) || 1);
  const disabledTables = Array.isArray(t.disabledTables)
    ? [...new Set(t.disabledTables.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= count))].sort(
        (a, b) => a - b
      )
    : [];
  const coAdminTgIds = Array.isArray(t.coAdminTgIds)
    ? [...new Set(t.coAdminTgIds.map(Number).filter((n) => Number.isFinite(n) && n > 0 && n !== Number(t.creatorTgId)))]
    : [];
  return {
    ...rest,
    disabledTables,
    coAdminTgIds,
    dypMode: VALID_DYP_MODES.includes(t.dypMode) ? t.dypMode : 'monster',
    teamFormat: t.teamFormat === 'single' ? 'single' : 'pairs',
    roundRobinLoops: Math.max(1, Math.min(2, Number(t.roundRobinLoops) || 1)),
    losLives: Math.max(1, Math.min(10, Number(t.losLives) || 3)),
    skipQualification: Boolean(t.skipQualification || t.dypMode === 'elimination'),
    longMatchAlertMin: Math.max(1, Math.min(180, Number(t.longMatchAlertMin) || 15)),
    scoreReminderMin: Math.max(1, Math.min(60, Number(t.scoreReminderMin) || 3)),
    useBuckets: Boolean(t.useBuckets),
    publicPath: t.publicPath || null,
  };
}

export function makeInitials(name) {
  const parts = String(name || 'P').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

function uint8ToBase64(bytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    result += chars[(triple >> 18) & 63];
    result += chars[(triple >> 12) & 63];
    result += i + 1 < len ? chars[(triple >> 6) & 63] : '=';
    result += i + 2 < len ? chars[triple & 63] : '=';
  }
  return result;
}

async function fetchUserAvatarDataUrl(tgId) {
  try {
    const photos = await api.getUserProfilePhotos({ user_id: tgId, limit: 1 });
    const sizes = photos?.photos?.[0];
    if (!sizes || sizes.length === 0) return '';
    // Pick smallest thumbnail (~160x160) for fast DB caching and UI rendering
    const thumb = sizes[0];
    const bytes = await api.getFileContent(thumb.file_id);
    if (!bytes || bytes.length === 0) return '';
    return `data:image/jpeg;base64,${uint8ToBase64(bytes)}`;
  } catch (err) {
    console.warn('fetchUserAvatarDataUrl failed:', err?.code, err?.description || err?.message);
    return null;
  }
}

export async function upsertUser(tgUser, { refreshAvatar = false } = {}) {
  if (!tgUser || !tgUser.id) return null;
  const firstName = tgUser.first_name || tgUser.username || `User ${tgUser.id}`;

  const existing = await db
    .select({ photoUrl: users.photoUrl })
    .from(users)
    .where(eq(users.tgId, tgUser.id))
    .get();

  let photoUrl = existing?.photoUrl ?? null;
  if (refreshAvatar || photoUrl === null) {
    const fetched = await fetchUserAvatarDataUrl(tgUser.id);
    if (fetched !== null) {
      photoUrl = fetched;
    } else if (tgUser.photo_url) {
      photoUrl = tgUser.photo_url;
    } else if (photoUrl === null) {
      photoUrl = '';
    }
  }

  await db
    .insert(users)
    .values({
      tgId: tgUser.id,
      username: tgUser.username || null,
      firstName,
      lastName: tgUser.last_name || null,
      photoUrl,
    })
    .onConflictDoUpdate({
      target: users.tgId,
      set: {
        username: tgUser.username || null,
        firstName,
        lastName: tgUser.last_name || null,
        photoUrl,
      },
    });
  return tgUser;
}

export const MINI_APP_URL = 'https://app9226493501.tgcloud.ai/';

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatPlayerDisplayName(tgUser) {
  if (!tgUser) return 'Игрок';
  const full = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (tgUser.username) return `@${tgUser.username}`;
  return `Игрок ${tgUser.id}`;
}

export async function safeSendMessage(params) {
  try {
    return await api.sendMessage(params);
  } catch (err) {
    console.warn('safeSendMessage failed:', err?.code, err?.description || err?.message);
    return null;
  }
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

export function getMatchRules(tournament, stage) {
  if (stage === 'PLAYOFF') {
    return {
      targetScore: tournament.playoffTargetScore,
      winByTwo: tournament.playoffWinByTwo,
      maxScore: tournament.playoffMaxScore,
      format: tournament.playoffFormat,
    };
  }
  return {
    targetScore: tournament.targetScore,
    winByTwo: tournament.winByTwo,
    maxScore: tournament.maxScore,
    format: 'best_of_1',
  };
}

export function getSetsNeededToWin(format) {
  if (format === 'best_of_5') return 3;
  if (format === 'best_of_3') return 2;
  return 1;
}

export async function notifyRoundStart({ tournament, createdMatches, playersById, roundNumber }) {
  for (const m of createdMatches) {
    const { t1, t2, t1Names, t2Names } = formatMatchTeamsSummary(m, playersById);
    const stageLabel =
      m.stage === 'PLAYOFF' ? formatBracketSlotRu(m.bracketSlot) || 'Плей-офф' : `Раунд ${roundNumber}`;

    for (const p of [...t1, ...t2]) {
      if (!p.tgId) continue;
      await safeSendMessage({
        chat_id: p.tgId,
        text:
          `⚽ <b>${escapeHtml(tournament.name)}</b> — ${escapeHtml(stageLabel)}\n` +
          `🪑 <b>Стол ${m.tableNumber}</b>\n\n` +
          `${escapeHtml(t1Names)} <b>VS</b> ${escapeHtml(t2Names)}`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚽ Открыть матч', url: `https://t.me/${BOT_USERNAME}?startapp=${tournament.id}` }],
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
    throw new EndpointError(validation.reason, { code: 'INVALID_SCORE' });
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
    if (tournament.dypMode === 'last_one_standing') {
      const loserIds =
        validation.winner === 1
          ? [match.team2Player1Id, match.team2Player2Id].filter(Boolean)
          : [match.team1Player1Id, match.team1Player2Id].filter(Boolean);
      const defaultLives = Math.max(1, Number(tournament.losLives) || 3);
      for (const lid of loserIds) {
        const p = await db
          .select()
          .from(tournamentPlayers)
          .where(eq(tournamentPlayers.id, lid))
          .get();
        if (p) {
          const curLives = p.livesLeft !== null && p.livesLeft !== undefined ? p.livesLeft : defaultLives;
          await db
            .update(tournamentPlayers)
            .set({ livesLeft: Math.max(0, curLives - 1) })
            .where(eq(tournamentPlayers.id, lid));
        }
      }
    }
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

export async function getTournamentSnapshot(tournamentId, callerTgId) {
  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();
  if (!tournament) return null;

  const players = (
    await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournamentId))
      .all()
  ).sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));

  const allMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId))
    .orderBy(desc(matches.id))
    .all();

  const playersById = new Map(players.map((p) => [p.id, p]));
  const tgIds = [...new Set(players.map((p) => p.tgId).filter(Boolean))];
  const userRows = tgIds.length
    ? await db
        .select({ tgId: users.tgId, photoUrl: users.photoUrl })
        .from(users)
        .where(inArray(users.tgId, tgIds))
        .all()
    : [];
  const avatarByTgId = new Map(
    userRows.map((u) => [u.tgId, u.photoUrl && u.photoUrl.length > 0 ? u.photoUrl : null])
  );
  const getAvatar = (p) => (p?.tgId ? avatarByTgId.get(p.tgId) || null : null);

  const myPlayer = players.find((p) => p.tgId === callerTgId) || null;
  const leaderboard = computeLeaderboard({
    players,
    matches: allMatches,
    tableConfig: tournament.tableConfig,
  }).map((row) => ({
    ...row,
    avatarUrl: row.tgId ? avatarByTgId.get(row.tgId) || null : null,
  }));

  const enrichMatch = (m) => {
    const t1 = [playersById.get(m.team1Player1Id), playersById.get(m.team1Player2Id)].filter(Boolean);
    const t2 = [playersById.get(m.team2Player1Id), playersById.get(m.team2Player2Id)].filter(Boolean);
    const myTeam = myPlayer
      ? t1.some((p) => p.id === myPlayer.id)
        ? 1
        : t2.some((p) => p.id === myPlayer.id)
          ? 2
          : null
      : null;

    return {
      ...m,
      team1Players: t1.map((p) => ({
        id: p.id,
        name: p.name,
        initials: p.initials,
        isGuest: p.isGuest,
        avatarUrl: getAvatar(p),
      })),
      team2Players: t2.map((p) => ({
        id: p.id,
        name: p.name,
        initials: p.initials,
        isGuest: p.isGuest,
        avatarUrl: getAvatar(p),
      })),
      team1Label: t1.map((p) => p.name).join(' & '),
      team2Label: t2.map((p) => p.name).join(' & '),
      myTeam,
    };
  };

  const enrichedMatches = allMatches.map(enrichMatch);

  const currentStage = tournament.status === 'PLAYOFF' ? 'PLAYOFF' : 'QUALIFICATION';
  const currentRoundMatches = enrichedMatches
    .filter((m) => m.stage === currentStage && m.roundNumber === tournament.currentRound)
    .sort((a, b) => a.tableNumber - b.tableNumber);

  const myCurrentMatch =
    myPlayer
      ? enrichedMatches.find(
          (m) => m.myTeam !== null && m.status !== 'FINISHED' && m.status !== 'CANCELLED'
        ) || null
      : null;

  const myHistory = myPlayer
    ? enrichedMatches.filter((m) => m.myTeam !== null && m.status === 'FINISHED')
    : [];

  const activeTables = getActiveTablesList(tournament);
  const timings = computeTournamentTimings({
    tournament,
    matches: allMatches,
    activeTablesCount: activeTables.length,
  });

  return {
    tournament: sanitizeTournament(tournament),
    isAdmin: isTournamentAdmin(tournament, callerTgId),
    isCreator: Number(tournament.creatorTgId) === Number(callerTgId),
    myPlayerId: myPlayer?.id || null,
    players: players.map((p) => ({
      ...p,
      avatarUrl: getAvatar(p),
      points: leaderboard.find((l) => l.playerId === p.id)?.points || 0,
    })),
    leaderboard,
    timings,
    currentRoundMatches,
    playoffMatches: enrichedMatches.filter((m) => m.stage === 'PLAYOFF'),
    myCurrentMatch,
    myHistory,
  };
}

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

  if (overrides && (overrides.playoffSize !== undefined || overrides.thirdPlaceMatch !== undefined)) {
    await db
      .update(tournaments)
      .set({
        playoffSize: effectivePlayoffSize,
        thirdPlaceMatch: effectiveThirdPlace,
      })
      .where(eq(tournaments.id, tournament.id));
  }

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

  const leaderboard =
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
          }));

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

function formatDateRuShort(epochOrDate) {
  const d =
    epochOrDate instanceof Date
      ? epochOrDate
      : typeof epochOrDate === 'number'
        ? new Date(epochOrDate < 1e12 ? epochOrDate * 1000 : epochOrDate)
        : new Date();
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function buildGlobalPlayerProfile({ callerTgId, myTournaments = [], allPlayers = [], allMatches = [] }) {
  const playersById = new Map(allPlayers.map((p) => [p.id, p]));
  const playersByTournament = new Map();
  for (const p of allPlayers) {
    if (!playersByTournament.has(p.tournamentId)) playersByTournament.set(p.tournamentId, []);
    playersByTournament.get(p.tournamentId).push(p);
  }
  const matchesByTournament = new Map();
  for (const m of allMatches) {
    if (!matchesByTournament.has(m.tournamentId)) matchesByTournament.set(m.tournamentId, []);
    matchesByTournament.get(m.tournamentId).push(m);
  }

  let tournamentsPlayed = 0;
  let finishedTournaments = 0;
  let championCount = 0;
  let podiumCount = 0;
  let qualFirstCount = 0;
  let comebackCount = 0;
  let sniperCount = 0;
  let totalMatches = 0;
  let totalWins = 0;
  let totalGoalsFor = 0;

  const partnerMap = new Map(); // key: tgId || name -> { name, tgId, games, wins }
  const opponentMap = new Map(); // key: tgId || name -> { name, tgId, games, wins, losses }
  const timeline = [];

  const sortedTournaments = [...myTournaments].sort((a, b) => a.id - b.id);

  for (const t of sortedTournaments) {
    const tPlayers = playersByTournament.get(t.id) || [];
    const myPlayer = tPlayers.find((p) => Number(p.tgId) === Number(callerTgId));
    if (!myPlayer) continue;

    const tMatches = matchesByTournament.get(t.id) || [];
    const finishedMatches = tMatches.filter((m) => m.status === 'FINISHED');
    const myFinished = finishedMatches.filter((m) =>
      [m.team1Player1Id, m.team1Player2Id, m.team2Player1Id, m.team2Player2Id].includes(myPlayer.id)
    );
    if (myFinished.length > 0) tournamentsPlayed += 1;

    const lb = computeLeaderboard({ players: tPlayers, matches: tMatches, tableConfig: t.tableConfig });
    const myQualRow = lb.find((r) => r.playerId === myPlayer.id);
    if (myQualRow && myQualRow.rank === 1 && myQualRow.games > 0) {
      qualFirstCount += 1;
    }

    let tourneyGames = 0;
    let tourneyWins = 0;
    let tourneyGoals = 0;
    let tourneyOppGoals = 0;

    for (const m of myFinished) {
      const inT1 = m.team1Player1Id === myPlayer.id || m.team1Player2Id === myPlayer.id;
      const myTeamIds = inT1
        ? [m.team1Player1Id, m.team1Player2Id].filter(Boolean)
        : [m.team2Player1Id, m.team2Player2Id].filter(Boolean);
      const oppTeamIds = inT1
        ? [m.team2Player1Id, m.team2Player2Id].filter(Boolean)
        : [m.team1Player1Id, m.team1Player2Id].filter(Boolean);

      const t1Won =
        m.stage === 'PLAYOFF'
          ? m.setsWon1 > m.setsWon2 || (m.setsWon1 === m.setsWon2 && m.score1 > m.score2)
          : m.score1 > m.score2;
      const iWon = (inT1 && t1Won) || (!inT1 && !t1Won);

      totalMatches += 1;
      tourneyGames += 1;
      if (iWon) {
        totalWins += 1;
        tourneyWins += 1;
      }

      const myGoals = inT1 ? m.score1 : m.score2;
      const oppGoals = inT1 ? m.score2 : m.score1;
      totalGoalsFor += myGoals;
      tourneyGoals += myGoals;
      tourneyOppGoals += oppGoals;

      // Detect comeback: won a playoff match after trailing in setsHistory, or winning from lower qual seed by 1 goal
      if (iWon && Array.isArray(m.setsHistory) && m.setsHistory.length >= 2) {
        const s0 = m.setsHistory[0];
        const lostFirstSet = inT1 ? s0.score1 < s0.score2 : s0.score2 < s0.score1;
        if (lostFirstSet) comebackCount += 1;
      }

      for (const pid of myTeamIds) {
        if (pid === myPlayer.id) continue;
        const p = playersById.get(pid);
        if (!p) continue;
        const key = p.tgId ? `tg:${p.tgId}` : `name:${p.name.toLowerCase()}`;
        const cur = partnerMap.get(key) || { name: p.name, tgId: p.tgId ?? null, games: 0, wins: 0 };
        cur.games += 1;
        if (iWon) cur.wins += 1;
        partnerMap.set(key, cur);
      }

      for (const oid of oppTeamIds) {
        const o = playersById.get(oid);
        if (!o) continue;
        const key = o.tgId ? `tg:${o.tgId}` : `name:${o.name.toLowerCase()}`;
        const cur = opponentMap.get(key) || {
          name: o.name,
          tgId: o.tgId ?? null,
          games: 0,
          wins: 0,
          losses: 0,
        };
        cur.games += 1;
        if (iWon) cur.wins += 1;
        else cur.losses += 1;
        opponentMap.set(key, cur);
      }
    }

    if (tourneyGames >= 2 && tourneyGoals - tourneyOppGoals >= 10) {
      sniperCount += 1;
    }

    if (t.status === 'FINISHED') {
      finishedTournaments += 1;
      const finalMatch = finishedMatches.find((m) => m.stage === 'PLAYOFF' && m.bracketSlot === 'FINAL');
      const thirdMatch = finishedMatches.find((m) => m.stage === 'PLAYOFF' && m.bracketSlot === 'THIRD_PLACE');
      if (finalMatch) {
        const t1Won =
          finalMatch.setsWon1 > finalMatch.setsWon2 ||
          (finalMatch.setsWon1 === finalMatch.setsWon2 && finalMatch.score1 > finalMatch.score2);
        const winnerIds = t1Won
          ? [finalMatch.team1Player1Id, finalMatch.team1Player2Id].filter(Boolean)
          : [finalMatch.team2Player1Id, finalMatch.team2Player2Id].filter(Boolean);
        const runnerIds = t1Won
          ? [finalMatch.team2Player1Id, finalMatch.team2Player2Id].filter(Boolean)
          : [finalMatch.team1Player1Id, finalMatch.team1Player2Id].filter(Boolean);
        let thirdIds = [];
        if (thirdMatch) {
          const t3Won =
            thirdMatch.setsWon1 > thirdMatch.setsWon2 ||
            (thirdMatch.setsWon1 === thirdMatch.setsWon2 && thirdMatch.score1 > thirdMatch.score2);
          thirdIds = t3Won
            ? [thirdMatch.team1Player1Id, thirdMatch.team1Player2Id].filter(Boolean)
            : [thirdMatch.team2Player1Id, thirdMatch.team2Player2Id].filter(Boolean);
        }
        if (winnerIds.includes(myPlayer.id)) {
          championCount += 1;
          podiumCount += 1;
        } else if (runnerIds.includes(myPlayer.id) || thirdIds.includes(myPlayer.id)) {
          podiumCount += 1;
        }
      } else if (myQualRow) {
        if (myQualRow.rank === 1) championCount += 1;
        if (myQualRow.rank <= 3) podiumCount += 1;
      }
    }

    if (tourneyGames > 0) {
      timeline.push({
        tournamentId: t.id,
        tournamentName: t.name,
        dateLabel: formatDateRuShort(t.finishedAt || t.startedAt || t.createdAt),
        avgPoints: myQualRow ? myQualRow.ppm : Number(((tourneyWins * 2) / tourneyGames).toFixed(2)),
        wins: tourneyWins,
        games: tourneyGames,
        rank: myQualRow?.rank ?? null,
      });
    }
  }

  const partners = Array.from(partnerMap.values()).map((p) => ({
    ...p,
    winRate: p.games > 0 ? Math.round((p.wins / p.games) * 100) : 0,
  }));

  const mostFrequentPartner =
    partners.length > 0
      ? [...partners].sort((a, b) => b.games - a.games || b.winRate - a.winRate)[0]
      : null;

  const minGamesForBest = partners.some((p) => p.games >= 2) ? 2 : 1;
  const bestPartnerCandidates = partners.filter((p) => p.games >= minGamesForBest);
  const bestPartner =
    bestPartnerCandidates.length > 0
      ? [...bestPartnerCandidates].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || b.games - a.games)[0]
      : null;

  const opponents = Array.from(opponentMap.values()).map((o) => ({
    ...o,
    lossRate: o.games > 0 ? Math.round((o.losses / o.games) * 100) : 0,
  }));
  const minGamesForOpp = opponents.some((o) => o.games >= 2) ? 2 : 1;
  const oppCandidates = opponents.filter((o) => o.games >= minGamesForOpp && o.losses > 0);
  const toughestOpponent =
    oppCandidates.length > 0
      ? [...oppCandidates].sort((a, b) => b.lossRate - a.lossRate || b.losses - a.losses || b.games - a.games)[0]
      : null;

  const badges = [];
  if (championCount > 0) {
    badges.push({
      id: 'champion',
      emoji: '🏆',
      title: 'Победитель турнира',
      description: 'Победа в финале или 1-е место по итогам турнира',
      count: championCount,
    });
  }
  if (podiumCount > 0) {
    badges.push({
      id: 'podium',
      emoji: '🥇',
      title: 'Призёр клуба',
      description: 'Финиш в топ-3 турнира',
      count: podiumCount,
    });
  }
  if (qualFirstCount > 0) {
    badges.push({
      id: 'qual_king',
      emoji: '👑',
      title: 'Лучший в квалификации',
      description: '1-е место по итогам отборочных раундов',
      count: qualFirstCount,
    });
  }
  if (comebackCount > 0) {
    badges.push({
      id: 'comeback',
      emoji: '🔥',
      title: 'Камбэк дня',
      description: 'Волевая победа в серии после проигранного первого сета',
      count: comebackCount,
    });
  }
  if (sniperCount > 0) {
    badges.push({
      id: 'sniper',
      emoji: '🎯',
      title: 'Снайпер',
      description: 'Разница мячей +10 и выше за турнир',
      count: sniperCount,
    });
  }
  if (tournamentsPlayed >= 3) {
    badges.push({
      id: 'veteran',
      emoji: '⚡',
      title: 'Постоянный игрок',
      description: 'Участие в 3 и более турнирах',
      count: tournamentsPlayed,
    });
  }

  return {
    tournamentsPlayed,
    finishedTournaments,
    championCount,
    podiumCount,
    totalMatches,
    totalWins,
    winRate: totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0,
    avgGoalsPerMatch: totalMatches > 0 ? Number((totalGoalsFor / totalMatches).toFixed(1)) : 0,
    mostFrequentPartner,
    bestPartner,
    toughestOpponent,
    timeline: timeline.slice(-10),
    badges,
  };
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

    const { t1, t2, t1Names, t2Names } = formatMatchTeamsSummary(m, playersById);
    const recipients = new Set(adminChatIds);
    for (const p of [...t1, ...t2]) {
      if (p.tgId) recipients.add(p.tgId);
    }

    const elapsedMin = Math.round((nowMs - startMs) / 60000);
    const text =
      nextStage === 1
        ? `⏰ <b>Долгий матч (${elapsedMin} мин)</b>\n` +
          `🏆 ${escapeHtml(tournament.name)} • Стол ${m.tableNumber}\n` +
          `${escapeHtml(t1Names)} <b>VS</b> ${escapeHtml(t2Names)}\n\n` +
          `<i>Если игра закончилась — внесите, пожалуйста, счёт.</i>`
        : `📊 <b>Напоминание: внесите счёт</b>\n` +
          `🏆 ${escapeHtml(tournament.name)} • Стол ${m.tableNumber} (идёт ${elapsedMin} мин)\n` +
          `${escapeHtml(t1Names)} <b>VS</b> ${escapeHtml(t2Names)}`;

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
            [{ text: '⚽ Внести счёт', url: `https://t.me/${BOT_USERNAME}?startapp=${tournament.id}` }],
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

    t.status = 'FINISHED';
    t.finishedAt = finishedAt;
    t.pendingPlayoff = false;
    finishedIds.push(t.id);
  }
  return finishedIds;
}
