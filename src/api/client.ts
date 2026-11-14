import type { AppStateResponse, ClubPlayer, DypRole, PublicLiveData, TournamentSnapshot } from '../types';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            allows_write_to_pm?: boolean;
          };
          start_param?: string;
        };
        themeParams?: Record<string, string>;
        colorScheme?: 'light' | 'dark';
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        CloudStorage?: {
          getItem: (key: string, cb: (err: unknown, value?: string) => void) => void;
          setItem: (key: string, value: string, cb?: (err: unknown, stored?: boolean) => void) => void;
        };
        isFullscreen?: boolean;
        viewportHeight?: number;
        viewportStableHeight?: number;
        safeAreaInset?: { top?: number; bottom?: number };
        contentSafeAreaInset?: { top?: number; bottom?: number };
        onEvent?: (event: string, cb: () => void) => void;
        offEvent?: (event: string, cb: () => void) => void;
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
        };
        ready?: () => void;
        expand?: () => void;
        requestWriteAccess?: (callback?: (granted: boolean) => void) => void;
        openTelegramLink?: (url: string) => void;
        shareMessage?: (msgId: string, callback?: (sent: boolean) => void) => void;
        Serverless?: {
          call: (
            endpoint: string,
            input: Record<string, unknown>,
            callback: (err: { message?: string; type?: string; parameters?: Record<string, unknown> } | null, result: unknown) => void
          ) => void;
        };
      };
    };
  }
}

export function isTelegramEnv(): boolean {
  return Boolean(window.Telegram?.WebApp?.initData && window.Telegram?.WebApp?.Serverless);
}

export function getLivePathFromUrl(): string | null {
  const raw = new URLSearchParams(window.location.search).get('live');
  const trimmed = raw ? raw.trim() : '';
  return trimmed ? trimmed : null;
}

export function buildPublicLiveUrl(publicPath: string): string {
  return `${window.location.origin}/?live=${encodeURIComponent(publicPath)}`;
}

function extractTextFromTelegraphNode(node: unknown): string {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const children = (node as { children?: unknown[] }).children;
  if (!Array.isArray(children)) return '';
  return children.map(extractTextFromTelegraphNode).join('');
}

export async function fetchPublicLive(publicPath: string): Promise<PublicLiveData> {
  if (publicPath.startsWith('kp_')) {
    const res = await fetch(
      `https://textdb.dev/api/data/${encodeURIComponent(publicPath)}?_=${Date.now()}`,
      { cache: 'no-store' }
    );
    if (!res.ok) {
      throw new Error('Не удалось загрузить live-трансляцию');
    }
    const rawText = (await res.text()).trim();
    if (!rawText) {
      throw new Error('Live-трансляция отключена или ещё не обновлена');
    }
    return JSON.parse(rawText) as PublicLiveData;
  }

  const res = await fetch(
    `https://api.telegra.ph/getPage/${encodeURIComponent(publicPath)}?return_content=true`,
    { cache: 'no-store' }
  );
  if (!res.ok) {
    throw new Error('Не удалось загрузить live-трансляцию');
  }
  const json = (await res.json()) as {
    ok?: boolean;
    error?: string;
    result?: { content?: unknown[] };
  };
  if (!json?.ok || !Array.isArray(json.result?.content)) {
    throw new Error(json?.error || 'Live-страница не найдена');
  }
  const rawText = json.result.content.map(extractTextFromTelegraphNode).join('').trim();
  return JSON.parse(rawText) as PublicLiveData;
}

export function getStartTournamentId(): number | null {
  const raw =
    window.Telegram?.WebApp?.initDataUnsafe?.start_param ||
    new URLSearchParams(window.location.search).get('startapp');
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function callEndpoint<T>(name: string, input: Record<string, unknown> = {}): Promise<T> {
  const serverless = window.Telegram?.WebApp?.Serverless;
  if (!serverless || !window.Telegram?.WebApp?.initData) {
    throw new Error('Откройте приложение внутри Telegram для работы с сервером');
  }

  return new Promise<T>((resolve, reject) => {
    serverless.call(name, input, (err, result) => {
      if (err) {
        reject(new Error(err.message || 'Ошибка сервера'));
        return;
      }
      resolve(result as T);
    });
  });
}

export const apiClient = {
  getState: (params: { tournamentId?: number; light?: boolean } = {}) =>
    callEndpoint<AppStateResponse>('getState', params),
  reportClientError: (params: { message: string; stack?: string }) =>
    callEndpoint<{ ok: boolean; deduplicated?: boolean }>('reportClientError', params),
  createTournament: (input: Record<string, unknown>) =>
    callEndpoint<TournamentSnapshot>('createTournament', input),
  joinTournament: (tournamentId: number) =>
    callEndpoint<TournamentSnapshot>('joinTournament', { tournamentId }),
  leaveTournament: (tournamentId: number) =>
    callEndpoint<{ ok: boolean; softPaused: boolean }>('leaveTournament', { tournamentId }),
  addGuestPlayer: (
    tournamentId: number,
    payload:
      | string
      | {
          name?: string;
          names?: string[] | string;
          shuffle?: boolean;
          dypRole?: DypRole;
          clubPlayerIds?: number[];
          saveToClub?: boolean;
        }
  ) =>
    callEndpoint<TournamentSnapshot>(
      'addGuestPlayer',
      typeof payload === 'string'
        ? { tournamentId, name: payload }
        : { tournamentId, ...payload }
    ),
  managePlayer: (params: {
    tournamentId: number;
    playerId?: number;
    action:
      | 'rename'
      | 'set_role'
      | 'delete_player'
      | 'substitute'
      | 'move_seeding'
      | 'shuffle_seeding'
      | 'toggle_coadmin';
    name?: string;
    dypRole?: DypRole;
    replacementName?: string;
    replacementTgId?: number | null;
    direction?: 'up' | 'down';
  }) => callEndpoint<TournamentSnapshot>('managePlayer', params),
  manageClubPlayer: (params: {
    action: 'list' | 'add' | 'delete';
    id?: number;
    name?: string;
    tgId?: number | null;
    dypRole?: DypRole;
  }) => callEndpoint<{ clubPlayers: ClubPlayer[] }>('manageClubPlayer', params),
  togglePlayerActive: (tournamentId: number, playerId: number) =>
    callEndpoint<TournamentSnapshot>('togglePlayerActive', { tournamentId, playerId }),
  startRound: (tournamentId: number, opts: { preserveOrder?: boolean; regenerateFirst?: boolean } = {}) =>
    callEndpoint<TournamentSnapshot>('startRound', { tournamentId, ...opts }),
  deleteLastRound: (tournamentId: number) =>
    callEndpoint<TournamentSnapshot>('deleteLastRound', { tournamentId }),
  adminManageMatch: (params: {
    matchId: number;
    action: 'set_table' | 'reset' | 'toggle_cancel';
    tableNumber?: number;
  }) => callEndpoint<TournamentSnapshot>('adminManageMatch', params),
  publishLive: (tournamentId: number, enabled = true) =>
    callEndpoint<TournamentSnapshot>('publishLive', { tournamentId, enabled }),
  submitScore: (params: { matchId: number; score1: number; score2: number; forceAdmin?: boolean }) =>
    callEndpoint<TournamentSnapshot & { notifiedCount?: number }>('submitScore', params),
  confirmScore: (params: { matchId: number; action: 'confirm' | 'dispute' }) =>
    callEndpoint<TournamentSnapshot>('confirmScore', params),
  remindConfirm: (matchId: number) =>
    callEndpoint<{ ok: boolean; sentCount: number }>('remindConfirm', { matchId }),
  startPlayoff: (
    tournamentId: number,
    options?: boolean | { cancel?: boolean; playoffSize?: number; thirdPlaceMatch?: boolean }
  ) =>
    callEndpoint<TournamentSnapshot>(
      'startPlayoff',
      typeof options === 'boolean'
        ? { tournamentId, cancel: options }
        : { tournamentId, ...(options || {}) }
    ),
  finishTournament: (tournamentId: number, reopen = false) =>
    callEndpoint<TournamentSnapshot>('finishTournament', { tournamentId, reopen }),
  updateTournament: (input: Record<string, unknown>) =>
    callEndpoint<TournamentSnapshot>('updateTournament', input),
  transferAdmin: (tournamentId: number, playerId: number) =>
    callEndpoint<TournamentSnapshot>('transferAdmin', { tournamentId, playerId }),
  deleteTournament: (tournamentId: number) =>
    callEndpoint<{ ok: boolean; deletedId: number }>('deleteTournament', { tournamentId }),
  shareLeaderboard: (params: { tournamentId: number; imageBase64: string; kind?: 'standings' | 'podium' | 'playoff' }) =>
    callEndpoint<{ sentToPm: boolean; preparedMessageId: string | null }>('shareLeaderboard', params),
};
