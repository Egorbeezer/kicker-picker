import { table, integer, text, boolean, json, index, uniqueIndex, sql } from 'sdk/db';

export const users = table('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tgId: integer('tg_id').unique().notNull(),
  username: text('username'),
  firstName: text('first_name').notNull(),
  lastName: text('last_name'),
  photoUrl: text('photo_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const tournaments = table('tournaments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  creatorTgId: integer('creator_tg_id').notNull(),
  status: text('status').notNull().default('REGISTRATION'), // REGISTRATION | QUALIFICATION | PLAYOFF | FINISHED
  currentRound: integer('current_round').notNull().default(0),
  tablesCount: integer('tables_count').notNull().default(2),
  disabledTables: json('disabled_tables'),
  autoRounds: boolean('auto_rounds').notNull().default(false),
  pendingPlayoff: boolean('pending_playoff').notNull().default(false),
  dypMode: text('dyp_mode').notNull().default('monster'), // monster | classic | random_dyp | swiss | round_robin | last_one_standing | whist | elimination
  teamFormat: text('team_format').notNull().default('pairs'), // pairs | single
  roundRobinLoops: integer('round_robin_loops').notNull().default(1),
  losLives: integer('los_lives').notNull().default(3),
  skipQualification: boolean('skip_qualification').notNull().default(false),
  longMatchAlertMin: integer('long_match_alert_min').notNull().default(15),
  scoreReminderMin: integer('score_reminder_min').notNull().default(3),
  coAdminTgIds: json('co_admin_tg_ids'),
  useBuckets: boolean('use_buckets').notNull().default(false),
  lastRoundByes: json('last_round_byes'),
  targetScore: integer('target_score').notNull().default(5),
  winByTwo: boolean('win_by_two').notNull().default(false),
  maxScore: integer('max_score').notNull().default(7),
  playoffSize: integer('playoff_size').notNull().default(8),
  thirdPlaceMatch: boolean('third_place_match').notNull().default(true),
  playoffFormat: text('playoff_format').notNull().default('best_of_1'), // best_of_1 | best_of_3 | best_of_5
  playoffTargetScore: integer('playoff_target_score').notNull().default(5),
  playoffWinByTwo: boolean('playoff_win_by_two').notNull().default(false),
  playoffMaxScore: integer('playoff_max_score').notNull().default(7),
  tableConfig: json('table_config'),
  publicToken: text('public_token'),
  publicPath: text('public_path'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  creatorIdx: index('idx_tournaments_creator').on(t.creatorTgId),
  statusIdx: index('idx_tournaments_status').on(t.status),
}));

export const tournamentPlayers = table('tournament_players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tournamentId: integer('tournament_id').notNull(),
  tgId: integer('tg_id'),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  isGuest: boolean('is_guest').notNull().default(false),
  dypRole: text('dyp_role'), // 'A' | 'B' | null
  byesCount: integer('byes_count').notNull().default(0),
  sortOrder: integer('sort_order'),
  livesLeft: integer('lives_left'),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  tournamentIdx: index('idx_tp_tournament').on(t.tournamentId),
  tgIdx: index('idx_tp_tg_id').on(t.tgId),
}));

export const matches = table('matches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tournamentId: integer('tournament_id').notNull(),
  stage: text('stage').notNull().default('QUALIFICATION'), // QUALIFICATION | PLAYOFF
  roundNumber: integer('round_number').notNull(),
  bracketSlot: text('bracket_slot'), // QF1, SF1, FINAL, THIRD_PLACE, etc.
  tableNumber: integer('table_number').notNull(),
  team1Player1Id: integer('team1_player1_id').notNull(),
  team1Player2Id: integer('team1_player2_id'),
  team2Player1Id: integer('team2_player1_id').notNull(),
  team2Player2Id: integer('team2_player2_id'),
  status: text('status').notNull().default('PLAYING'), // PLAYING | WAITING_CONFIRM | FINISHED
  score1: integer('score1').notNull().default(0),
  score2: integer('score2').notNull().default(0),
  setsWon1: integer('sets_won1').notNull().default(0),
  setsWon2: integer('sets_won2').notNull().default(0),
  setsHistory: json('sets_history'),
  submittedByTeam: integer('submitted_by_team'),
  submittedByTgId: integer('submitted_by_tg_id'),
  confirmMessages: json('confirm_messages'),
  coinResult: text('coin_result'),
  lastReminderAt: integer('last_reminder_at', { mode: 'timestamp' }),
  reminderStage: integer('reminder_stage').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
}, (t) => ({
  tournamentRoundIdx: index('idx_matches_tournament_round').on(t.tournamentId, t.stage, t.roundNumber),
}));

export const clubPlayers = table('club_players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerTgId: integer('owner_tg_id').notNull(),
  name: text('name').notNull(),
  tgId: integer('tg_id'),
  dypRole: text('dyp_role'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  ownerIdx: index('idx_club_players_owner').on(t.ownerTgId),
}));

export const tournamentAdmins = table('tournament_admins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tournamentId: integer('tournament_id').notNull(),
  tgId: integer('tg_id').notNull(),
  role: text('role').notNull().default('coadmin'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  tgIdx: index('idx_ta_tg_id').on(t.tgId),
  uniqPair: uniqueIndex('uniq_ta_tournament_tg').on(t.tournamentId, t.tgId),
}));

export const clientErrors = table('client_errors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tgId: integer('tg_id'),
  fingerprint: text('fingerprint').notNull(),
  message: text('message').notNull(),
  stack: text('stack'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  fpIdx: index('idx_client_errors_fp').on(t.fingerprint, t.createdAt),
}));
