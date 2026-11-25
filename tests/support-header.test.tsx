import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { installTestDom } from './helpers/dom';
import { SUPPORT_LINK } from '../src/support';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) {
    const fn = cleanups.pop();
    fn?.();
  }
  vi.restoreAllMocks();
});

describe('Support header button (@kickerpickersupportbot)', () => {
  it('renders wide Telegram + 🛠️ pill button and opens @kickerpickersupportbot via openTelegramLink or window.open', async () => {
    const { cleanup } = installTestDom();
    cleanups.push(cleanup);

    const openTelegramLink = vi.fn();
    (window as any).Telegram = {
      WebApp: {
        openTelegramLink,
        Serverless: { call: vi.fn() },
        HapticFeedback: { impactOccurred: vi.fn(), notificationOccurred: vi.fn() },
      },
    };

    const { SupportHeaderButton } = await import('../src/components/SupportHeaderButton');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<SupportHeaderButton />);
    });

    const btn = container.querySelector('[data-testid="header-support-btn"]') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('🛠️');
    expect(btn!.querySelector('svg')).not.toBeNull();
    expect(btn!.className).toContain('min-w-[62px]');

    btn!.click();
    expect(openTelegramLink).toHaveBeenCalledWith(SUPPORT_LINK);
    expect(SUPPORT_LINK).toBe('https://t.me/kickerpickersupportbot');

    // Fallback outside Telegram WebApp
    (window as any).Telegram = {};
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    btn!.click();
    expect(openSpy).toHaveBeenCalledWith(SUPPORT_LINK, '_blank', 'noopener,noreferrer');

    await act(async () => {
      root.unmount();
    });
  });

  it('shows persistent support button in header on Home, Create, and Tournament screens, plus outside Telegram', async () => {
    const { cleanup } = installTestDom();
    cleanups.push(cleanup);

    const { default: App } = await import('../src/App');
    const { apiClient } = await import('../src/api/client');

    // 1. Outside Telegram screen
    (window as any).Telegram = {};
    let container = document.createElement('div');
    document.body.appendChild(container);
    let root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });
    expect(container.textContent).toContain('🛠️ Написать в поддержку');
    await act(async () => {
      root.unmount();
    });

    // 2. Inside Telegram Mini App: Home -> Create -> Tournament
    const openTelegramLink = vi.fn();
    (window as any).Telegram = {
      WebApp: {
        initData: 'user=%7B%22id%22%3A10%2C%22first_name%22%3A%22Egor%22%7D',
        initDataUnsafe: { user: { id: 10, first_name: 'Egor' } },
        Serverless: { call: vi.fn() },
        openTelegramLink,
        ready: vi.fn(),
        expand: vi.fn(),
        HapticFeedback: { impactOccurred: vi.fn(), notificationOccurred: vi.fn() },
      },
    };

    const getStateSpy = vi.spyOn(apiClient, 'getState').mockResolvedValue({
      user: { id: 10, first_name: 'Egor' },
      tournaments: [
        {
          id: 5,
          name: 'Кубок',
          creatorTgId: 10,
          status: 'REGISTRATION',
          currentRound: 0,
          tablesCount: 2,
          autoRounds: false,
          pendingPlayoff: false,
          dypMode: 'monster',
          useBuckets: false,
          targetScore: 5,
          winByTwo: false,
          maxScore: 7,
          playoffSize: 4,
          thirdPlaceMatch: true,
          playoffFormat: 'best_of_1',
          playoffTargetScore: 5,
          playoffWinByTwo: false,
          playoffMaxScore: 7,
        },
      ],
      activeTournament: {
        tournament: {
          id: 5,
          name: 'Кубок',
          creatorTgId: 10,
          status: 'REGISTRATION',
          currentRound: 0,
          tablesCount: 2,
          autoRounds: false,
          pendingPlayoff: false,
          dypMode: 'monster',
          useBuckets: false,
          targetScore: 5,
          winByTwo: false,
          maxScore: 7,
          playoffSize: 4,
          thirdPlaceMatch: true,
          playoffFormat: 'best_of_1',
          playoffTargetScore: 5,
          playoffWinByTwo: false,
          playoffMaxScore: 7,
        },
        isAdmin: true,
        myPlayerId: 1,
        players: [],
        leaderboard: [],
        currentRoundMatches: [],
        playoffMatches: [],
        timings: { playedCount: 0, totalCount: 0, progressPercent: 0, elapsedMinutes: 0, avgMatchMinutes: null, estimatedEndAt: null },
      },
      clubPlayers: [],
      tournamentHistory: [],
      playerProfile: null,
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });
    await vi.waitFor(() => {
      expect(getStateSpy).toHaveBeenCalled();
      expect(container.querySelector('[data-testid="header-support-btn"]')).not.toBeNull();
    });

    // Active tournament header with admin tabs:
    // Home is the first button on the left in bottom dock, NOT in the header
    const appHeader = container.querySelector('[data-testid="app-header"]');
    expect(appHeader).not.toBeNull();
    expect(appHeader!.querySelector('button[aria-label="Главный экран"]')).toBeNull();

    const dockButtons = Array.from(container.querySelectorAll('nav.dock button'));
    expect(dockButtons.length).toBeGreaterThanOrEqual(4);
    expect(dockButtons[0]?.textContent).toContain('Домой');
    const homeBtn = dockButtons[0] as HTMLButtonElement;

    const rightGroup = appHeader!.querySelector('[data-testid="header-right-group"]');
    expect(rightGroup).not.toBeNull();
    const supportInRightGroup = rightGroup!.querySelector('[data-testid="header-support-btn"]');
    expect(supportInRightGroup).not.toBeNull();
    expect(rightGroup!.textContent).toContain('Игрок');
    expect(rightGroup!.textContent).toContain('Админ');

    // Click Home button in dock -> on Home screen Support sits in header-right-group (at the right edge)
    await act(async () => {
      homeBtn.click();
    });
    const homeHeader = container.querySelector('[data-testid="home-header"]');
    expect(homeHeader).not.toBeNull();
    // Home screen should NOT have a Home button or theme button in the header
    expect(homeHeader!.querySelector('button[aria-label="Главный экран"]')).toBeNull();
    expect(homeHeader!.querySelector('button[aria-label*="тема" i]')).toBeNull();
    const homeRightGroup = homeHeader!.querySelector('[data-testid="header-right-group"]');
    expect(homeRightGroup?.querySelector('[data-testid="header-support-btn"]')).not.toBeNull();

    // Open Create Tournament -> has header-support-btn AND Back button
    const createBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Создать новый турнир')
    );
    expect(createBtn).toBeDefined();
    await act(async () => {
      createBtn!.click();
    });
    const headerBtnOnCreate = container.querySelector('[data-testid="header-support-btn"]') as HTMLButtonElement | null;
    expect(headerBtnOnCreate).not.toBeNull();
    headerBtnOnCreate!.click();
    expect(openTelegramLink).toHaveBeenCalledWith('https://t.me/kickerpickersupportbot');

    const backBtnOnCreate = container.querySelector('button[aria-label="Назад"]') as HTMLButtonElement | null;
    expect(backBtnOnCreate).not.toBeNull();
    await act(async () => {
      backBtnOnCreate!.click();
    });
    expect(container.querySelector('[data-testid="home-header"]')).not.toBeNull();

    await act(async () => {
      root.unmount();
    });

    // 3. Inside Telegram Mini App as non-admin active player (no tabs): Support stays flush right in header-right-group
    const firstState = await getStateSpy.mock.results[0].value;
    getStateSpy.mockResolvedValue({
      ...firstState,
      activeTournament: {
        ...firstState.activeTournament,
        isAdmin: false,
      },
    });
    const c3 = document.createElement('div');
    document.body.appendChild(c3);
    const r3 = createRoot(c3);
    await act(async () => {
      r3.render(<App />);
    });
    await vi.waitFor(() => {
      expect(c3.querySelector('[data-testid="app-header"]')).not.toBeNull();
    });
    const playerRightGroup = c3.querySelector('[data-testid="app-header"] [data-testid="header-right-group"]');
    expect(playerRightGroup?.querySelector('[data-testid="header-support-btn"]')).not.toBeNull();
    expect(playerRightGroup?.textContent).not.toContain('Игрок');

    await act(async () => {
      r3.unmount();
    });
  });
});
