import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { installTestDom } from './helpers/dom';
import type { TournamentSnapshot } from '../src/types';

function makePlayoffSnapshot(): TournamentSnapshot {
  return {
    tournament: {
      id: 77,
      name: 'Кубок Пикера',
      creatorTgId: 10,
      status: 'FINISHED',
      currentRound: 4,
      tablesCount: 2,
      autoRounds: true,
      pendingPlayoff: false,
      dypMode: 'monster',
      useBuckets: false,
      targetScore: 5,
      winByTwo: false,
      maxScore: 5,
      playoffSize: 8,
      thirdPlaceMatch: true,
      playoffFormat: 'best_of_1',
      playoffTargetScore: 5,
      playoffWinByTwo: false,
      playoffMaxScore: 5,
      startedAt: Date.UTC(2026, 10, 14, 18, 30),
    },
    isAdmin: false,
    myPlayerId: 1,
    players: [
      { id: 1, tournamentId: 77, tgId: 10, name: 'Алекс', initials: 'АЛ', isActive: true, isGuest: false, byesCount: 0 },
      { id: 2, tournamentId: 77, tgId: 11, name: 'Борис', initials: 'БО', isActive: true, isGuest: false, byesCount: 0 },
      { id: 3, tournamentId: 77, tgId: 12, name: 'Виктор', initials: 'ВИ', isActive: true, isGuest: false, byesCount: 0 },
      { id: 4, tournamentId: 77, tgId: 13, name: 'Глеб', initials: 'ГЛ', isActive: true, isGuest: false, byesCount: 0 },
    ],
    leaderboard: [
      { rank: 1, playerId: 1, name: 'Алекс', initials: 'АЛ', isActive: true, byesCount: 0, games: 4, wins: 4, points: 8, goalsFor: 20, goalsAgainst: 8, diff: 12, ppm: 2 },
      { rank: 2, playerId: 2, name: 'Борис', initials: 'БО', isActive: true, byesCount: 0, games: 4, wins: 3, points: 6, goalsFor: 18, goalsAgainst: 11, diff: 7, ppm: 1.5 },
    ],
    currentRoundMatches: [],
    playoffMatches: [
      {
        id: 501,
        stage: 'PLAYOFF',
        roundNumber: 1,
        bracketSlot: 'SF1',
        tableNumber: 1,
        team1Players: [{ id: 1, name: 'Алекс', initials: 'АЛ' }],
        team2Players: [{ id: 3, name: 'Виктор', initials: 'ВИ' }],
        team1Label: 'Алекс / Борис',
        team2Label: 'Виктор / Глеб',
        status: 'FINISHED',
        score1: 5,
        score2: 2,
        setsWon1: 1,
        setsWon2: 0,
        setsHistory: [{ score1: 5, score2: 2 }],
      },
      {
        id: 502,
        stage: 'PLAYOFF',
        roundNumber: 1,
        bracketSlot: 'SF2',
        tableNumber: 2,
        team1Players: [{ id: 2, name: 'Дима', initials: 'ДИ' }],
        team2Players: [{ id: 4, name: 'Женя', initials: 'ЖЕ' }],
        team1Label: 'Дима / Егор',
        team2Label: 'Женя / Илья',
        status: 'FINISHED',
        score1: 5,
        score2: 4,
        setsWon1: 1,
        setsWon2: 0,
        setsHistory: [{ score1: 5, score2: 4 }],
      },
      {
        id: 503,
        stage: 'PLAYOFF',
        roundNumber: 2,
        bracketSlot: 'FINAL',
        tableNumber: 1,
        team1Players: [{ id: 1, name: 'Алекс', initials: 'АЛ' }],
        team2Players: [{ id: 2, name: 'Дима', initials: 'ДИ' }],
        team1Label: 'Алекс / Борис',
        team2Label: 'Дима / Егор',
        status: 'FINISHED',
        score1: 5,
        score2: 1,
        setsWon1: 1,
        setsWon2: 0,
        setsHistory: [{ score1: 5, score2: 1 }],
      },
      {
        id: 504,
        stage: 'PLAYOFF',
        roundNumber: 2,
        bracketSlot: 'THIRD_PLACE',
        tableNumber: 2,
        team1Players: [{ id: 3, name: 'Виктор', initials: 'ВИ' }],
        team2Players: [{ id: 4, name: 'Женя', initials: 'ЖЕ' }],
        team1Label: 'Виктор / Глеб',
        team2Label: 'Женя / Илья',
        status: 'FINISHED',
        score1: 5,
        score2: 3,
        setsWon1: 1,
        setsWon2: 0,
        setsHistory: [{ score1: 5, score2: 3 }],
      },
    ],
    myCurrentMatch: null,
    myHistory: [],
  };
}

function mockCanvas2D() {
  const drawnTexts: string[] = [];
  const fakeCtx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    clip: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    measureText: (t: string) => ({ width: t.length * 7 }),
    fillText: vi.fn((text: string) => {
      drawnTexts.push(String(text));
    }),
  };

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => fakeCtx,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: () => 'data:image/png;base64,' + 'A'.repeat(200),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    value: (cb: (b: Blob | null) => void) => cb(new Blob(['fake-png'], { type: 'image/png' })),
  });

  return { drawnTexts, fakeCtx };
}

describe('Playoff share & PNG export', () => {
  let cleanupDom: (() => void) | null = null;

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    cleanupDom?.();
    cleanupDom = null;
  });

  it('renders playoff bracket PNG with rounds, champion, 3rd place match, RU date, and hyphen-free brand', async () => {
    const env = installTestDom();
    cleanupDom = env.cleanup;
    const { drawnTexts, fakeCtx } = mockCanvas2D();

    const { renderPlayoffToPng } = await import('../src/utils/exportPlayoffImage');
    const result = await renderPlayoffToPng(makePlayoffSnapshot(), 'light');

    expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(result.base64.length).toBeGreaterThanOrEqual(200);
    expect(result.blob).toBeInstanceOf(Blob);

    const joined = drawnTexts.join(' | ');
    expect(joined).toContain('Кубок Пикера');
    expect(joined).toContain('ПОЛУФИНАЛ');
    expect(joined).toContain('ФИНАЛ');
    expect(joined).toContain('МАТЧ ЗА 3-Е МЕСТО');
    expect(joined).toContain('Победители');
    expect(joined).toContain('Алекс / Борис');
    expect(joined).toContain('14.11.2026');
    expect(drawnTexts).toContain('кикер');
    expect(drawnTexts).toContain('пикер');
    expect(joined).not.toContain('кикер-пикер');
    expect(fakeCtx.fillRect).toHaveBeenCalled();
  });

  it('shows "Поделиться" on LeaderboardView Playoff & Table tabs and shares via navigator.share without bot PM', async () => {
    const env = installTestDom();
    cleanupDom = env.cleanup;
    mockCanvas2D();

    const apiCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
    const navShareMock = vi.fn().mockResolvedValue(undefined);
    const navCanShareMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'share', { value: navShareMock, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: navCanShareMock, configurable: true });

    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: {
        initData: 'mock',
        initDataUnsafe: { user: { id: 10, first_name: 'Алекс' } },
        colorScheme: 'dark',
        HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} },
        Serverless: {
          call: (
            name: string,
            input: Record<string, unknown>,
            cb: (err: null, result: unknown) => void
          ) => {
            apiCalls.push({ name, input });
            cb(null, { sentToPm: false, preparedMessageId: null });
          },
        },
      },
    };

    const { LeaderboardView } = await import('../src/components/LeaderboardView');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LeaderboardView snapshot={makePlayoffSnapshot()} busy={false} />);
    });

    // Starts on Playoff sub-tab when playoffMatches exist
    expect(container.textContent).toContain('Сетка плей-офф');
    const shareBtn = container.querySelector(
      '[data-testid="share-table-screenshot-btn"]'
    ) as HTMLButtonElement | null;
    expect(shareBtn).not.toBeNull();
    expect(shareBtn!.getAttribute('aria-label')).toContain('плей-офф');
    expect(shareBtn!.querySelector('svg')).not.toBeNull();
    expect(shareBtn!.textContent?.trim()).toBe('');

    await act(async () => {
      shareBtn!.click();
    });
    await vi.waitFor(
      () => {
        expect(container.textContent).toContain('Фото плей-офф');
      },
      { timeout: 3000 }
    );
    expect(container.textContent).not.toContain('Скачать фото');
    expect(apiCalls.length).toBe(0);

    const modalSharePlayoffBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Поделиться')
    );
    expect(modalSharePlayoffBtn).toBeDefined();
    await act(async () => {
      modalSharePlayoffBtn!.click();
    });
    expect(navShareMock).toHaveBeenCalledTimes(1);
    expect(navShareMock.mock.calls[0][0].files[0].name).toBe('playoff-77.png');
    expect(apiCalls.length).toBe(0);

    const closeBtn1 = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Закрыть'
    );
    expect(closeBtn1).toBeDefined();
    await act(async () => {
      closeBtn1!.click();
    });

    // Switch to Group tab and confirm screenshot button opens standings preview and shares via client file share
    const groupBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Групповая')
    );
    expect(groupBtn).toBeDefined();
    await act(async () => {
      groupBtn!.click();
    });
    expect(container.textContent).toContain('Турнирная таблица');

    const shareStandingsBtn = container.querySelector(
      '[data-testid="share-table-screenshot-btn"]'
    ) as HTMLButtonElement | null;
    expect(shareStandingsBtn).not.toBeNull();
    expect(shareStandingsBtn!.getAttribute('aria-label')).toContain('таблиц');

    await act(async () => {
      shareStandingsBtn!.click();
    });
    await vi.waitFor(
      () => {
        expect(container.textContent).toContain('Фото таблицы');
      },
      { timeout: 3000 }
    );
    const modalShareStandingsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Поделиться')
    );
    expect(modalShareStandingsBtn).toBeDefined();
    await act(async () => {
      modalShareStandingsBtn!.click();
    });
    expect(navShareMock).toHaveBeenCalledTimes(2);
    expect(navShareMock.mock.calls[1][0].files[0].name).toBe('table-77.png');
    expect(apiCalls.length).toBe(0);

    await act(async () => {
      root.unmount();
    });
  });

  it('dead shareLeaderboard endpoint is removed and client source avoids dynamic module imports', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    expect(fs.existsSync(path.resolve(process.cwd(), 'tgcloud/endpoints/shareLeaderboard.js'))).toBe(false);
    const clientCode = fs.readFileSync(path.resolve(process.cwd(), 'src/api/client.ts'), 'utf8');
    expect(clientCode).not.toContain('shareLeaderboard');
    for (const rel of [
      'src/App.tsx',
      'src/components/LeaderboardView.tsx',
      'src/components/AdminDashboardView.tsx',
    ]) {
      const code = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
      expect(code).not.toMatch(/\bimport\s*\(/);
      expect(code).not.toMatch(/\blazy\s*\(/);
    }
  });

  it('shareImageFile falls back to clipboard when Web Share API is unavailable', async () => {
    const env = installTestDom();
    cleanupDom = env.cleanup;
    const writeMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { write: writeMock }, configurable: true });
    (globalThis as unknown as { ClipboardItem: unknown }).ClipboardItem = class MockClipboardItem {
      data: Record<string, Blob>;
      constructor(data: Record<string, Blob>) {
        this.data = data;
      }
    };

    const { shareImageFile } = await import('../src/utils/share');
    const outcome = await shareImageFile({
      blob: new Blob(['png'], { type: 'image/png' }),
      filename: 'table-77.png',
      title: 'Таблица',
    });
    expect(outcome).toBe('copied');
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it('opens preview modal with formed screenshot and sets crossOrigin on external avatar URLs', async () => {
    const env = installTestDom();
    const assignedImages: Array<{ crossOrigin: string | null; src: string }> = [];
    const OriginalImage = globalThis.Image;
    class TrackingImage {
      crossOrigin: string | null = null;
      naturalWidth = 64;
      naturalHeight = 64;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = '';
      get src() {
        return this._src;
      }
      set src(v: string) {
        this._src = v;
        assignedImages.push({ crossOrigin: this.crossOrigin, src: v });
        setTimeout(() => this.onload?.(), 0);
      }
    }
    (globalThis as unknown as { Image: typeof TrackingImage }).Image = TrackingImage;

    try {
      const { loadCanvasImage } = await import('../src/utils/canvasImage');
      await loadCanvasImage('https://t.me/i/userpic/avatar.jpg');
      expect(assignedImages[0]).toEqual({
        crossOrigin: 'anonymous',
        src: 'https://t.me/i/userpic/avatar.jpg',
      });

      const ctxStub = {
        scale: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        arcTo: vi.fn(),
        lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
        setLineDash: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        clip: vi.fn(),
        arc: vi.fn(),
        drawImage: vi.fn(),
        measureText: (t: string) => ({ width: t.length * 8 }),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        globalAlpha: 1,
        font: '',
        textAlign: 'left',
        textBaseline: 'alphabetic',
      };
      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => ctxStub,
            toDataURL: () => 'data:image/png;base64,' + 'A'.repeat(200),
            toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
          } as unknown as HTMLCanvasElement;
        }
        return origCreate(tag);
      });

      (window as unknown as { Telegram: unknown }).Telegram = {
        WebApp: {
          initData: 'hash=test',
          Serverless: {
            call: (_name: string, _input: unknown, cb: (err: Error | null) => void) => {
              cb(new Error('Network error'));
            },
          },
        },
      };

      const { LeaderboardView } = await import('../src/components/LeaderboardView');
      const container = origCreate('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(<LeaderboardView snapshot={makePlayoffSnapshot()} busy={false} />);
      });

      const btn = container.querySelector('[data-testid="share-table-screenshot-btn"]') as HTMLButtonElement;
      expect(btn).not.toBeNull();
      await act(async () => {
        btn.click();
      });

      await vi.waitFor(
        () => {
          expect(container.textContent).toContain('Фото плей-офф');
          expect(container.querySelector('img[src^="data:image/png;base64,"]')).not.toBeNull();
        },
        { timeout: 3000 }
      );
      expect(container.textContent).not.toContain('Скачать фото');

      // Repeated load of same avatar URL hits in-memory cache without re-fetching
      await loadCanvasImage('https://t.me/i/userpic/avatar.jpg');
      expect(assignedImages.length).toBe(1);

      await act(async () => {
        root.unmount();
      });
    } finally {
      (globalThis as unknown as { Image: typeof OriginalImage }).Image = OriginalImage;
      env.cleanup();
    }
  });

  it('renderPlayoffToPng includes R32_ (1/16 финала) round for Top-32 single brackets', async () => {
    const env = installTestDom();
    cleanupDom = env.cleanup;
    const drawnTexts: string[] = [];
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const fakeCtx = {
          scale: vi.fn(),
          fillRect: vi.fn(),
          fillText: vi.fn((text: string) => drawnTexts.push(String(text))),
          measureText: vi.fn((text: string) => ({ width: String(text).length * 7 })),
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          quadraticCurveTo: vi.fn(),
          closePath: vi.fn(),
          fill: vi.fn(),
          stroke: vi.fn(),
          arc: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          setLineDash: vi.fn(),
        };
        return {
          width: 0,
          height: 0,
          getContext: () => fakeCtx,
          toDataURL: () => `data:image/png;base64,${'A'.repeat(200)}`,
        } as unknown as HTMLCanvasElement;
      }
      return origCreate(tag);
    });

    const snap = makePlayoffSnapshot();
    snap.tournament.playoffSize = 32;
    snap.tournament.teamFormat = 'single';
    snap.playoffMatches = [
      {
        ...snap.playoffMatches[0],
        id: 999,
        bracketSlot: 'R32_1',
        team1Label: 'Игрок 1',
        team2Label: 'Игрок 32',
      },
      ...snap.playoffMatches,
    ];

    const { renderPlayoffToPng } = await import('../src/utils/exportPlayoffImage');
    await renderPlayoffToPng(snap);
    expect(drawnTexts).toContain('1/16 ФИНАЛА');
    expect(drawnTexts.some((t) => t.startsWith('1/16 финала 1'))).toBe(true);
  });
});
