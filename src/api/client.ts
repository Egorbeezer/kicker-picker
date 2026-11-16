import type { AppStateResponse, ClubPlayer, DypRole, PublicLiveData, TournamentSnapshot } from '../types';
import { hydrateSnapshotAvatars } from '../utils/snapshotHydrate';

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

function validatePublicLivePayload(parsed: unknown): PublicLiveData {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Некорректный формат live-данных');
  }
  const data = parsed as Partial<PublicLiveData>;
  if (data.v !== 1 || !data.tournament?.id || !Array.isArray(data.leaderboard)) {
    throw new Error('Live-трансляция отключена или повреждена');
  }
  return data as PublicLiveData;
}

async function fetchWithRetry(url: string, init?: RequestInit, attempts = 2): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const abortTimer = controller ? setTimeout(() => controller.abort(), 8000) : null;
    try {
      const res = await fetch(url, controller ? { ...init, signal: controller.signal } : init);
      if (abortTimer) clearTimeout(abortTimer);
      if (res.ok || res.status < 500 || i === attempts - 1) {
        return res;
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (abortTimer) clearTimeout(abortTimer);
      lastError = err;
      if (i === attempts - 1) throw err;
    }
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error('Не удалось загрузить live-трансляцию');
}

export async function fetchPublicLive(publicPath: string): Promise<PublicLiveData> {
  if (publicPath.startsWith('kp_')) {
    const res = await fetchWithRetry(
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
    return validatePublicLivePayload(JSON.parse(rawText));
  }

  const res = await fetchWithRetry(
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
  if (!rawText) {
    throw new Error('Live-трансляция отключена или ещё не обновлена');
  }
  return validatePublicLivePayload(JSON.parse(rawText));
}

export function getStartTournamentId(): number | null {
  const raw =
    window.Telegram?.WebApp?.initDataUnsafe?.start_param ||
    new URLSearchParams(window.location.search).get('startapp');
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const inFlightMutations = new Map<string, Promise<unknown>>();
export const DEFAULT_ENDPOINT_TIMEOUT_MS = 15_000;

export async function callEndpoint<T>(
  name: string,
  input: Record<string, unknown> = {},
  opts?: { timeoutMs?: number }
): Promise<T> {
  const serverless = window.Telegram?.WebApp?.Serverless;
  if (!serverless || !window.Telegram?.WebApp?.initData) {
    throw new Error('Откройте приложение внутри Telegram для работы с сервером');
  }

  const timeoutMs = opts?.timeoutMs ?? DEFAULT_ENDPOINT_TIMEOUT_MS;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error('Превышено время ожидания ответа сервера — проверьте интернет'));
          }, timeoutMs)
        : null;

    serverless.call(name, input, (err, result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) {
        const message = err.message || 'Ошибка сервера';
        if (err.type !== 'ENDPOINT_ERROR' && name !== 'reportClientError') {
          try {
            const key = `kp_err_ep_${name}_${message.slice(0, 80)}`;
            if (!sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, '1');
              serverless.call(
                'reportClientError',
                {
                  message: `Endpoint ${name}: ${message}`,
                  source: 'api_client',
                  context: `type=${err.type || 'unknown'}`,
                },
                () => {},
              );
            }
          } catch {
            // ignore reporting failures
          }
        }
        reject(new Error(message));
        return;
      }
      resolve(result as T);
    });
  });
}

/** Вызов мутирующего эндпоинта с дедупликацией одновременных одинаковых запросов. */
export function callMutatingEndpoint<T>(
  name: string,
  input: Record<string, unknown> = {}
): Promise<T> {
  const key = `${name}:${JSON.stringify(input)}`;
  const existing = inFlightMutations.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const promise = callEndpoint<T>(name, input).finally(() => {
    inFlightMutations.delete(key);
  });
  inFlightMutations.set(key, promise);
  return promise;
}

export const apiClient = {
  getState: async (params: { tournamentId?: number; light?: boolean; snapshotVersion?: string } = {}) => {
    const res = await callEndpoint<AppStateResponse>('getState', params, {
      timeoutMs: params.light ? 10_000 : DEFAULT_ENDPOINT_TIMEOUT_MS,
    });
    if (res?.activeTournament) {
      return {
        ...res,
        activeTournament: hydrateSnapshotAvatars(res.activeTournament),
      };
    }
    return res;
  },
  reportClientError: (params: { message: string; stack?: string; source?: string; context?: string }) =>
    callEndpoint<{ ok: boolean; deduplicated?: boolean; rateLimited?: boolean }>('reportClientError', params),
  createTournament: (input: Record<string, unknown>) =>
    callMutatingEndpoint<TournamentSnapshot>('createTournament', input),
  joinTournament: (tournamentId: number) =>
    callMutatingEndpoint<TournamentSnapshot>('joinTournament', { tournamentId }),
  leaveTournament: (tournamentId: number) =>
    callMutatingEndpoint<{ ok: boolean; softPaused: boolean }>('leaveTournament', { tournamentId }),
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
    callMutatingEndpoint<TournamentSnapshot>(
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
  }) => callMutatingEndpoint<TournamentSnapshot>('managePlayer', params),
  manageClubPlayer: (params: {
    action: 'list' | 'add' | 'delete';
    id?: number;
    name?: string;
    tgId?: number | null;
    dypRole?: DypRole;
  }) =>
    params.action === 'list'
      ? callEndpoint<{ clubPlayers: ClubPlayer[] }>('manageClubPlayer', params)
      : callMutatingEndpoint<{ clubPlayers: ClubPlayer[] }>('manageClubPlayer', params),
  togglePlayerActive: (tournamentId: number, playerId: number) =>
    callMutatingEndpoint<TournamentSnapshot>('togglePlayerActive', { tournamentId, playerId }),
  startRound: (tournamentId: number, opts: { preserveOrder?: boolean; regenerateFirst?: boolean } = {}) =>
    callMutatingEndpoint<TournamentSnapshot>('startRound', { tournamentId, ...opts }),
  deleteLastRound: (tournamentId: number) =>
    callMutatingEndpoint<TournamentSnapshot>('deleteLastRound', { tournamentId }),
  adminManageMatch: (params: {
    matchId: number;
    action: 'set_table' | 'reset' | 'toggle_cancel';
    tableNumber?: number;
  }) => callMutatingEndpoint<TournamentSnapshot>('adminManageMatch', params),
  publishLive: (tournamentId: number, enabled = true) =>
    callMutatingEndpoint<TournamentSnapshot>('publishLive', { tournamentId, enabled }),
  submitScore: (params: { matchId: number; score1: number; score2: number; forceAdmin?: boolean }) =>
    callMutatingEndpoint<TournamentSnapshot & { notifiedCount?: number; alreadySubmitted?: boolean }>('submitScore', params),
  confirmScore: (params: { matchId: number; action: 'confirm' | 'dispute' }) =>
    callMutatingEndpoint<TournamentSnapshot>('confirmScore', params),
  remindConfirm: (matchId: number) =>
    callMutatingEndpoint<{ ok: boolean; sentCount: number }>('remindConfirm', { matchId }),
  startPlayoff: (
    tournamentId: number,
    options?: boolean | { cancel?: boolean; playoffSize?: number; thirdPlaceMatch?: boolean }
  ) =>
    callMutatingEndpoint<TournamentSnapshot>(
      'startPlayoff',
      typeof options === 'boolean'
        ? { tournamentId, cancel: options }
        : { tournamentId, ...(options || {}) }
    ),
  finishTournament: (tournamentId: number, reopen = false) =>
    callMutatingEndpoint<TournamentSnapshot>('finishTournament', { tournamentId, reopen }),
  updateTournament: (input: Record<string, unknown>) =>
    callMutatingEndpoint<TournamentSnapshot>('updateTournament', input),
  transferAdmin: (tournamentId: number, playerId: number) =>
    callMutatingEndpoint<TournamentSnapshot>('transferAdmin', { tournamentId, playerId }),
  deleteTournament: (tournamentId: number) =>
    callMutatingEndpoint<{ ok: boolean; deletedId: number }>('deleteTournament', { tournamentId }),
};
