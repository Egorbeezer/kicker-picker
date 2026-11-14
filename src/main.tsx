import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { apiClient, isTelegramEnv } from './api/client';
import { applyTheme, currentTheme } from './utils/theme';

applyTheme(currentTheme(), { persist: false });

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      if (!isTelegramEnv()) return;
      const key = `kp_err_${(error.message || '').slice(0, 60)}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      const stack = [error.stack, info.componentStack].filter(Boolean).join('\n').slice(0, 2000);
      void apiClient.reportClientError({
        message: error.message || 'Unknown render error',
        stack,
      });
    } catch {
      // ignore telemetry failure
    }
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
