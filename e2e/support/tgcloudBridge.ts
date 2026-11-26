import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { createE2eSqliteRuntime } from './sqliteRuntime.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

export interface TestTgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  allows_write_to_pm?: boolean;
}

interface EndpointCallResponse {
  ok: boolean;
  result?: unknown;
  error?: { message: string; type: string; parameters?: Record<string, unknown> };
}

export class E2eBackendHarness {
  private runtime = createE2eSqliteRuntime();
  private viteSsr: ViteDevServer | null = null;
  private endpoints = new Map<string, (input: unknown, ctx: unknown) => Promise<unknown>>();

  async init() {
    (globalThis as unknown as Record<string, unknown>).__kpE2eRuntime = this.runtime;
    if (!this.viteSsr) {
      this.viteSsr = await createServer({
        root: ROOT_DIR,
        logLevel: 'error',
        appType: 'custom',
        server: { middlewareMode: true },
        optimizeDeps: { noDiscovery: true },
        resolve: {
          alias: [
            { find: /^sdk\/db$/, replacement: path.join(__dirname, 'sdk-db.mjs') },
            { find: /^sdk$/, replacement: path.join(__dirname, 'sdk.mjs') },
          ],
        },
      });
    }
  }

  reset() {
    this.runtime.reset();
  }

  getSqlite() {
    return this.runtime.getSqlite();
  }

  async callEndpoint(name: string, input: Record<string, unknown>, user: TestTgUser) {
    await this.init();
    let handler = this.endpoints.get(name);
    if (!handler) {
      const mod = await this.viteSsr!.ssrLoadModule(
        path.join(ROOT_DIR, 'tgcloud/endpoints', `${name}.js`)
      );
      handler = mod.default;
      this.endpoints.set(name, handler!);
    }
    return handler!(input, { initData: { user } });
  }

  async dispose() {
    if (this.viteSsr) {
      await this.viteSsr.close();
      this.viteSsr = null;
      this.endpoints.clear();
    }
  }
}

export async function attachTelegramBridge(
  page: Page,
  backend: E2eBackendHarness,
  opts: { user?: TestTgUser; startParam?: string } = {}
) {
  const user: TestTgUser = opts.user ?? {
    id: 100,
    first_name: 'Егор',
    last_name: 'Балагуров',
    username: 'egor_test',
    allows_write_to_pm: true,
  };

  const openedLinks: string[] = [];
  const sharedMessages: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  await page.exposeFunction(
    '__kpE2eCallEndpoint',
    async (name: string, input: Record<string, unknown>): Promise<EndpointCallResponse> => {
      try {
        const result = await backend.callEndpoint(name, input, user);
        return { ok: true, result };
      } catch (err: unknown) {
        const errObj = err as { message?: string; parameters?: Record<string, unknown>; constructor?: { name?: string } };
        const isEndpointErr = errObj?.constructor?.name === 'EndpointError';
        return {
          ok: false,
          error: {
            message: errObj?.message || 'Ошибка сервера',
            type: isEndpointErr ? 'ENDPOINT_ERROR' : 'INTERNAL_ERROR',
            parameters: errObj?.parameters,
          },
        };
      }
    }
  );

  await page.exposeFunction('__kpE2eTrackLink', (url: string) => {
    openedLinks.push(url);
  });

  await page.exposeFunction('__kpE2eTrackShareMessage', (msgId: string) => {
    sharedMessages.push(msgId);
  });

  // Не даём внешнему telegram-web-app.js перезаписывать E2E-мок Telegram.WebApp
  await page.route('https://telegram.org/js/telegram-web-app.js*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: '/* intercepted by playwright e2e bridge */',
    });
  });

  await page.addInitScript(
    ({ tgUser, startParam }) => {
      const storage = new Map<string, string>();
      const win = window as unknown as Record<string, unknown>;
      win.Telegram = {
        WebApp: {
          initData: `user=${encodeURIComponent(JSON.stringify(tgUser))}&auth_date=1700000000&hash=e2e`,
          initDataUnsafe: {
            user: tgUser,
            ...(startParam ? { start_param: startParam } : {}),
          },
          colorScheme: 'dark',
          viewportHeight: window.innerHeight,
          viewportStableHeight: window.innerHeight,
          safeAreaInset: { top: 0, bottom: 0 },
          contentSafeAreaInset: { top: 0, bottom: 0 },
          ready: () => {},
          expand: () => {},
          setHeaderColor: () => {},
          setBackgroundColor: () => {},
          onEvent: () => {},
          offEvent: () => {},
          HapticFeedback: {
            impactOccurred: () => {},
            notificationOccurred: () => {},
          },
          CloudStorage: {
            getItem: (key: string, cb: (err: null, val?: string) => void) =>
              cb(null, storage.get(key) ?? ''),
            setItem: (key: string, val: string, cb?: (err: null, ok?: boolean) => void) => {
              storage.set(key, val);
              cb?.(null, true);
            },
          },
          openTelegramLink: (url: string) => {
            void (win.__kpE2eTrackLink as (u: string) => Promise<void>)(url);
          },
          shareMessage: (msgId: string, cb?: (sent: boolean) => void) => {
            void (win.__kpE2eTrackShareMessage as (id: string) => Promise<void>)(msgId);
            cb?.(true);
          },
          Serverless: {
            call: (
              endpoint: string,
              input: Record<string, unknown>,
              cb: (err: unknown, result: unknown) => void
            ) => {
              (
                win.__kpE2eCallEndpoint as (
                  n: string,
                  i: Record<string, unknown>
                ) => Promise<EndpointCallResponse>
              )(endpoint, input)
                .then((res) => {
                  if (res.ok) cb(null, res.result);
                  else cb(res.error, null);
                })
                .catch((e) => cb({ message: String(e), type: 'INTERNAL_ERROR' }, null));
            },
          },
        },
      };
    },
    { tgUser: user, startParam: opts.startParam }
  );

  return {
    openedLinks,
    sharedMessages,
    consoleErrors,
    pageErrors,
  };
}
