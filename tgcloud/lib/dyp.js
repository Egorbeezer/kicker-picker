/**
 * Facade re-exporting DYP tournament engine modules.
 */
export { DEFAULT_TABLE_COLUMNS, normalizeTableConfig, validateMatchScore } from './dyp/config.js';
export { buildPenaltyMaps, generateDypRound } from './dyp/rounds.js';
export { computeLeaderboard, toEpochMs, computeTournamentTimings } from './dyp/standings.js';
export { generatePlayoffFirstRound, getNextPlayoffMatches } from './dyp/playoff.js';
