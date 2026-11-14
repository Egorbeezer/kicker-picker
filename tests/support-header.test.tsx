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

    // Click Home button -> still has header-support-btn
    const homeBtn = container.querySelector('button[aria-label="Главный экран"]') as HTMLButtonElement | null;
    expect(homeBtn).not.toBeNull();
    await act(async () => {
      homeBtn!.click();
    });
    expect(container.querySelector('[data-testid="header-support-btn"]')).not.toBeNull();

    // Open Create Tournament -> still has header-support-btn
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

    await act(async () => {
      root.unmount();
    });
  });
});
