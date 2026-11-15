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
} from './helpers/access.js';
export {
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
  applyMatchFinish,
  createNextQualificationRound,
  createPlayoffFirstRound,
} from './helpers/engine.js';
export {
  computeSnapshotVersion,
  getTournamentSnapshot,
  buildGlobalPlayerProfile,
} from './helpers/snapshot.js';
