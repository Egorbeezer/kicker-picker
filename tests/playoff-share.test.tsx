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

  it('shows "Поделиться" on LeaderboardView Playoff tab and shares with kind="playoff"', async () => {
    const env = installTestDom();
    cleanupDom = env.cleanup;
    mockCanvas2D();

    const apiCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
    const shareMessageMock = vi.fn((id: string, cb?: (sent: boolean) => void) => cb?.(true));

    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: {
        initData: 'mock',
        initDataUnsafe: { user: { id: 10, first_name: 'Алекс' } },
        colorScheme: 'dark',
        HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} },
        shareMessage: shareMessageMock,
        Serverless: {
          call: (
            name: string,
            input: Record<string, unknown>,
            cb: (err: null, result: unknown) => void
          ) => {
            apiCalls.push({ name, input });
            if (name === 'shareLeaderboard') {
              cb(null, { sentToPm: false, preparedMessageId: 'prep_playoff_1' });
            }
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
    const shareBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Поделиться')
    );
    expect(shareBtn).toBeDefined();

    await act(async () => {
      shareBtn!.click();
    });
    await vi.waitFor(
      () => {
        expect(apiCalls.some((c) => c.name === 'shareLeaderboard' && c.input.kind === 'playoff')).toBe(true);
        expect(shareMessageMock).toHaveBeenCalledWith('prep_playoff_1', expect.any(Function));
      },
      { timeout: 3000 }
    );
    await act(async () => {
      await Promise.resolve();
    });

    // Switch to Group tab and confirm "Поделиться" still exists and switches to kind="standings"
    const groupBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Групповая')
    );
    expect(groupBtn).toBeDefined();
    await act(async () => {
      groupBtn!.click();
    });
    expect(container.textContent).toContain('Турнирная таблица');

    const shareStandingsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Поделиться')
    );
    expect(shareStandingsBtn).toBeDefined();

    await act(async () => {
      shareStandingsBtn!.click();
    });
    await vi.waitFor(
      () => {
        expect(apiCalls.some((c) => c.name === 'shareLeaderboard' && c.input.kind === 'standings')).toBe(true);
      },
      { timeout: 3000 }
    );
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      root.unmount();
    });
  });

  it('shareLeaderboard endpoint handles kind="playoff", saves prepared inline message, and deletes temp PM photo', async () => {
    const sendPhoto = vi.fn().mockResolvedValue({
      message_id: 991,
      photo: [{ file_id: 'small' }, { file_id: 'large_playoff_file_id' }],
    });
    const savePreparedInlineMessage = vi.fn().mockResolvedValue({ id: 'prep_msg_77' });
    const deleteMessage = vi.fn().mockResolvedValue(true);

    class MockInputFile {
      bytes: Uint8Array;
      filename: string;
      opts?: Record<string, unknown>;
      constructor(bytes: Uint8Array, filename: string, opts?: Record<string, unknown>) {
        this.bytes = bytes;
        this.filename = filename;
        this.opts = opts;
      }
    }
    class MockEndpointError extends Error {
      code?: string;
      constructor(msg: string, params?: { code?: string }) {
        super(msg);
        this.code = params?.code;
      }
    }

    vi.doMock('sdk', () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              get: async () => ({
                id: 77,
                creatorTgId: 12345,
                name: 'Кубок Пикера',
                status: 'PLAYOFF',
                currentRound: 4,
              }),
            }),
          }),
        }),
      },
      api: {
        sendPhoto,
        savePreparedInlineMessage,
        deleteMessage,
      },
      InputFile: MockInputFile,
      EndpointError: MockEndpointError,
    }));
    vi.doMock('sdk/db', () => ({
      eq: vi.fn(),
      and: vi.fn(),
      desc: vi.fn(),
      inArray: vi.fn(),
      sql: vi.fn(),
    }));
    vi.doMock('../tgcloud/schema.js', () => ({
      tournaments: { id: 'id' },
      tournamentPlayers: {},
      tournamentAdmins: {},
      users: {},
      matches: {},
    }));

    const { default: shareLeaderboard } = await import('../tgcloud/endpoints/shareLeaderboard.js');
    const validBase64 = 'A'.repeat(200);
    const res = await shareLeaderboard(
      { tournamentId: 77, imageBase64: validBase64, kind: 'playoff' },
      { initData: { user: { id: 12345 } } }
    );

    expect(res).toEqual({
      sentToPm: false,
      preparedMessageId: 'prep_msg_77',
    });
    expect(sendPhoto).toHaveBeenCalledTimes(1);
    const sentArgs = sendPhoto.mock.calls[0][0];
    expect(sentArgs.photo.filename).toBe('playoff-77.png');
    expect(sentArgs.caption).toContain('Сетка плей-офф');
    expect(savePreparedInlineMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 12345,
        result: expect.objectContaining({
          photo_file_id: 'large_playoff_file_id',
        }),
      })
    );
    expect(deleteMessage).toHaveBeenCalledWith({
      chat_id: 12345,
      message_id: 991,
    });
  });
});
