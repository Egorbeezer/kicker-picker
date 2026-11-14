const CHANNEL_NAME = 'kp_single_instance_v1';
const STORAGE_KEY = 'kp_active_instance_v1';

interface InstancePayload {
  instanceId: string;
  tournamentId: number | null;
  ts: number;
}

function readStoredInstance(): InstancePayload | null {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InstancePayload>;
    if (!parsed || typeof parsed.instanceId !== 'string' || typeof parsed.ts !== 'number') {
      return null;
    }
    return {
      instanceId: parsed.instanceId,
      tournamentId: typeof parsed.tournamentId === 'number' ? parsed.tournamentId : null,
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
}

function writeStoredInstance(payload: InstancePayload): void {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage quota / private mode
  }
}

export interface SingleInstanceController {
  announce: (tournamentId: number | null) => void;
  cleanup: () => void;
}

/**
 * Координатор экземпляров Mini App в одном origin:
 * если пользователь открыл новую вкладку/ссылку, свёрнутая старая ставит поллинг на паузу,
 * а при возвращении в неё синхронизирует выбранный турнир и сразу обновляет данные.
 */
export function installSingleInstanceSync(opts: {
  onSuperseded: () => void;
  onActivate: (latestTournamentId: number | null) => void;
}): SingleInstanceController {
  const instanceId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  let lastAnnouncedTs = 0;

  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL_NAME);
    }
  } catch {
    channel = null;
  }

  const handleIncoming = (payload: InstancePayload | null) => {
    if (!payload || payload.instanceId === instanceId) return;
    if (payload.ts >= lastAnnouncedTs) {
      opts.onSuperseded();
    }
  };

  if (channel) {
    channel.onmessage = (event: MessageEvent<InstancePayload>) => {
      handleIncoming(event.data);
    };
  }

  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      handleIncoming(JSON.parse(e.newValue) as InstancePayload);
    } catch {
      // ignore malformed payload
    }
  };
  window.addEventListener('storage', onStorage);

  const announce = (tournamentId: number | null) => {
    const ts = Math.max(Date.now(), lastAnnouncedTs + 1);
    lastAnnouncedTs = ts;
    const payload: InstancePayload = { instanceId, tournamentId, ts };
    writeStoredInstance(payload);
    try {
      channel?.postMessage(payload);
    } catch {
      // ignore closed channel
    }
  };

  const handleReactivate = () => {
    if (document.visibilityState === 'hidden') return;
    const stored = readStoredInstance();
    const latestTournamentId =
      stored && stored.instanceId !== instanceId && stored.tournamentId ? stored.tournamentId : null;
    announce(latestTournamentId);
    opts.onActivate(latestTournamentId);
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      handleReactivate();
    }
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', handleReactivate);
  const tgWebApp = window.Telegram?.WebApp as
    | (NonNullable<NonNullable<typeof window.Telegram>['WebApp']> & {
        onEvent?: (ev: string, cb: () => void) => void;
        offEvent?: (ev: string, cb: () => void) => void;
      })
    | undefined;
  tgWebApp?.onEvent?.('activated', handleReactivate);

  return {
    announce,
    cleanup: () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', handleReactivate);
      window.removeEventListener('storage', onStorage);
      tgWebApp?.offEvent?.('activated', handleReactivate);
      try {
        channel?.close();
      } catch {
        // ignore
      }
    },
  };
}
