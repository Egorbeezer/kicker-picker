import { db, EndpointError } from 'sdk';
import { and, eq, gt } from 'sdk/db';
import { tournaments, tournamentPlayers } from '../schema.js';
import {
  VALID_DYP_MODES,
  upsertUser,
  makeInitials,
  formatPlayerDisplayName,
  getTournamentSnapshot,
  syncTournamentAdminIndex,
} from '../lib/helpers.js';

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

  const name = String(input?.name || formatDefaultTournamentName()).trim();
  if (!name) throw new EndpointError('Укажите название турнира', { code: 'INVALID_NAME' });

  const tablesCount = Math.max(1, Math.min(20, Number(input?.tables) || 2));
  const autoRounds = input?.autoRounds !== undefined ? Boolean(input.autoRounds) : true;
  const targetScore = Math.max(1, Math.min(21, Number(input?.targetScore) || 7));
  const winByTwo = Boolean(input?.winByTwo);
  const maxScore = Math.max(targetScore, Number(input?.maxScore) || targetScore + 2);
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
  const playoffTargetScore = Math.max(1, Math.min(21, Number(input?.playoffTargetScore) || 5));
  const playoffWinByTwo = Boolean(input?.playoffWinByTwo);
  const playoffMaxScore = Math.max(
    playoffTargetScore,
    Number(input?.playoffMaxScore) || playoffTargetScore + 2
  );
  const useBuckets = Boolean(input?.useBuckets);
  const roundRobinLoops = Math.max(1, Math.min(2, Number(input?.roundRobinLoops) || 1));
  const losLives = Math.max(1, Math.min(10, Number(input?.losLives) || 3));
  const skipQualification = Boolean(input?.skipQualification || dypMode === 'elimination');
  const longMatchAlertMin = Math.max(1, Math.min(180, Number(input?.longMatchAlertMin) || 15));
  const scoreReminderMin = Math.max(1, Math.min(60, Number(input?.scoreReminderMin) || 3));

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

  return await getTournamentSnapshot(created.id, tgUser.id);
}
