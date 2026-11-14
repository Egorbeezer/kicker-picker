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
    return window.Telegram?.WebApp?.colorScheme === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme, { persist = true } = {}): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
  try {
    const tg = window.Telegram?.WebApp;
    const bg = theme === 'light' ? '#eef1f5' : '#17212b';
    const header = theme === 'light' ? '#ffffff' : '#232e3c';
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
    window.Telegram?.WebApp?.CloudStorage?.setItem(KEY, theme);
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
