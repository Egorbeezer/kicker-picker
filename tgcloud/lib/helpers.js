/**
 * Facade re-exporting backend helper modules.
 */
export {
  BOT_USERNAME,
  BOT_OWNER_USERNAME,
  notifyBotOwnerAlert,
  makeInitials,
  upsertUser,
  buildMainAppLink,
  escapeHtml,
  formatPlayerDisplayName,
  safeSendMessage,
} from './helpers/telegram.js';
export {
  syncTournamentAdminIndex,
  getActiveTablesList,
  VALID_DYP_MODES,
  isTournamentAdmin,
  sanitizeTournament,
  getMatchRules,
  getSetsNeededToWin,
  parseBoundedInt,
} from './helpers/access.js';
export {
  formatMatchTeamsColumns,
  formatMatchTeamsHtml,
  formatMatchTeamsSummary,
  formatBracketSlotRu,
  formatMatchStageLabel,
  clearConfirmMessages,
  notifySubmittingTeam,
  notifyRoundStart,
  notifyScoreConfirmation,
  checkAndSendLongMatchReminders,
  autoFinishExpiredTournaments,
} from './helpers/notifications.js';
export {
  adjustLosLivesForMatch,
  applyMatchFinish,
  createNextQualificationRound,
  createPlayoffFirstRound,
  processScoreConfirmation,
} from './helpers/engine.js';
export {
  computeSnapshotVersion,
  getTournamentSnapshot,
  buildGlobalPlayerProfile,
} from './helpers/snapshot.js';
