// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isWiseV2User } from '../src/utils/wiseFeature';
import App from '../src/App';
import { apiClient } from '../src/api/client';

describe('Wise v2 canary rollout (@egor_beezer only)', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete document.documentElement.dataset.wiseV2;
  });

  it('isWiseV2User returns true only for egor_beezer (case-insensitive)', () => {
    expect(isWiseV2User('egor_beezer')).toBe(true);
    expect(isWiseV2User('Egor_Beezer')).toBe(true);
    expect(isWiseV2User('@egor_beezer')).toBe(true);
    expect(isWiseV2User('other_player')).toBe(false);
    expect(isWiseV2User('')).toBe(false);
    expect(isWiseV2User(null)).toBe(false);
    expect(isWiseV2User(undefined)).toBe(false);
  });

  it('sets data-wise-v2="true" in App only when user.username is egor_beezer', async () => {
    (window as { Telegram?: unknown }).Telegram = {
      WebApp: {
        initData: 'test',
        initDataUnsafe: { user: { id: 1, first_name: 'Егор', username: 'egor_beezer' } },
        ready: vi.fn(),
        expand: vi.fn(),
      },
    };
    vi.spyOn(apiClient, 'getState').mockResolvedValue({
      user: { id: 1, first_name: 'Егор', username: 'egor_beezer' },
      tournaments: [],
      tournamentHistory: [],
      clubPlayers: [],
      playerProfile: null,
      activeTournament: null,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });
    await vi.waitFor(() => {
      expect(document.documentElement.dataset.wiseV2).toBe('true');
    });

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps data-wise-v2="false" for other users', async () => {
    (window as { Telegram?: unknown }).Telegram = {
      WebApp: {
        initData: 'test',
        initDataUnsafe: { user: { id: 2, first_name: 'Макс', username: 'max_player' } },
        ready: vi.fn(),
        expand: vi.fn(),
      },
    };
    vi.spyOn(apiClient, 'getState').mockResolvedValue({
      user: { id: 2, first_name: 'Макс', username: 'max_player' },
      tournaments: [],
      tournamentHistory: [],
      clubPlayers: [],
      playerProfile: null,
      activeTournament: null,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });
    await vi.waitFor(() => {
      expect(document.documentElement.dataset.wiseV2).toBe('false');
    });

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
