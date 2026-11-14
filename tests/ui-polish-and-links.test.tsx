import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { installTestDom } from './helpers/dom';
import type { TournamentSnapshot } from '../src/types';

function makePlayoffSnapshot(opts: { publicPath?: string | null; isAdmin?: boolean } = {}): TournamentSnapshot {
  return {
    tournament: {
      id: 77,
      name: 'Вечерний кикер',
      creatorTgId: opts.isAdmin ? 10 : 999,
      status: 'PLAYOFF',
      currentRound: 1,
      tablesCount: 2,
      autoRounds: true,
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
      publicPath: opts.publicPath ?? null,
    },
    isAdmin: Boolean(opts.isAdmin),
    myPlayerId: 1,
    players: [
      { id: 1, tournamentId: 77, tgId: 10, name: 'Egor B.', initials: 'EB', isActive: true, isGuest: false, byesCount: 0 },
      { id: 2, tournamentId: 77, tgId: 11, name: 'Маша', initials: 'МА', isActive: true, isGuest: false, byesCount: 0 },
      { id: 3, tournamentId: 77, tgId: 12, name: 'Костя', initials: 'КО', isActive: true, isGuest: false, byesCount: 0 },
      { id: 4, tournamentId: 77, tgId: 13, name: 'Юля', initials: 'ЮЛ', isActive: true, isGuest: false, byesCount: 0 },
    ],
    leaderboard: [
      { rank: 1, playerId: 1, name: 'Egor B.', initials: 'EB', isActive: true, byesCount: 0, games: 3, wins: 3, points: 6, goalsFor: 15, goalsAgainst: 6, diff: 9, ppm: 2 },
    ],
    currentRoundMatches: [
      {
        id: 201,
        stage: 'PLAYOFF',
        roundNumber: 1,
        bracketSlot: 'SF1',
        tableNumber: 1,
        team1Players: [
          { id: 3, name: 'Костя', initials: 'КО' },
          { id: 4, name: 'Юля', initials: 'ЮЛ' },
        ],
        team2Players: [
          { id: 1, name: 'Egor B.', initials: 'EB' },
          { id: 2, name: 'Маша', initials: 'МА' },
        ],
        team1Label: 'Костя / Юля',
        team2Label: 'Egor B. / Маша',
        myTeam: 2,
        status: 'PLAYING',
        score1: 0,
        score2: 0,
        setsWon1: 0,
        setsWon2: 0,
        setsHistory: null,
      },
    ],
    playoffMatches: [],
    myCurrentMatch: {
      id: 201,
      stage: 'QUALIFICATION',
      roundNumber: 1,
      bracketSlot: null,
      tableNumber: 1,
      team1Players: [
        { id: 3, name: 'Костя', initials: 'КО' },
        { id: 4, name: 'Юля', initials: 'ЮЛ' },
      ],
      team2Players: [
        { id: 1, name: 'Egor B.', initials: 'EB' },
        { id: 2, name: 'Маша', initials: 'МА' },
      ],
      team1Label: 'Костя / Юля',
      team2Label: 'Egor B. / Маша',
      myTeam: 2,
      status: 'PLAYING',
      score1: 0,
      score2: 0,
      setsWon1: 0,
      setsWon2: 0,
      setsHistory: null,
    },
    myHistory: [],
  };
}

describe('UI polish, light-theme contrast, LIVE button & single-instance Telegram links', () => {
  let cleanupDom: (() => void) | null = null;

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    cleanupDom?.();
    cleanupDom = null;
  });

  it('uses "Пригласить" in AdminPlayersView and removes "Поделиться ссылкой на турнир" in AdminSettingsView', async () => {
    const env = installTestDom();
    cleanupDom = env.cleanup;

    const { AdminPlayersView } = await import('../src/components/AdminPlayersView');
    const { AdminSettingsView } = await import('../src/components/AdminSettingsView');

    const c1 = document.createElement('div');
    document.body.appendChild(c1);
    const r1 = createRoot(c1);
    await act(async () => {
      r1.render(
        <AdminPlayersView
          snapshot={makePlayoffSnapshot({ isAdmin: true })}
          onAddGuest={async () => {}}
          onManagePlayer={async () => {}}
          onToggleActive={async () => {}}
          busy={false}
        />
      );
    });
    expect(c1.textContent).toContain('Пригласить');
    expect(c1.textContent).not.toContain('Поделиться в Telegram');

    const c2 = document.createElement('div');
    document.body.appendChild(c2);
    const r2 = createRoot(c2);
    await act(async () => {
      r2.render(
        <AdminSettingsView
          snapshot={makePlayoffSnapshot({ isAdmin: true })}
          onBack={() => {}}
          onSave={async () => {}}
          onTransferAdmin={async () => {}}
          onDelete={async () => {}}
          busy={false}
        />
      );
    });
    expect(c2.textContent).not.toContain('Поделиться ссылкой на турнир');

    await act(async () => {
      r1.unmount();
      r2.unmount();
    });
  });

  it('hides open LIVE links in LeaderboardView/AdminSettingsView/AdminDashboardView, leaves single Поделиться button on live toggle, and uses screenshot icon in LeaderboardView', async () => {
    const env = installTestDom();
    cleanupDom = env.cleanup;
    const openTelegramLink = vi.fn();
    (window as unknown as { Telegram: { WebApp: { openTelegramLink: typeof openTelegramLink } } }).Telegram = {
      WebApp: { openTelegramLink },
    };

    const { LeaderboardView } = await import('../src/components/LeaderboardView');
    const { AdminSettingsView } = await import('../src/components/AdminSettingsView');

    const c1 = document.createElement('div');
    document.body.appendChild(c1);
    const r1 = createRoot(c1);
    await act(async () => {
      r1.render(<LeaderboardView snapshot={makePlayoffSnapshot({ publicPath: 'kp_77_abc' })} />);
    });

    const liveBtn = Array.from(c1.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('LIVE')
    );
    expect(liveBtn).toBeUndefined();
    expect(c1.textContent).not.toContain('kp_77_abc');

    const screenshotBtn = c1.querySelector('[data-testid="share-table-screenshot-btn"]');
    expect(screenshotBtn).not.toBeNull();
    expect(screenshotBtn!.querySelector('svg')).not.toBeNull();

    const c2 = document.createElement('div');
    document.body.appendChild(c2);
    const r2 = createRoot(c2);
    await act(async () => {
      r2.render(
        <AdminSettingsView
          snapshot={makePlayoffSnapshot({ isAdmin: true, publicPath: 'kp_77_abc' })}
          onBack={() => {}}
          onSave={async () => {}}
          onToggleLive={async () => {}}
          onTransferAdmin={async () => {}}
          onDelete={async () => {}}
          busy={false}
        />
      );
    });
    expect(c2.textContent).not.toContain('kp_77_abc');
    expect(c2.textContent).not.toContain('Копировать');
    expect(c2.textContent).not.toContain('Открыть');
    const shareLiveBtn = Array.from(c2.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Поделиться')
    );
    expect(shareLiveBtn).toBeDefined();
    await act(async () => {
      shareLiveBtn!.click();
    });
    expect(openTelegramLink).toHaveBeenCalledTimes(1);
    expect(openTelegramLink.mock.calls[0][0]).toContain('https://t.me/share/url?');
    expect(openTelegramLink.mock.calls[0][0]).toContain(encodeURIComponent('kp_77_abc'));

    await act(async () => {
      r1.unmount();
      r2.unmount();
    });
  });

  it('renders large borderless score numerals separated from shadowed ScorePickerRow buttons', async () => {
    const env = installTestDom();
    cleanupDom = env.cleanup;

    const { PlayerMatchView } = await import('../src/components/PlayerMatchView');
    const c = document.createElement('div');
    document.body.appendChild(c);
    const root = createRoot(c);

    await act(async () => {
      root.render(
        <PlayerMatchView
          snapshot={makePlayoffSnapshot()}
          onSubmitScore={async () => {}}
          onConfirmScore={async () => {}}
          onRemindConfirm={async () => {}}
          busy={false}
        />
      );
    });

    const largeScores = c.querySelectorAll('.text-4xl.tabular-nums');
    expect(largeScores.length).toBe(2);
    for (const el of Array.from(largeScores)) {
      expect(el.className).not.toContain('bg-[#1c1c1d]');
      expect(el.className).not.toContain('rounded-xl');
    }

    const digitBtn = Array.from(c.querySelectorAll('button')).find((b) => b.textContent?.trim() === '5');
    expect(digitBtn).toBeDefined();
    expect(digitBtn!.className).toContain('shadow-[');
    expect(digitBtn!.className).toContain('h-11');

    await act(async () => {
      root.unmount();
    });
  });

  it('uses single Main Mini App direct links (?startapp=...) everywhere without duplicate web_app instances', async () => {
    const { getTournamentInviteLink } = await import('../src/utils/share');
    expect(getTournamentInviteLink(77)).toBe('https://t.me/kickerpickerbot?startapp=77');

    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    vi.doMock('sdk', () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              get: async () => ({ id: 77, name: 'Кубок' }),
            }),
          }),
        }),
      },
      api: { sendMessage },
      EndpointError: Error,
    }));
    vi.doMock('sdk/db', () => ({
      eq: vi.fn(),
      and: vi.fn(),
      desc: vi.fn(),
      inArray: vi.fn(),
      sql: vi.fn(),
    }));
    vi.doMock('../tgcloud/schema.js', () => ({
      users: {},
      tournaments: { id: 'id' },
      tournamentPlayers: {},
      matches: {},
    }));
    vi.doMock('../tgcloud/lib/helpers.js', () => ({
      BOT_USERNAME: 'kickerpickerbot',
      upsertUser: vi.fn(),
      escapeHtml: (s: string) => s,
    }));

    const { default: messageHandler } = await import('../tgcloud/handlers/message.js');
    await messageHandler({ chat: { id: 99 }, text: '/start 77', from: { id: 99, first_name: 'Test' } });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const btn = sendMessage.mock.calls[0][0].reply_markup.inline_keyboard[0][0];
    expect(btn.url).toBe('https://t.me/kickerpickerbot?startapp=77');
    expect(btn.web_app).toBeUndefined();
  });

  it('removes dark/black surfaces and low-contrast yellow in light theme', async () => {
    const env = installTestDom();
    cleanupDom = env.cleanup;

    const { PlayerAvatar } = await import('../src/components/PlayerAvatar');
    const { AdminDashboardView } = await import('../src/components/AdminDashboardView');

    const c1 = document.createElement('div');
    document.body.appendChild(c1);
    const r1 = createRoot(c1);
    await act(async () => {
      r1.render(<PlayerAvatar initials="ИР" name="Ира" />);
    });
    const avatarEl = c1.firstElementChild as HTMLElement;
    expect(avatarEl.className).toContain('bg-[var(--bg-3)]');
    expect(avatarEl.className).toContain('text-[var(--text)]');
    expect(avatarEl.className).not.toContain('bg-gray-600');
    expect(avatarEl.className).not.toContain('border-[#1c1c1d]');

    const c2 = document.createElement('div');
    document.body.appendChild(c2);
    const r2 = createRoot(c2);
    await act(async () => {
      r2.render(
        <AdminDashboardView
          snapshot={makePlayoffSnapshot({ isAdmin: true })}
          onStartRound={async () => {}}
          onStartPlayoff={async () => {}}
          onCancelPendingPlayoff={async () => {}}
          onFinishTournament={async () => {}}
          onDeleteLastRound={async () => {}}
          onAdminSaveMatch={async () => {}}
          onAdminManageMatch={async () => {}}
          onToggleDisabledTable={async () => {}}
          onToggleLive={async () => {}}
          onOpenSettings={() => {}}
          onRefresh={async () => {}}
          busy={false}
        />
      );
    });
    const finishBtn = Array.from(c2.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Завершить турнир')
    );
    expect(finishBtn).toBeDefined();
    expect(finishBtn!.className).toContain('disabled:bg-[var(--bg-3)]');
    expect(finishBtn!.className).not.toContain('disabled:bg-[#1c1c1d]');

    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/gym-ui.css'), 'utf8');
    expect(css).toContain(':root[data-theme="light"] .text-yellow-500');
    expect(css).toContain('color: #92400e;');
    expect(css).toContain(':root[data-theme="light"] .bg-gray-600');

    await act(async () => {
      r1.unmount();
      r2.unmount();
    });
  });

  it('generates 500x500 square light Telegram avatar PNGs', () => {
    for (const fileName of ['avatar-light-stacked.png', 'avatar-light-inline.png']) {
      const buf = fs.readFileSync(path.resolve(process.cwd(), 'assets/telegram-avatars', fileName));
      expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      expect(width).toBe(500);
      expect(height).toBe(500);
    }
  });
});
