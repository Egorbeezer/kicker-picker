export type Theme = 'dark' | 'light';

const KEY = 'kp-theme';

function readLocalTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore storage errors in restricted webviews
  }
  return null;
}

export function currentTheme(): Theme {
  const local = readLocalTheme();
  if (local) return local;
  try {
    return window.Telegram?.WebApp?.colorScheme === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function hasCloudStorage(): boolean {
  const wa = window.Telegram?.WebApp as
    | { initData?: string; isVersionAtLeast?: (v: string) => boolean; CloudStorage?: { getItem?: unknown; setItem?: unknown } }
    | undefined;
  if (!wa?.initData || !wa.CloudStorage) return false;
  return typeof wa.isVersionAtLeast === 'function' ? wa.isVersionAtLeast('6.9') : true;
}

export function applyTheme(theme: Theme, { persist = true } = {}): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
  try {
    const tg = window.Telegram?.WebApp;
    const bg = theme === 'light' ? '#FFFFFF' : '#121511';
    const header = theme === 'light' ? '#FFFFFF' : '#121511';
    tg?.setBackgroundColor?.(bg);
    tg?.setHeaderColor?.(header);
  } catch {
    // ignore unsupported Telegram WebApp clients
  }

  if (!persist) return;

  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // ignore storage quota errors
  }

  try {
    if (hasCloudStorage()) {
      window.Telegram?.WebApp?.CloudStorage?.setItem(KEY, theme);
    }
  } catch {
    // ignore unsupported CloudStorage
  }
}

/**
 * Восстанавливает сохраненную тему из Telegram CloudStorage,
 * если localStorage в WebView был очищен после закрытия приложения.
 */
export function hydrateSavedTheme(onResolved: (theme: Theme) => void): void {
  const local = readLocalTheme();
  if (local) {
    applyTheme(local, { persist: true });
    onResolved(local);
    return;
  }
  try {
    if (!hasCloudStorage()) return;
    const cloud = window.Telegram?.WebApp?.CloudStorage;
    if (!cloud?.getItem) return;
    cloud.getItem(KEY, (err, value) => {
      if (!err && (value === 'dark' || value === 'light')) {
        applyTheme(value, { persist: true });
        onResolved(value);
      }
    });
  } catch {
    // ignore
  }
}
