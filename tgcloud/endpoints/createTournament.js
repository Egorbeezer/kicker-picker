import { db, EndpointError } from 'sdk';
import { and, eq, gt } from 'sdk/db';
import { tournaments, tournamentPlayers } from '../schema.js';
import {
  VALID_DYP_MODES,
  upsertUser,
  makeInitials,
  formatPlayerDisplayName,
  getTournamentSnapshot,
  parseBoundedInt,
  syncTournamentAdminIndex,
  notifyBotOwnerAlert,
} from '../lib/helpers.js';
import { publishPublicLivePage } from '../lib/publicLive.js';

const WEEKDAYS_RU = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
];

function formatDefaultTournamentName() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const weekday = WEEKDAYS_RU[now.getDay()];
  return `${dd}.${mm}.${yyyy}, ${weekday} — DYP`;
}

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация Telegram', { code: 'UNAUTHORIZED' });

  await upsertUser(tgUser);

  const oneHourAgoSec = Math.floor(Date.now() / 1000) - 60 * 60;
  const recentTournaments = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(and(eq(tournaments.creatorTgId, tgUser.id), gt(tournaments.createdAt, oneHourAgoSec)))
    .all();

  if (recentTournaments.length >= 20) {
    throw new EndpointError('Слишком много созданных турниров за последний час. Попробуйте позже.', {
      code: 'RATE_LIMITED',
    });
  }

  const name = String(input?.name || formatDefaultTournamentName()).trim().slice(0, 80);
  if (!name) throw new EndpointError('Укажите название турнира', { code: 'INVALID_NAME' });

  const tablesCount = parseBoundedInt(input?.tables, 2, 1, 20);
  const autoRounds = input?.autoRounds !== undefined ? Boolean(input.autoRounds) : true;
  const targetScore = parseBoundedInt(input?.targetScore, 7, 1, 21);
  const winByTwo = Boolean(input?.winByTwo);
  const maxScore = parseBoundedInt(input?.maxScore, targetScore + 2, targetScore, 30);
  const dypMode = VALID_DYP_MODES.includes(input?.dypMode) ? input.dypMode : 'monster';
  const teamFormat =
    input?.teamFormat === 'single' && ['swiss', 'round_robin', 'random_dyp', 'last_one_standing', 'elimination'].includes(dypMode)
      ? 'single'
      : 'pairs';
  const playoffSizeChoices = teamFormat === 'single' ? [2, 4, 8, 16, 32] : [4, 8, 16, 32];
  const playoffSize = playoffSizeChoices.includes(Number(input?.playoffSize))
    ? Number(input.playoffSize)
    : 8;
  const thirdPlaceMatch = input?.thirdPlaceMatch !== undefined ? Boolean(input.thirdPlaceMatch) : true;
  const playoffFormat = ['best_of_1', 'best_of_3', 'best_of_5'].includes(input?.playoffFormat)
    ? input.playoffFormat
    : 'best_of_3';
  const playoffTargetScore = parseBoundedInt(input?.playoffTargetScore, 5, 1, 21);
  const playoffWinByTwo = Boolean(input?.playoffWinByTwo);
  const playoffMaxScore = parseBoundedInt(
    input?.playoffMaxScore,
    playoffTargetScore + 2,
    playoffTargetScore,
    30
  );
  const useBuckets = Boolean(input?.useBuckets);
  const roundRobinLoops = parseBoundedInt(input?.roundRobinLoops, 1, 1, 2);
  const losLives = parseBoundedInt(input?.losLives, 3, 1, 10);
  const skipQualification = Boolean(input?.skipQualification || dypMode === 'elimination');
  const longMatchAlertMin = parseBoundedInt(input?.longMatchAlertMin, 15, 1, 180);
  const scoreReminderMin = parseBoundedInt(input?.scoreReminderMin, 3, 1, 60);

  const [created] = await db
    .insert(tournaments)
    .values({
      name,
      creatorTgId: tgUser.id,
      status: 'REGISTRATION',
      currentRound: 0,
      tablesCount,
      autoRounds,
      dypMode,
      teamFormat,
      roundRobinLoops,
      losLives,
      skipQualification,
      longMatchAlertMin,
      scoreReminderMin,
      useBuckets,
      targetScore,
      winByTwo,
      maxScore,
      playoffSize,
      thirdPlaceMatch,
      playoffFormat,
      playoffTargetScore,
      playoffWinByTwo,
      playoffMaxScore,
    })
    .returning();

  await syncTournamentAdminIndex(created.id, tgUser.id, []);

  if (input?.joinAsPlayer !== false) {
    const displayName = formatPlayerDisplayName(tgUser);
    await db.insert(tournamentPlayers).values({
      tournamentId: created.id,
      tgId: tgUser.id,
      name: displayName,
      initials: makeInitials(displayName),
      isActive: true,
      isGuest: false,
      byesCount: 0,
      sortOrder: 1,
      livesLeft: dypMode === 'last_one_standing' ? losLives : null,
    });
  }

  if (input?.liveEnabled) {
    try {
      await publishPublicLivePage(created.id, { createIfMissing: true });
    } catch (err) {
      console.warn('createTournament live publish failed:', err?.message || err);
      await notifyBotOwnerAlert({
        source: 'createTournament:live',
        message: err?.message || String(err),
        stack: err?.stack || null,
        tgUser,
        context: `tournamentId=${created.id}`,
      });
    }
  }

  return await getTournamentSnapshot(created.id, tgUser.id);
}
