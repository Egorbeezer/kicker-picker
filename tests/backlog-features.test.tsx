import React, { act } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { installTestDom } from './helpers/dom';

const bootDom = installTestDom();
const { createRoot } = await import('react-dom/client');
bootDom.cleanup();
import { CreateTournamentView } from '../src/components/CreateTournamentView';
import { HomeView } from '../src/components/HomeView';
import { LeaderboardView } from '../src/components/LeaderboardView';
import { PlayoffBracketView } from '../src/components/PlayoffBracketView';
import { AdminDashboardView } from '../src/components/AdminDashboardView';
import { AdminPlayersView } from '../src/components/AdminPlayersView';
import { ProfileView } from '../src/components/ProfileView';
import type {
  ClubPlayer,
  PlayerGlobalProfile,
  TournamentHistoryItem,
  TournamentSnapshot,
} from '../src/types';

function makeSnapshot(overrides: Partial<TournamentSnapshot> = {}): TournamentSnapshot {
  const base: TournamentSnapshot = {
    tournament: {
      id: 101,
      name: 'Кубок пятницы 14.11.2026',
      creatorTgId: 10,
      coAdminTgIds: [],
      status: 'QUALIFICATION',
      currentRound: 1,
      tablesCount: 2,
      disabledTables: [],
      autoRounds: true,
      pendingPlayoff: false,
      dypMode: 'monster',
      teamFormat: 'pairs',
      roundRobinLoops: 1,
      losLives: 3,
      skipQualification: false,
      longMatchAlertMin: 15,
      scoreReminderMin: 3,
      useBuckets: false,
      targetScore: 5,
      winByTwo: false,
      maxScore: 7,
      playoffSize: 8,
      thirdPlaceMatch: true,
      playoffFormat: 'best_of_1',
      playoffTargetScore: 5,
      playoffWinByTwo: false,
      playoffMaxScore: 7,
      publicPath: null,
      tableConfig: [
        { key: 'points', sort: true, visible: true },
        { key: 'buchholz', sort: true, visible: true },
        { key: 'avgBuchholz', sort: true, visible: true },
        { key: 'sonnebornBerger', sort: true, visible: true },
      ],
    },
    isAdmin: true,
    isCreator: true,
    myPlayerId: 1,
    players: [
      { id: 1, tournamentId: 101, tgId: 10, name: 'Egor B.', initials: 'EB', isActive: true, isGuest: false, byesCount: 0, sortOrder: 1, livesLeft: 3 },
      { id: 2, tournamentId: 101, tgId: 11, name: 'Маша', initials: 'МА', isActive: true, isGuest: false, byesCount: 0, sortOrder: 2, livesLeft: 3 },
      { id: 3, tournamentId: 101, tgId: 12, name: 'Костя', initials: 'КО', isActive: true, isGuest: false, byesCount: 0, sortOrder: 3, livesLeft: 3 },
      { id: 4, tournamentId: 101, tgId: 13, name: 'Юля', initials: 'ЮЛ', isActive: true, isGuest: false, byesCount: 0, sortOrder: 4, livesLeft: 3 },
    ],
    leaderboard: [
      { rank: 1, playerId: 1, name: 'Egor B.', initials: 'EB', isActive: true, byesCount: 0, games: 2, wins: 2, points: 4, goalsFor: 10, goalsAgainst: 4, diff: 6, ppm: 2, buchholz: 3, avgBuchholz: 1.5, sonnebornBerger: 3 },
      { rank: 2, playerId: 2, name: 'Маша', initials: 'МА', isActive: true, isGuest: false, byesCount: 0, games: 2, wins: 1, points: 2, goalsFor: 7, goalsAgainst: 7, diff: 0, ppm: 1, buchholz: 4, avgBuchholz: 2, sonnebornBerger: 2 } as any,
    ],
    currentRoundMatches: [
      {
        id: 501,
        stage: 'QUALIFICATION',
        roundNumber: 1,
        tableNumber: 1,
        team1Players: [
          { id: 1, name: 'Egor B.', initials: 'EB' },
          { id: 2, name: 'Маша', initials: 'МА' },
        ],
        team2Players: [
          { id: 3, name: 'Костя', initials: 'КО' },
          { id: 4, name: 'Юля', initials: 'ЮЛ' },
        ],
        team1Label: 'Egor B. & Маша',
        team2Label: 'Костя & Юля',
        score1: 0,
        score2: 0,
        bestOf: 1,
        setsWon1: 0,
        setsWon2: 0,
        status: 'PLAYING',
        submittedByTgId: null,
      },
      {
        id: 502,
        stage: 'QUALIFICATION',
        roundNumber: 1,
        tableNumber: 2,
        team1Players: [{ id: 3, name: 'Костя', initials: 'КО' }],
        team2Players: [{ id: 4, name: 'Юля', initials: 'ЮЛ' }],
        team1Label: 'Костя',
        team2Label: 'Юля',
        score1: 5,
        score2: 2,
        bestOf: 1,
        setsWon1: 1,
        setsWon2: 0,
        status: 'FINISHED',
        submittedByTgId: 10,
      },
    ],
    playoffMatches: [
      {
        id: 601,
        stage: 'PLAYOFF',
        roundNumber: 1,
        bracketSlot: 'SF1',
        tableNumber: 1,
        team1Players: [
          { id: 1, name: 'Egor B.', initials: 'EB' },
          { id: 2, name: 'Маша', initials: 'МА' },
        ],
        team2Players: [
          { id: 3, name: 'Костя', initials: 'КО' },
          { id: 4, name: 'Юля', initials: 'ЮЛ' },
        ],
        team1Label: 'Egor B. & Маша',
        team2Label: 'Костя & Юля',
        score1: 5,
        score2: 3,
        bestOf: 1,
        setsWon1: 1,
        setsWon2: 0,
        status: 'FINISHED',
        submittedByTgId: 10,
      },
      {
        id: 602,
        stage: 'PLAYOFF',
        roundNumber: 2,
        bracketSlot: 'FINAL',
        tableNumber: 1,
        team1Players: [
          { id: 1, name: 'Egor B.', initials: 'EB' },
          { id: 2, name: 'Маша', initials: 'МА' },
        ],
        team2Players: [],
        team1Label: 'Egor B. & Маша',
        team2Label: 'Ожидает победителя',
        score1: 0,
        score2: 0,
        bestOf: 1,
        setsWon1: 0,
        setsWon2: 0,
        status: 'PENDING',
        submittedByTgId: null,
      },
    ],
    myCurrentMatch: null,
    myHistory: [],
  };

  return {
    ...base,
    ...overrides,
    tournament: { ...base.tournament, ...(overrides.tournament || {}) },
  };
}

let cleanupDom: (() => void) | null = null;
afterEach(() => {
  cleanupDom?.();
  cleanupDom = null;
  vi.restoreAllMocks();
});

function setReactInputValue(el: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  proto?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('P1 + P2 + Home Profile backlog UI features', () => {
  it('CreateTournamentView renders 8 mode cards, kid-friendly tooltip, and mode-specific options', async () => {
    const dom = installTestDom();
    cleanupDom = dom.cleanup;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <CreateTournamentView
          defaultName="Пятница 14.11.2026"
          busy={false}
          onSubmit={onSubmit}
        />
      );
    });

    // Mode cards visible
    expect(container.textContent).toContain('Monster DYP');
    expect(container.textContent).toContain('Швейцарка');
    expect(container.textContent).toContain('Круговой');
    expect(container.textContent).toContain('Random DYP');
    expect(container.textContent).toContain('Last One Standing');
    expect(container.textContent).toContain('Whist');
    expect(container.textContent).toContain('Сразу Плей-офф');

    // Open tooltip on Швейцарка card (button "Подробнее про Швейцарка (Swiss)")
    const swissInfoBtn = container.querySelector('[aria-label="Подробнее про Швейцарка (Swiss)"]') as HTMLButtonElement;
    expect(swissInfoBtn).not.toBeNull();
    await act(async () => {
      swissInfoBtn.click();
    });
    expect(document.body.textContent).toContain('Простой пример');

    // Close tooltip modal
    const closeBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Понятно!') || b.textContent?.includes('Закрыть')
    ) as HTMLButtonElement;
    if (closeBtn) {
      await act(async () => {
        closeBtn.click();
      });
    }

    // Select Круговой (Round Robin), toggle 1×1 & 2 круга, then submit
    const rrCard = Array.from(container.querySelectorAll('[role="button"]')).find((el) =>
      el.textContent?.includes('Круговой')
    ) as HTMLElement;
    await act(async () => {
      rrCard.click();
    });
    expect(container.textContent).toContain('2 круга');

    const singleBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Одиночный (1×1)')
    ) as HTMLButtonElement;
    const twoLoopsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('2 круга')
    ) as HTMLButtonElement;
    await act(async () => {
      singleBtn.click();
      twoLoopsBtn.click();
    });

    const submitBtn = Array.from(container.querySelectorAll('button[type="submit"]'))[0] as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.dypMode).toBe('round_robin');
    expect(payload.teamFormat).toBe('single');
    expect(payload.roundRobinLoops).toBe(2);

    await act(async () => {
      root.unmount();
    });
  });

  it('HomeView renders player global profile, partners, H2H, chart with DD.MM.YYYY and badges', async () => {
    const dom = installTestDom();
    cleanupDom = dom.cleanup;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const profile: PlayerGlobalProfile = {
      tournamentsPlayed: 6,
      finishedTournaments: 5,
      championCount: 2,
      podiumCount: 4,
      totalMatches: 24,
      totalWins: 18,
      winRate: 75,
      avgGoalsPerMatch: 4.5,
      mostFrequentPartner: { name: 'Маша', tgId: 11, games: 10, wins: 8, winRate: 80 },
      bestPartner: { name: 'Петя', tgId: 12, games: 5, wins: 5, winRate: 100 },
      toughestOpponent: { name: 'Костя', tgId: 13, games: 6, wins: 1, losses: 5, lossRate: 83 },
      timeline: [
        { tournamentId: 1, tournamentName: 'T1', dateLabel: '01.11.2026', avgPoints: 1.4, wins: 3, games: 5, rank: 3 },
        { tournamentId: 2, tournamentName: 'T2', dateLabel: '14.11.2026', avgPoints: 1.9, wins: 5, games: 5, rank: 1 },
      ],
      badges: [
        { id: 'champ', emoji: '🏆', title: 'Победитель турнира', description: '1-е место', count: 2 },
        { id: 'comeback', emoji: '⚡', title: 'Камбэк дня', description: 'Выиграл с 0:4', count: 1 },
      ],
    };

    const history: TournamentHistoryItem[] = [
      { ...makeSnapshot().tournament, participantsCount: 8, myStats: null },
    ];

    await act(async () => {
      root.render(
        <HomeView
          tournaments={history}
          currentTournamentId={101}
          playerProfile={profile}
          userName="Егор Балагуров"
          userAvatarUrl="https://example.com/avatar.jpg"
          onSelectTournament={() => {}}
          onCreateTournament={() => {}}
        />
      );
    });

    // Collapsed by default: shows avatar + 4 circular metrics, details accordion collapsed cleanly
    const profileCard = container.querySelector('[data-testid="home-profile-card"]') as HTMLElement | null;
    expect(profileCard).not.toBeNull();
    expect(profileCard?.getAttribute('aria-expanded')).toBe('false');
    const avatarImg = profileCard?.querySelector('img[alt="Егор Балагуров"]') as HTMLImageElement | null;
    expect(avatarImg?.getAttribute('src')).toBe('https://example.com/avatar.jpg');
    expect(container.textContent).toContain('Мой профиль');
    expect(container.textContent).toContain('75%');
    expect(container.textContent).toContain('Турниров');
    expect(container.textContent).toContain('Побед');
    expect(container.textContent).toContain('Винрейт');
    expect(container.textContent).toContain('Гол/матч');
    expect(profileCard!.querySelectorAll('.rounded-full').length).toBeGreaterThanOrEqual(4);
    const detailsEl = container.querySelector('[data-testid="home-profile-details"]') as HTMLElement | null;
    expect(detailsEl).not.toBeNull();
    expect(detailsEl?.getAttribute('aria-hidden')).toBe('true');
    expect(detailsEl?.className).toContain('grid-rows-[0fr]');
    expect(detailsEl?.className).toContain('transition-[grid-template-rows,opacity]');

    // First tap expands full stats smoothly
    await act(async () => {
      profileCard!.click();
    });
    expect(profileCard?.getAttribute('aria-expanded')).toBe('true');
    expect(detailsEl?.getAttribute('aria-hidden')).toBe('false');
    expect(detailsEl?.className).toContain('grid-rows-[1fr]');
    expect(container.textContent).toContain('Маша');
    expect(container.textContent).toContain('Петя');
    expect(container.textContent).toContain('Костя');
    expect(container.textContent).toContain('01.11.2026');
    expect(container.textContent).toContain('14.11.2026');
    expect(container.textContent).toContain('Победитель турнира');
    expect(container.textContent).toContain('Камбэк дня');

    // Second tap collapses back smoothly
    await act(async () => {
      profileCard!.click();
    });
    expect(profileCard?.getAttribute('aria-expanded')).toBe('false');
    expect(detailsEl?.getAttribute('aria-hidden')).toBe('true');
    expect(detailsEl?.className).toContain('grid-rows-[0fr]');

    await act(async () => {
      root.unmount();
    });
  });

  it('LeaderboardView displays BH₁/ØBH/SB columns and supports drag reordering in Table Config modal', async () => {
    const dom = installTestDom();
    cleanupDom = dom.cleanup;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onSaveTableConfig = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <LeaderboardView
          snapshot={makeSnapshot({ playoffMatches: [] })}
          onSaveTableConfig={onSaveTableConfig}
        />
      );
    });

    expect(container.textContent).toContain('BH₁');
    expect(container.textContent).toContain('ØBH');
    expect(container.textContent).toContain('SB');

    const configBtn = container.querySelector('[title="Настроить таблицу"]') as HTMLButtonElement;
    expect(configBtn).not.toBeNull();
    await act(async () => {
      configBtn.click();
    });

    // Modal rendered via portal or inside body
    const handlePoints = document.body.querySelector('[data-testid="col-row-points"]') as HTMLElement;
    const targetSb = document.body.querySelector('[data-testid="col-row-sonnebornBerger"]') as HTMLElement;
    expect(handlePoints).not.toBeNull();
    expect(targetSb).not.toBeNull();

    await act(async () => {
      handlePoints.dispatchEvent(new Event('dragstart', { bubbles: true }));
    });
    await act(async () => {
      targetSb.dispatchEvent(new Event('dragover', { bubbles: true }));
      targetSb.dispatchEvent(new Event('drop', { bubbles: true }));
    });

    const saveBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Сохранить'
    ) as HTMLButtonElement;
    await act(async () => {
      saveBtn.click();
    });

    expect(onSaveTableConfig).toHaveBeenCalledTimes(1);
    const saved = onSaveTableConfig.mock.calls[0][0];
    // Points moved from index 0 to index 3 (where sonnebornBerger was)
    expect(saved[3].key).toBe('points');

    await act(async () => {
      root.unmount();
    });
  });

  it('PlayoffBracketView switches between Сетка and Список and adjusts zoom slider', async () => {
    const dom = installTestDom();
    cleanupDom = dom.cleanup;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const snap = makeSnapshot({ tournament: { ...makeSnapshot().tournament, status: 'PLAYOFF', playoffSize: 4 } });

    await act(async () => {
      root.render(
        <PlayoffBracketView
          matches={snap.playoffMatches}
          playoffSize={4}
          thirdPlaceMatch={true}
          myPlayerId={1}
        />
      );
    });

    const zoomSlider = container.querySelector('[aria-label="Масштаб сетки"]') as HTMLInputElement;
    expect(zoomSlider).not.toBeNull();
    await act(async () => {
      setReactInputValue(zoomSlider, '70');
    });
    expect(container.textContent).toContain('70%');

    const listBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Список')
    ) as HTMLButtonElement;
    await act(async () => {
      listBtn.click();
    });

    expect(container.textContent).toContain('Полуфинал');
    expect(container.textContent).toContain('Финал');

    await act(async () => {
      root.unmount();
    });
  });

  it('AdminDashboardView filters matches, saves inline score, and opens customizable Start Playoff modal', async () => {
    const dom = installTestDom();
    cleanupDom = dom.cleanup;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onAdminSaveMatch = vi.fn().mockResolvedValue(undefined);
    const onStartPlayoff = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <AdminDashboardView
          snapshot={makeSnapshot()}
          busy={false}
          onStartRound={async () => {}}
          onStartPlayoff={onStartPlayoff}
          onCancelPendingPlayoff={async () => {}}
          onFinishTournament={async () => {}}
          onDeleteLastRound={async () => {}}
          onAdminSaveMatch={onAdminSaveMatch}
          onAdminManageMatch={async () => {}}
          onToggleDisabledTable={async () => {}}
          onToggleLive={async () => {}}
          onOpenSettings={() => {}}
          onRefresh={async () => {}}
        />
      );
    });

    // Search filters out second match
    const searchInput = container.querySelector('[aria-label="Поиск матчей"]') as HTMLInputElement;
    await act(async () => {
      setReactInputValue(searchInput, 'Маша');
    });
    expect(container.textContent).toContain('Egor B. & Маша');
    expect(container.textContent).not.toContain('Стол 2');

    // Open inline score picker
    const quickScoreBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Быстрый счёт')
    ) as HTMLButtonElement;
    await act(async () => {
      quickScoreBtn.click();
    });

    const saveInlineBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Сохранить 0:0')
    ) as HTMLButtonElement;
    await act(async () => {
      saveInlineBtn.click();
    });
    expect(onAdminSaveMatch).toHaveBeenCalledWith(501, 0, 0);

    // Open playoff modal and change size to Топ-4 & toggle 3rd place off
    const toPlayoffBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('В плей-офф')
    ) as HTMLButtonElement;
    await act(async () => {
      toPlayoffBtn.click();
    });
    expect(document.body.textContent).toContain('Запуск плей-офф');

    const top4Btn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Топ-4'
    ) as HTMLButtonElement;
    const thirdPlaceCheckbox = document.body.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      top4Btn.click();
      thirdPlaceCheckbox.click();
    });

    const launchBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Начать плей-офф')
    ) as HTMLButtonElement;
    await act(async () => {
      launchBtn.click();
    });

    expect(onStartPlayoff).toHaveBeenCalledWith({ playoffSize: 4, thirdPlaceMatch: false });

    await act(async () => {
      root.unmount();
    });
  });

  it('AdminPlayersView supports search, club roster, delete/substitute/co-admin, and Round 0 seeding', async () => {
    const dom = installTestDom();
    cleanupDom = dom.cleanup;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onAddGuest = vi.fn().mockResolvedValue(undefined);
    const onManagePlayer = vi.fn().mockResolvedValue(undefined);
    const onStartRound = vi.fn().mockResolvedValue(undefined);

    const regSnap = makeSnapshot({
      tournament: { ...makeSnapshot().tournament, status: 'REGISTRATION', currentRound: 0 },
    });
    const clubPlayers: ClubPlayer[] = [
      { id: 70, ownerTgId: 10, name: 'Антон Клубный', tgId: 55, dypRole: null },
    ];

    await act(async () => {
      root.render(
        <AdminPlayersView
          snapshot={regSnap}
          clubPlayers={clubPlayers}
          onAddGuest={onAddGuest}
          onManagePlayer={onManagePlayer}
          onToggleActive={async () => {}}
          onManageClubPlayer={async () => {}}
          onStartRound={onStartRound}
          busy={false}
        />
      );
    });

    // Pre-round-1 shuffle seeding button works
    const shuffleBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Перемешать посев')
    ) as HTMLButtonElement;
    await act(async () => {
      shuffleBtn.click();
    });
    expect(onManagePlayer).toHaveBeenCalledWith({ action: 'shuffle_seeding' });

    // Co-admin shield button for Маша
    const coAdminBtn = container.querySelector('[aria-label="Со-админ для Маша"]') as HTMLButtonElement;
    await act(async () => {
      coAdminBtn.click();
    });
    expect(onManagePlayer).toHaveBeenCalledWith({ playerId: 2, action: 'toggle_coadmin' });

    // Search filter narrows list
    const searchInput = container.querySelector('[aria-label="Поиск участников"]') as HTMLInputElement;
    await act(async () => {
      setReactInputValue(searchInput, 'Маша');
    });
    expect(container.textContent).toContain('Маша');
    expect(container.textContent).not.toContain('Костя');

    // Open Substitute modal for Маша & submit
    const subBtn = container.querySelector('[aria-label="Заменить Маша"]') as HTMLButtonElement;
    await act(async () => {
      subBtn.click();
    });
    const subInput = document.body.querySelector('input[placeholder="Имя игрока на замену"]') as HTMLInputElement;
    expect(subInput).not.toBeNull();
    await act(async () => {
      setReactInputValue(subInput, 'Аня');
    });
    const confirmSubBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Заменить'
    ) as HTMLButtonElement;
    await act(async () => {
      confirmSubBtn.click();
    });
    expect(onManagePlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 2,
        action: 'substitute',
        replacementName: 'Аня',
      })
    );

    // Clear search and test club player selection in Add modal
    await act(async () => {
      setReactInputValue(searchInput, '');
    });
    const delBtn = container.querySelector('[aria-label="Удалить Костя"]') as HTMLButtonElement;
    expect(delBtn).not.toBeNull();
    await act(async () => {
      delBtn.click();
    });
    expect(onManagePlayer).toHaveBeenCalledWith({ playerId: 3, action: 'delete_player' });

    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Добавить участников')
    ) as HTMLButtonElement;
    await act(async () => {
      addBtn.click();
    });
    const clubChip = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Антон Клубный')
    ) as HTMLButtonElement;
    expect(clubChip).not.toBeNull();
    await act(async () => {
      clubChip.click();
    });
    const saveAddBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.getAttribute('form') === 'bulk-add-form'
    ) as HTMLButtonElement;
    await act(async () => {
      saveAddBtn.click();
    });
    expect(onAddGuest).toHaveBeenCalledWith(
      expect.objectContaining({
        clubPlayerIds: [70],
      })
    );

    await act(async () => {
      root.unmount();
    });
  });

  it('ProfileView asks confirmation before leaving an unfinished tournament and invokes onLeave on confirm', async () => {
    const dom = installTestDom();
    cleanupDom = dom.cleanup;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onLeave = vi.fn().mockResolvedValue(undefined);

    const snapshot = makeSnapshot({
      tournament: {
        ...makeSnapshot().tournament,
        status: 'PLAYOFF',
      },
      myPlayerId: 1,
    });

    await act(async () => {
      root.render(
        <ProfileView
          snapshot={snapshot}
          tournamentHistory={[]}
          theme="light"
          onChangeTheme={() => {}}
          onSelectTournament={() => {}}
          onLeave={onLeave}
          busy={false}
        />
      );
    });

    const leaveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Выписаться из турнира')
    ) as HTMLButtonElement | undefined;
    expect(leaveBtn).toBeDefined();
    await act(async () => {
      leaveBtn!.click();
    });

    expect(document.body.textContent).toContain('Точно уверен? Весь прогресс потеряется');
    expect(onLeave).not.toHaveBeenCalled();

    const cancelBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Отмена'
    ) as HTMLButtonElement | undefined;
    expect(cancelBtn).toBeDefined();
    await act(async () => {
      cancelBtn!.click();
    });
    expect(onLeave).not.toHaveBeenCalled();

    await act(async () => {
      leaveBtn!.click();
    });
    const confirmLeaveBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Выписаться'
    ) as HTMLButtonElement | undefined;
    expect(confirmLeaveBtn).toBeDefined();
    await act(async () => {
      confirmLeaveBtn!.click();
    });
    expect(onLeave).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('ProfileView uses unified TournamentHistoryCard design and HomeView falls back to user initials without avatarUrl', async () => {
    const dom = installTestDom();
    cleanupDom = dom.cleanup;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const history: TournamentHistoryItem[] = [
      {
        id: 201,
        name: 'Friday Cup',
        status: 'QUALIFICATION',
        dypMode: 'monster',
        teamFormat: 'dyp',
        tables: 2,
        goalsToWin: 7,
        publicPath: 'live-201',
        createdAt: 1700000000,
        startedAt: 1700000000,
        finishedAt: null,
        participantsCount: 12,
        isAdmin: true,
        myStats: {
          rank: 2,
          wins: 5,
          losses: 1,
          games: 6,
          points: 11,
          ppm: 1.83,
          buchholz: 20,
          pointsDiff: 12,
          isEliminated: false,
        },
      },
      {
        id: 202,
        name: 'Singles Open',
        status: 'FINISHED',
        dypMode: 'swiss',
        teamFormat: 'single',
        tables: 2,
        goalsToWin: 7,
        publicPath: null,
        createdAt: 1699000000,
        startedAt: 1699000000,
        finishedAt: 1699005000,
        participantsCount: 8,
        isAdmin: true,
        myStats: null,
      },
    ];

    await act(async () => {
      root.render(
        <ProfileView
          snapshot={makeSnapshot()}
          tournamentHistory={history}
          theme="dark"
          onChangeTheme={() => {}}
          onSelectTournament={() => {}}
          onLeave={async () => {}}
          busy={false}
        />
      );
    });

    expect(container.textContent).toContain('Friday Cup');
    expect(container.textContent).toContain('LIVE');
    expect(container.textContent).toContain('Monster DYP');
    expect(container.textContent).toContain('#2');
    expect(container.textContent).toContain('Ср.очк: 1.83');
    expect(container.textContent).toContain('Швейцарка 1×1');
    expect(container.textContent).toContain('Вы организатор');
    expect(container.textContent).toContain('Открыть');

    await act(async () => {
      root.render(
        <HomeView
          tournaments={history}
          currentTournamentId={201}
          playerProfile={{
            tournamentsPlayed: 2,
            totalMatches: 6,
            totalWins: 5,
            winRate: 83,
            championCount: 0,
            avgGoalsPerMatch: 4.5,
            mostFrequentPartner: null,
            bestPartner: null,
            toughestOpponent: null,
            timeline: [],
            badges: [],
          }}
          userName="Егор Балагуров"
          onSelectTournament={() => {}}
          onCreateTournament={() => {}}
        />
      );
    });

    const profileCard = container.querySelector('[data-testid="home-profile-card"]');
    expect(profileCard?.textContent).toContain('ЕБ');

    await act(async () => {
      root.unmount();
    });
  });

  it('hydrateSnapshotAvatars restores deduplicated player avatars into leaderboard and matches', async () => {
    const { hydrateSnapshotAvatars } = await import('../src/utils/snapshotHydrate');
    const raw = makeSnapshot({
      players: [
        { id: 1, tournamentId: 1, tgId: 101, name: 'Егор', initials: 'ЕГ', avatarUrl: 'data:image/jpeg;base64,AV1', isActive: true, isGuest: false, byesCount: 0, points: 4 },
        { id: 2, tournamentId: 1, tgId: 102, name: 'Макс', initials: 'МК', avatarUrl: null, isActive: true, isGuest: false, byesCount: 0, points: 2 },
      ],
      leaderboard: [
        { rank: 1, playerId: 1, tgId: 101, name: 'Егор', initials: 'ЕГ', isActive: true, points: 4, games: 2, wins: 2, losses: 0, diff: 4, goalsFor: 10, goalsAgainst: 6, ppm: 2, byesCount: 0 },
      ],
      currentRoundMatches: [
        {
          id: 55,
          tournamentId: 1,
          stage: 'QUALIFICATION',
          roundNumber: 1,
          tableNumber: 1,
          status: 'PLAYING',
          score1: 0,
          score2: 0,
          setsWon1: 0,
          setsWon2: 0,
          team1Players: [{ id: 1, name: 'Егор', initials: 'ЕГ', isGuest: false }],
          team2Players: [{ id: 2, name: 'Макс', initials: 'МК', isGuest: false }],
          team1Label: 'Егор',
          team2Label: 'Макс',
          myTeam: 1,
        },
      ],
    });
    const hydrated = hydrateSnapshotAvatars(raw)!;
    expect(hydrated.leaderboard[0].avatarUrl).toBe('data:image/jpeg;base64,AV1');
    expect(hydrated.currentRoundMatches[0].team1Players[0].avatarUrl).toBe('data:image/jpeg;base64,AV1');
    expect(hydrated.currentRoundMatches[0].team2Players[0].avatarUrl).toBeNull();
  });

  it('callEndpoint times out hung WebView calls cleanly and clears inFlightMutations lock', async () => {
    const dom = installTestDom();
    cleanupDom = dom.cleanup;
    vi.useFakeTimers();
    try {
      const { callEndpoint, callMutatingEndpoint } = await import('../src/api/client');
      let callCount = 0;
      window.Telegram = {
        WebApp: {
          initData: 'user=%7B%22id%22%3A1%7D',
          Serverless: {
            call: (_name, _input, cb) => {
              callCount += 1;
              // Первый вызов "зависает", второй отвечает сразу
              if (callCount === 2) {
                cb(null, { ok: true });
              }
            },
          },
        },
      };

      const firstPromise = callEndpoint('getState', {}, { timeoutMs: 100 });
      vi.advanceTimersByTime(110);
      await expect(firstPromise).rejects.toThrow(/Превышено время ожидания ответа сервера/);

      // Дедуплицированная мутация после таймаута сбрасывает lock и повторяется успешно
      callCount = 0;
      const hungMutation = callMutatingEndpoint('submitScore', { matchId: 1 });
      vi.advanceTimersByTime(15_010);
      await expect(hungMutation).rejects.toThrow(/Превышено время ожидания ответа сервера/);

      const retryMutation = callMutatingEndpoint<{ ok: boolean }>('submitScore', { matchId: 1 });
      await expect(retryMutation).resolves.toEqual({ ok: true });
      expect(callCount).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('PublicLiveView keeps loaded scoreboard visible with warning banner on refresh error', async () => {
    const dom = installTestDom();
    cleanupDom = dom.cleanup;
    const origFetch = globalThis.fetch;
    try {
      const livePayload = {
        v: 1,
        updatedAt: Date.now(),
        tournament: {
          id: 55,
          name: 'Кубок Лайв',
          status: 'QUALIFICATION',
          currentRound: 1,
          tablesCount: 1,
          dypMode: 'monster',
          targetScore: 5,
          playoffSize: 4,
          playoffFormat: 'best_of_1',
          playoffTargetScore: 5,
          publicPath: 'Live-Test-11-16',
        },
        leaderboard: [
          {
            rank: 1,
            playerId: 1,
            name: 'Егор',
            initials: 'ЕГ',
            games: 1,
            wins: 1,
            losses: 0,
            points: 2,
            diff: 3,
            goalsFor: 5,
            goalsAgainst: 2,
            ppm: 2,
            byesCount: 0,
            isActive: true,
          },
        ],
        currentRoundMatches: [],
        playoffMatches: [],
      };
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: { content: [{ tag: 'p', children: [JSON.stringify(livePayload)] }] },
          }),
        })
        .mockRejectedValueOnce(new Error('Network down'))
        .mockRejectedValueOnce(new Error('Network down'));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const { PublicLiveView } = await import('../src/components/PublicLiveView');
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(<PublicLiveView publicPath="Live-Test-11-16" theme="dark" onToggleTheme={() => {}} />);
        await Promise.resolve();
        await Promise.resolve();
      });
      await vi.waitFor(() => {
        expect(container.textContent).toContain('Кубок Лайв');
      });

      const refreshBtn = container.querySelector('button[title="Обновить"]') as HTMLButtonElement;
      expect(refreshBtn).not.toBeNull();
      await act(async () => {
        refreshBtn.click();
        await Promise.resolve();
        await Promise.resolve();
      });
      await vi.waitFor(() => {
        expect(container.textContent).toContain('Проблема обновления данных');
      });
      // Таблица и турнир НЕ исчезли после сбоя фонового/повторного обновления
      expect(container.textContent).toContain('Кубок Лайв');
      expect(container.textContent).toContain('Егор');

      await act(async () => {
        root.unmount();
      });
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('App shows retry screen instead of empty HomeView when initial getState fails', async () => {
    const dom = installTestDom();
    cleanupDom = dom.cleanup;
    window.Telegram = {
      WebApp: {
        initData: 'user=%7B%22id%22%3A1%7D',
        initDataUnsafe: { user: { id: 1, first_name: 'Егор', allows_write_to_pm: true } },
        Serverless: {
          call: (name, _input, cb) => {
            if (name === 'getState') {
              cb({ message: 'Нет связи с сервером', type: 'ENDPOINT_ERROR' }, null);
            } else {
              cb(null, { ok: true });
            }
          },
        },
      },
    };
    const App = (await import('../src/App')).default;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Не удалось загрузить данные');
      expect(container.textContent).toContain('Повторить');
    });
    expect(container.textContent).not.toContain('Сейчас нет активных турниров');

    await act(async () => {
      root.unmount();
    });
  });
});
