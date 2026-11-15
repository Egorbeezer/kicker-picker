import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { apiClient, isTelegramEnv } from './api/client';
import { applyTheme, currentTheme } from './utils/theme';
import { openTelegramChat, SUPPORT_BUTTON, SUPPORT_HINT } from './support';

applyTheme(currentTheme(), { persist: false });

function reportUiErrorOnce(message: string, stack?: string, source = 'miniapp') {
  try {
    if (!isTelegramEnv()) return;
    const cleanMessage = (message || 'Unknown error').slice(0, 400);
    const key = `kp_err_${source}_${cleanMessage.slice(0, 60)}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    void apiClient.reportClientError({
      message: cleanMessage,
      stack: stack ? stack.slice(0, 2000) : undefined,
      source,
    });
  } catch {
    // ignore telemetry failure
  }
}

window.addEventListener('error', (event) => {
  const err = event.error instanceof Error ? event.error : null;
  const message = err?.message || event.message || 'Unhandled window error';
  const stack = err?.stack || `${event.filename || ''}:${event.lineno || 0}:${event.colno || 0}`;
  reportUiErrorOnce(message, stack, 'window_error');
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason || 'Unhandled rejection');
  const stack = reason instanceof Error ? reason.stack : undefined;
  reportUiErrorOnce(message, stack, 'unhandled_rejection');
});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const stack = [error.stack, info.componentStack].filter(Boolean).join('\n');
    reportUiErrorOnce(error.message || 'Unknown render error', stack, 'error_boundary');
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-full max-w-md mx-auto h-[100dvh] bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center p-6 text-center gap-3">
          <div className="text-lg font-bold">Не удалось открыть экран</div>
          <div className="text-xs text-[var(--muted)] break-all max-w-full">
            {this.state.error.message || 'Неизвестная ошибка интерфейса'}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn btn-primary px-5 py-2.5 text-sm"
          >
            Обновить
          </button>
          <p className="text-xs text-[var(--muted)] max-w-xs mt-1">{SUPPORT_HINT}</p>
          <button
            type="button"
            onClick={() => openTelegramChat()}
            className="w-full max-w-xs py-2.5 px-4 rounded-2xl bg-[var(--bg-3)] border border-[var(--border-strong)] text-[var(--text)] text-sm font-semibold active:scale-95 transition-transform"
          >
            {SUPPORT_BUTTON}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
