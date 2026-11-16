import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { tournaments } from '../schema.js';
import { normalizeTableConfig } from '../lib/dyp.js';
import { VALID_DYP_MODES, getTournamentSnapshot, isTournamentAdmin, syncTournamentAdminIndex } from '../lib/helpers.js';
import { syncPublicLiveIfEnabled } from '../lib/publicLive.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  const tournamentId = Number(input?.tournamentId);

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();

  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });
  if (!isTournamentAdmin(tournament, tgUser?.id)) {
    throw new EndpointError('Только организатор может редактировать турнир', { code: 'FORBIDDEN' });
  }

  const name =
    input?.name !== undefined ? String(input.name).trim() : tournament.name;
  if (!name) throw new EndpointError('Название не может быть пустым', { code: 'INVALID_NAME' });

  const tablesCount =
    input?.tablesCount !== undefined
      ? Math.max(1, Math.min(20, Number(input.tablesCount) || 1))
      : tournament.tablesCount;

  const autoRounds =
    input?.autoRounds !== undefined ? Boolean(input.autoRounds) : tournament.autoRounds;

  const targetScore =
    input?.targetScore !== undefined
      ? Math.max(1, Math.min(21, Number(input.targetScore) || 7))
      : tournament.targetScore;

  const winByTwo =
    input?.winByTwo !== undefined ? Boolean(input.winByTwo) : tournament.winByTwo;

  const maxScore =
    input?.maxScore !== undefined
      ? Math.max(targetScore, Number(input.maxScore) || targetScore + 2)
      : Math.max(targetScore, tournament.maxScore);

  const teamFormat =
    input?.teamFormat !== undefined && ['pairs', 'single'].includes(input.teamFormat)
      ? input.teamFormat
      : tournament.teamFormat || 'pairs';

  const playoffSizeChoices = teamFormat === 'single' ? [2, 4, 8, 16, 32] : [4, 8, 16, 32];
  const playoffSize =
    input?.playoffSize !== undefined && playoffSizeChoices.includes(Number(input.playoffSize))
      ? Number(input.playoffSize)
      : tournament.playoffSize;

  const thirdPlaceMatch =
    input?.thirdPlaceMatch !== undefined
      ? Boolean(input.thirdPlaceMatch)
      : tournament.thirdPlaceMatch;

  const playoffFormat =
    input?.playoffFormat !== undefined &&
    ['best_of_1', 'best_of_3', 'best_of_5'].includes(input.playoffFormat)
      ? input.playoffFormat
      : tournament.playoffFormat;

  const playoffTargetScore =
    input?.playoffTargetScore !== undefined
      ? Math.max(1, Math.min(21, Number(input.playoffTargetScore) || 5))
      : tournament.playoffTargetScore;

  const playoffWinByTwo =
    input?.playoffWinByTwo !== undefined
      ? Boolean(input.playoffWinByTwo)
      : tournament.playoffWinByTwo;

  const playoffMaxScore =
    input?.playoffMaxScore !== undefined
      ? Math.max(playoffTargetScore, Number(input.playoffMaxScore) || playoffTargetScore + 2)
      : Math.max(playoffTargetScore, tournament.playoffMaxScore);

  const tableConfig =
    input?.tableConfig !== undefined
      ? normalizeTableConfig(input.tableConfig).map(({ key, sort, visible }) => ({
          key,
          sort,
          visible,
        }))
      : tournament.tableConfig;

  const dypMode =
    input?.dypMode !== undefined && VALID_DYP_MODES.includes(input.dypMode)
      ? input.dypMode
      : tournament.dypMode || 'monster';

  const roundRobinLoops =
    input?.roundRobinLoops !== undefined
      ? Math.max(1, Math.min(2, Number(input.roundRobinLoops) || 1))
      : tournament.roundRobinLoops || 1;

  const losLives =
    input?.losLives !== undefined
      ? Math.max(1, Math.min(10, Number(input.losLives) || 3))
      : tournament.losLives || 3;

  const skipQualification =
    input?.skipQualification !== undefined
      ? Boolean(input.skipQualification)
      : Boolean(tournament.skipQualification);

  const longMatchAlertMin =
    input?.longMatchAlertMin !== undefined
      ? Math.max(1, Math.min(180, Number(input.longMatchAlertMin) || 15))
      : tournament.longMatchAlertMin || 15;

  const scoreReminderMin =
    input?.scoreReminderMin !== undefined
      ? Math.max(1, Math.min(60, Number(input.scoreReminderMin) || 3))
      : tournament.scoreReminderMin || 3;

  const coAdminTgIds =
    input?.coAdminTgIds !== undefined && Array.isArray(input.coAdminTgIds) && Number(tournament.creatorTgId) === Number(tgUser.id)
      ? [...new Set(input.coAdminTgIds.map(Number).filter((n) => Number.isFinite(n) && n > 0 && n !== Number(tournament.creatorTgId)))]
      : tournament.coAdminTgIds;

  const useBuckets =
    input?.useBuckets !== undefined ? Boolean(input.useBuckets) : Boolean(tournament.useBuckets);

  let disabledTables = Array.isArray(tournament.disabledTables) ? tournament.disabledTables : [];
  if (input?.disabledTables !== undefined) {
    if (!Array.isArray(input.disabledTables)) {
      throw new EndpointError('Некорректный список отключенных столов', { code: 'INVALID_INPUT' });
    }
    disabledTables = [
      ...new Set(
        input.disabledTables
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= tablesCount)
      ),
    ].sort((a, b) => a - b);
  } else {
    disabledTables = disabledTables
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= tablesCount)
      .sort((a, b) => a - b);
  }

  if (disabledTables.length >= tablesCount) {
    throw new EndpointError('Хотя бы один стол должен оставаться активным', {
      code: 'NO_ACTIVE_TABLES',
    });
  }

  await db
    .update(tournaments)
    .set({
      name,
      tablesCount,
      disabledTables,
      autoRounds,
      dypMode,
      teamFormat,
      roundRobinLoops,
      losLives,
      skipQualification,
      longMatchAlertMin,
      scoreReminderMin,
      coAdminTgIds,
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
      tableConfig,
    })
    .where(eq(tournaments.id, tournamentId));

  if (input?.coAdminTgIds !== undefined && Number(tournament.creatorTgId) === Number(tgUser.id)) {
    await syncTournamentAdminIndex(tournamentId, tournament.creatorTgId, coAdminTgIds || []);
  }

  await syncPublicLiveIfEnabled(tournamentId);

  return await getTournamentSnapshot(tournamentId, tgUser.id);
}
