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
    const playersScrollRoot = c1.firstElementChild as HTMLElement;
    expect(playersScrollRoot.className).toContain('h-full');
    expect(playersScrollRoot.className).toContain('overflow-y-auto');
    expect(playersScrollRoot.className).toContain('content-dock-pad');
    expect(c1.querySelector('[aria-label^="Удалить "]')).not.toBeNull();

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
      buildMainAppLink: (param: string | number = 'open') =>
        `https://t.me/kickerpickerbot?startapp=${encodeURIComponent(String(param))}`,
    }));

    const { default: messageHandler } = await import('../tgcloud/handlers/message.js');
    await messageHandler({ chat: { id: 99 }, text: '/start 77', from: { id: 99, first_name: 'Test' } });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const btn = sendMessage.mock.calls[0][0].reply_markup.inline_keyboard[0][0];
    expect(btn.url).toBe('https://t.me/kickerpickerbot?startapp=77');
    expect(btn.web_app).toBeUndefined();

    await messageHandler({ chat: { id: 99 }, text: '/start', from: { id: 99, first_name: 'Test' } });
    const startText = sendMessage.mock.calls[1][0].text as string;
    expect(startText).toContain('Кикер Пикер');
    expect(startText).not.toContain('Kicker Picker');
    expect(startText).toContain('Monster DYP');
    expect(startText).toContain('Швейцарка');
    expect(startText).toContain('Last One Standing');
    expect(startText).toContain('Сразу Плей-офф');
    const startBtn = sendMessage.mock.calls[1][0].reply_markup.inline_keyboard[0][0];
    expect(startBtn.text).toContain('Кикер Пикер');
    expect(startBtn.url).toBe('https://t.me/kickerpickerbot?startapp=open');
    expect(startBtn.web_app).toBeUndefined();

    // Ensure no bot handler or helper uses inline web_app URL buttons or leftover MINI_APP_URL
    const helpersSrc = fs.readFileSync(path.resolve(process.cwd(), 'tgcloud/lib/helpers.js'), 'utf8');
    const messageSrc = fs.readFileSync(path.resolve(process.cwd(), 'tgcloud/handlers/message.js'), 'utf8');
    expect(helpersSrc).not.toContain('MINI_APP_URL');
    expect(helpersSrc).not.toContain('web_app:');
    expect(messageSrc).not.toContain('web_app:');
  });

  it('installSingleInstanceSync pauses superseded background tab and syncs latest tournament on reactivation', async () => {
    const env = installTestDom();
    cleanupDom = env.cleanup;
    vi.resetModules();

    const { installSingleInstanceSync } = await import('../src/utils/singleInstance');
    const onSuperseded1 = vi.fn();
    const onActivate1 = vi.fn();
    const c1 = installSingleInstanceSync({ onSuperseded: onSuperseded1, onActivate: onActivate1 });
    c1.announce(12);

    const onSuperseded2 = vi.fn();
    const onActivate2 = vi.fn();
    const c2 = installSingleInstanceSync({ onSuperseded: onSuperseded2, onActivate: onActivate2 });
    c2.announce(99);

    await vi.waitFor(
      () => {
        expect(onSuperseded1).toHaveBeenCalledTimes(1);
      },
      { timeout: 1000 }
    );

    window.dispatchEvent(new window.Event('focus'));
    expect(onActivate1).toHaveBeenCalledWith(99);

    c1.cleanup();
    c2.cleanup();
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

  it('unifies AdminSettingsView and CreateTournamentView with radio controls, light/dark vars, and submit-spam lock', async () => {
    const env = installTestDom();
    cleanupDom = env.cleanup;
    const { AdminSettingsView } = await import('../src/components/AdminSettingsView');
    const { CreateTournamentView } = await import('../src/components/CreateTournamentView');
    const { callMutatingEndpoint } = await import('../src/api/client');

    // 1. AdminSettingsView uses unified radio groups, theme vars, and "Удалить турнир"
    const cAdmin = document.createElement('div');
    document.body.appendChild(cAdmin);
    const rAdmin = createRoot(cAdmin);
    await act(async () => {
      rAdmin.render(
        <AdminSettingsView
          snapshot={makePlayoffSnapshot({ isAdmin: true })}
          onBack={() => {}}
          onSave={async () => {}}
          onToggleLive={async () => {}}
          onTransferAdmin={async () => {}}
          onDelete={async () => {}}
          busy={false}
        />
      );
    });
    expect(cAdmin.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(cAdmin.querySelectorAll('[role="radio"]').length).toBeGreaterThanOrEqual(8);
    const adminSwitches = Array.from(cAdmin.querySelectorAll('[role="switch"]')) as HTMLButtonElement[];
    expect(adminSwitches.length).toBeGreaterThanOrEqual(5);
    expect(adminSwitches.some((sw) => sw.getAttribute('aria-checked') === 'true' && sw.className.includes('bg-emerald-500'))).toBe(true);
    expect(cAdmin.textContent).toContain('Удалить турнир');
    expect(cAdmin.textContent).not.toContain('Удалить дип');
    expect(cAdmin.innerHTML).not.toContain('#2c2c2e');
    const settingsScrollRoot = cAdmin.firstElementChild as HTMLElement;
    expect(settingsScrollRoot.className).toContain('h-full');
    expect(settingsScrollRoot.className).toContain('overflow-y-auto');
    expect(settingsScrollRoot.className).toContain('content-dock-pad');

    // 2. CreateTournamentView replaces checkboxes with radio buttons and blocks double submit
    let resolveSubmit: () => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        })
    );
    const cCreate = document.createElement('div');
    document.body.appendChild(cCreate);
    const rCreate = createRoot(cCreate);
    await act(async () => {
      rCreate.render(<CreateTournamentView defaultName="Тест" busy={false} onSubmit={onSubmit} />);
    });
    expect(cCreate.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(cCreate.querySelectorAll('[role="radio"]').length).toBeGreaterThanOrEqual(8);
    const createSwitches = Array.from(cCreate.querySelectorAll('[role="switch"]')) as HTMLButtonElement[];
    expect(createSwitches.length).toBeGreaterThanOrEqual(4);
    const autoRoundsSwitch = createSwitches.find((sw) => sw.getAttribute('aria-label') === 'Автоматические раунды');
    expect(autoRoundsSwitch?.getAttribute('aria-checked')).toBe('true');
    expect(autoRoundsSwitch?.className).toContain('bg-emerald-500');
    await act(async () => {
      autoRoundsSwitch?.click();
    });
    expect(autoRoundsSwitch?.getAttribute('aria-checked')).toBe('false');
    expect(autoRoundsSwitch?.className).not.toContain('bg-emerald-500');

    const form = cCreate.querySelector('form')!;
    await act(async () => {
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveSubmit();
    });

    // 3. callMutatingEndpoint deduplicates identical concurrent calls
    const callSpy = vi.fn((_ep: string, _inp: Record<string, unknown>, cb: (e: null, r: unknown) => void) => {
      setTimeout(() => cb(null, { ok: true }), 15);
    });
    (window as unknown as { Telegram: { WebApp: { initData: string; Serverless: { call: typeof callSpy } } } }).Telegram = {
      WebApp: {
        initData: 'auth_date=1&hash=abc',
        Serverless: { call: callSpy },
      },
    };
    const [p1, p2] = await Promise.all([
      callMutatingEndpoint('submitScore', { matchId: 10, score1: 5, score2: 3 }),
      callMutatingEndpoint('submitScore', { matchId: 10, score1: 5, score2: 3 }),
    ]);
    expect(callSpy).toHaveBeenCalledTimes(1);
    expect(p1).toEqual({ ok: true });
    expect(p2).toEqual({ ok: true });

    await act(async () => {
      rAdmin.unmount();
      rCreate.unmount();
    });
  });

  it('labels inactive players as "Отсутствует", highlights absent leaderboard rows gray, and shifts playoff zone past absent rows', async () => {
    const env = installTestDom();
    cleanupDom = env.cleanup;
    const { LeaderboardView } = await import('../src/components/LeaderboardView');
    const { AdminPlayersView } = await import('../src/components/AdminPlayersView');
    const { getPlayoffQualifiedIds } = await import('../src/utils/playoffZone');

    const snapshot = makePlayoffSnapshot({ isAdmin: true });
    snapshot.tournament.status = 'QUALIFICATION';
    snapshot.tournament.playoffSize = 4;
    snapshot.players = [
      { id: 1, tournamentId: 77, tgId: 10, name: 'Первый', initials: 'П1', isActive: true, isGuest: false, byesCount: 0 },
      { id: 2, tournamentId: 77, tgId: 11, name: 'Отсутствующий Второй', initials: 'О2', isActive: false, isGuest: false, byesCount: 0 },
      { id: 3, tournamentId: 77, tgId: 12, name: 'Третий', initials: 'Т3', isActive: true, isGuest: false, byesCount: 0 },
      { id: 4, tournamentId: 77, tgId: 13, name: 'Четвертый', initials: 'Ч4', isActive: true, isGuest: false, byesCount: 0 },
      { id: 5, tournamentId: 77, tgId: 14, name: 'Пятый Запасной', initials: 'П5', isActive: true, isGuest: false, byesCount: 0 },
    ];
    snapshot.leaderboard = snapshot.players.map((p, idx) => ({
      rank: idx + 1,
      playerId: p.id,
      name: p.name,
      initials: p.initials,
      isActive: p.isActive,
      byesCount: 0,
      games: 3,
      wins: 3 - idx,
      points: (3 - idx) * 2,
      goalsFor: 15,
      goalsAgainst: 6,
      diff: 9 - idx,
      ppm: 2,
    }));

    // Qualified top-4 skips absent #2 and includes #5
    const qualified = getPlayoffQualifiedIds(snapshot.leaderboard, 4);
    expect([...qualified]).toEqual([1, 3, 4, 5]);

    const cLb = document.createElement('div');
    document.body.appendChild(cLb);
    const rLb = createRoot(cLb);
    await act(async () => {
      rLb.render(
        <LeaderboardView
          snapshot={snapshot}
          initialSubTab="group"
          onUpdateTableConfig={async () => {}}
          onToast={() => {}}
          busy={false}
        />
      );
    });
    expect(cLb.textContent).toContain('Отсутствует');
    expect(cLb.textContent).not.toContain('На паузе');
    const absentRow = Array.from(cLb.querySelectorAll('div.rounded-xl')).find((el) =>
      el.textContent?.includes('Отсутствующий Второй')
    );
    expect(absentRow?.className).toContain('bg-gray-500/20');

    const cPlayers = document.createElement('div');
    document.body.appendChild(cPlayers);
    const rPlayers = createRoot(cPlayers);
    await act(async () => {
      rPlayers.render(
        <AdminPlayersView
          snapshot={snapshot}
          onBack={() => {}}
          onAddGuest={async () => {}}
          onManagePlayer={async () => {}}
          onToggleActive={async () => {}}
          onSwapSeed={async () => {}}
          onSeedTop={async () => {}}
          busy={false}
        />
      );
    });
    expect(cPlayers.textContent).toContain('Отсутствует');
    expect(cPlayers.textContent).toContain('Вернуть');
    expect(cPlayers.textContent).not.toContain('На паузе');
    expect(cPlayers.innerHTML).not.toContain('Поставить на паузу');

    await act(async () => {
      rLb.unmount();
      rPlayers.unmount();
    });
  });
});
