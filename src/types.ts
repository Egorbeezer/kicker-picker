export type TournamentStatus = 'REGISTRATION' | 'QUALIFICATION' | 'PLAYOFF' | 'FINISHED';
export type PlayoffFormat = 'best_of_1' | 'best_of_3' | 'best_of_5';
export type DypMode =
  | 'monster'
  | 'classic'
  | 'random_dyp'
  | 'swiss'
  | 'round_robin'
  | 'last_one_standing'
  | 'whist'
  | 'elimination';
export type TeamFormat = 'pairs' | 'single';
export type DypRole = 'A' | 'B' | null;
export type MatchStatus = 'PLAYING' | 'WAITING_CONFIRM' | 'FINISHED' | 'CANCELLED';
export type TableColumnKey =
  | 'wins'
  | 'ppm'
  | 'fairPpm'
  | 'points'
  | 'diff'
  | 'games'
  | 'losses'
  | 'goalsFor'
  | 'goalsAgainst'
  | 'winRate'
  | 'buchholz'
  | 'avgBuchholz'
  | 'sonnebornBerger'
  | 'name';

export interface TableColumnConfig {
  key: TableColumnKey;
  sort: boolean;
  visible: boolean;
}

export interface Tournament {
  id: number;
  name: string;
  creatorTgId: number;
  status: TournamentStatus;
  currentRound: number;
  tablesCount: number;
  disabledTables?: number[] | null;
  autoRounds: boolean;
  pendingPlayoff: boolean;
  dypMode?: DypMode;
  teamFormat?: TeamFormat;
  roundRobinLoops?: number;
  losLives?: number;
  skipQualification?: boolean;
  longMatchAlertMin?: number;
  scoreReminderMin?: number;
  coAdminTgIds?: number[] | null;
  useBuckets?: boolean;
  targetScore: number;
  winByTwo: boolean;
  maxScore: number;
  playoffSize: number;
  thirdPlaceMatch: boolean;
  playoffFormat: PlayoffFormat;
  playoffTargetScore: number;
  playoffWinByTwo: boolean;
  playoffMaxScore: number;
  tableConfig?: TableColumnConfig[] | null;
  publicPath?: string | null;
  startedAt?: string | number | null;
  finishedAt?: string | number | null;
  createdAt?: string | number | null;
}

export interface TournamentPlayer {
  id: number;
  tournamentId: number;
  tgId: number | null;
  name: string;
  initials: string;
  isActive: boolean;
  isGuest: boolean;
  dypRole?: DypRole;
  avatarUrl?: string | null;
  byesCount: number;
  sortOrder?: number | null;
  livesLeft?: number | null;
  points?: number;
}

export interface MatchPlayerInfo {
  id: number;
  name: string;
  initials: string;
  isGuest?: boolean;
  dypRole?: DypRole;
  avatarUrl?: string | null;
}

export interface MatchItem {
  id: number;
  tournamentId?: number;
  stage: 'QUALIFICATION' | 'PLAYOFF';
  roundNumber: number;
  bracketSlot: string | null;
  tableNumber: number;
  team1Player1Id?: number;
  team1Player2Id?: number | null;
  team2Player1Id?: number;
  team2Player2Id?: number | null;
  team1Players: MatchPlayerInfo[];
  team2Players: MatchPlayerInfo[];
  team1Label: string;
  team2Label: string;
  myTeam?: 1 | 2 | null;
  status: MatchStatus;
  score1: number;
  score2: number;
  setsWon1: number;
  setsWon2: number;
  setsHistory: Array<{ score1: number; score2: number }> | null;
  submittedByTeam?: 1 | 2 | null;
  submittedByTgId?: number | null;
  createdAt?: string | number | null;
  finishedAt?: string | number | null;
}

export interface LeaderboardRow {
  rank: number;
  playerId: number;
  tgId?: number | null;
  name: string;
  initials: string;
  isActive: boolean;
  isGuest?: boolean;
  dypRole?: DypRole;
  avatarUrl?: string | null;
  byesCount: number;
  games: number;
  wins: number;
  losses?: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  diff: number;
  ppm: number;
  fairPpm?: number;
  winRate?: number;
  buchholz?: number;
  avgBuchholz?: number;
  sonnebornBerger?: number;
  livesLeft?: number | null;
  isBelowGameThreshold?: boolean;
}

export interface TournamentTimings {
  playedCount: number;
  openCount: number;
  totalCount: number;
  progressPercent: number;
  avgMatchSeconds: number | null;
  avgMatchMinutes: number | null;
  elapsedMinutes: number;
  remainingMinutes: number | null;
  estimatedEndAt: number | null;
  activeTablesCount: number;
}

export interface TournamentSnapshot {
  snapshotVersion?: string;
  tournament: Tournament;
  isAdmin: boolean;
  isCreator?: boolean;
  myPlayerId: number | null;
  players: TournamentPlayer[];
  leaderboard: LeaderboardRow[];
  timings?: TournamentTimings;
  currentRoundMatches: MatchItem[];
  playoffMatches: MatchItem[];
  allMatches?: MatchItem[];
  myCurrentMatch: MatchItem | null;
  myHistory: MatchItem[];
}

export interface PublicLiveData {
  v: number;
  updatedAt: number;
  tournament: Tournament;
  timings?: TournamentTimings | null;
  leaderboard: LeaderboardRow[];
  currentRoundMatches: MatchItem[];
  playoffMatches: MatchItem[];
}

export interface TournamentHistoryItem extends Tournament {
  participantsCount: number;
  myStats: {
    playerId: number;
    rank: number;
    games: number;
    wins: number;
    losses: number;
    points: number;
    diff: number;
    ppm: number;
  } | null;
}

export interface ClubPlayer {
  id: number;
  ownerTgId: number;
  name: string;
  tgId: number | null;
  dypRole: DypRole;
}

export interface PartnerAnalyticsItem {
  name: string;
  tgId: number | null;
  games: number;
  wins: number;
  winRate: number;
}

export interface OpponentAnalyticsItem {
  name: string;
  tgId: number | null;
  games: number;
  wins: number;
  losses: number;
  lossRate: number;
}

export interface ProfileTimelineItem {
  tournamentId: number;
  tournamentName: string;
  dateLabel: string;
  avgPoints: number;
  wins: number;
  games: number;
  rank: number | null;
}

export interface PlayerBadgeItem {
  id: string;
  emoji: string;
  title: string;
  description: string;
  count: number;
}

export interface PlayerGlobalProfile {
  tournamentsPlayed: number;
  finishedTournaments: number;
  championCount: number;
  podiumCount: number;
  totalMatches: number;
  totalWins: number;
  winRate: number;
  avgGoalsPerMatch: number;
  mostFrequentPartner: PartnerAnalyticsItem | null;
  bestPartner: PartnerAnalyticsItem | null;
  toughestOpponent: OpponentAnalyticsItem | null;
  timeline: ProfileTimelineItem[];
  badges: PlayerBadgeItem[];
}

export interface AppStateResponse {
  user: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    avatarUrl?: string | null;
  };
  tournaments?: Tournament[];
  tournamentHistory?: TournamentHistoryItem[];
  activeTournament?: TournamentSnapshot | null;
  clubPlayers?: ClubPlayer[];
  playerProfile?: PlayerGlobalProfile | null;
  light?: boolean;
  unchanged?: boolean;
  snapshotVersion?: string;
}

export interface CreateTournamentForm {
  name: string;
  tables: number;
  autoRounds: boolean;
  dypMode: DypMode;
  teamFormat: TeamFormat;
  roundRobinLoops: number;
  losLives: number;
  skipQualification: boolean;
  longMatchAlertMin: number;
  scoreReminderMin: number;
  useBuckets: boolean;
  targetScore: number;
  winByTwo: boolean;
  maxScore: number;
  playoffSize: number;
  thirdPlaceMatch: boolean;
  playoffFormat: PlayoffFormat;
  playoffTargetScore: number;
  playoffWinByTwo: boolean;
  playoffMaxScore: number;
  liveEnabled: boolean;
}
