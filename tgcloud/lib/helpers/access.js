import { db } from 'sdk';
import { eq } from 'sdk/db';
import { tournamentAdmins } from '../../schema.js';

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
