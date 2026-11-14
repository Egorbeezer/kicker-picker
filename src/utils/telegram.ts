import { showToast } from './toast';

export interface Insets {
  top: number;
  bottom: number;
}

const positive = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;

const TELEGRAM_HEADER = 48;

export function deviceInsets(root: HTMLElement = document.documentElement): Insets {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
    return { top: 0, bottom: 0 };
  }
  const read = (name: string): number => {
    const parsed = Number.parseFloat(getComputedStyle(root).getPropertyValue(name));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  };
  return { top: read('--env-safe-top'), bottom: read('--env-safe-bottom') };
}

export function installFullscreenInsets(): () => void {
  const root = document.documentElement;
  const apply = () => {
    const tg = window.Telegram?.WebApp;
    const device = deviceInsets(root);
    if (!tg) {
      root.style.setProperty('--tg-inset-top', `${device.top}px`);
      root.style.setProperty('--tg-inset-bottom', `${device.bottom}px`);
      return;
    }
    const reported = {
      top: positive(tg.safeAreaInset?.top) + positive(tg.contentSafeAreaInset?.top),
      bottom: positive(tg.safeAreaInset?.bottom) + positive(tg.contentSafeAreaInset?.bottom),
    };
    const fullscreen = tg.isFullscreen === true || device.top > 0;
    let top;
    let bottom = reported.bottom;
    if (tg.isFullscreen === false && device.top === 0) {
      top = 0;
      bottom = 0;
    } else if (!fullscreen) {
      top = Math.max(reported.top, device.top);
    } else {
      top = reported.top > 0 ? reported.top : device.top + TELEGRAM_HEADER;
      bottom = reported.bottom > 0 ? reported.bottom : device.bottom;
    }
    root.style.setProperty('--tg-inset-top', `${top}px`);
    root.style.setProperty('--tg-inset-bottom', `${bottom}px`);
  };

  apply();
  const tg = window.Telegram?.WebApp;
  tg?.onEvent?.('safeAreaChanged', apply);
  tg?.onEvent?.('contentSafeAreaChanged', apply);
  tg?.onEvent?.('fullscreenChanged', apply);
  tg?.onEvent?.('viewportChanged', apply);
  window.addEventListener('orientationchange', apply);

  return () => {
    tg?.offEvent?.('safeAreaChanged', apply);
    tg?.offEvent?.('contentSafeAreaChanged', apply);
    tg?.offEvent?.('fullscreenChanged', apply);
    tg?.offEvent?.('viewportChanged', apply);
    window.removeEventListener('orientationchange', apply);
  };
}

export function installKeyboardInset(): () => void {
  const root = document.documentElement;
  const apply = () => {
    const heights = [window.visualViewport?.height, window.Telegram?.WebApp?.viewportHeight].filter(
      (value): value is number => typeof value === 'number' && value > 0
    );
    if (heights.length === 0) {
      root.style.setProperty('--keyboard-inset', '0px');
      return;
    }
    const covered = Math.round(window.innerHeight - Math.min(...heights));
    root.style.setProperty('--keyboard-inset', `${covered < 60 ? 0 : covered}px`);
  };
  apply();
  window.visualViewport?.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('scroll', apply);
  window.addEventListener('resize', apply);
  window.Telegram?.WebApp?.onEvent?.('viewportChanged', apply);

  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      const inputType = (target as HTMLInputElement).type;
      if (inputType !== 'checkbox' && inputType !== 'radio') {
        document.body.classList.add('field-focus');
      }
    }
  };
  const onFocusOut = () => {
    setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      const stillField =
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT') &&
        (active as HTMLInputElement).type !== 'checkbox' &&
        (active as HTMLInputElement).type !== 'radio';
      if (!stillField) {
        document.body.classList.remove('field-focus');
      }
    }, 60);
  };

  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);

  return () => {
    window.visualViewport?.removeEventListener('resize', apply);
    window.visualViewport?.removeEventListener('scroll', apply);
    window.removeEventListener('resize', apply);
    window.Telegram?.WebApp?.offEvent?.('viewportChanged', apply);
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
  };
}

export function haptic(type: 'success' | 'warning' | 'error' | 'light' = 'light'): void {
  try {
    const tg = window.Telegram?.WebApp;
    if (!tg?.HapticFeedback) return;
    if (type === 'light') tg.HapticFeedback.impactOccurred('light');
    else tg.HapticFeedback.notificationOccurred(type);
  } catch {
    // ignore unsupported clients
  }
}

export function notify(message: string): void {
  try {
    showToast(message);
  } catch {
    console.warn(message);
  }
}
