import React, { Suspense, lazy, useEffect, useState, useCallback, useRef } from 'react';
import {
  Trophy,
  Gamepad2,
  User,
  Settings,
  Users,
  Home,
  Share2,
  CheckCircle2,
  LayoutGrid,
  Sun,
  Moon,
  ArrowLeft,
} from 'lucide-react';
import { apiClient, getLivePathFromUrl, getStartTournamentId, isTelegramEnv } from './api/client';
import { getTournamentInviteLink, shareTournamentInTelegram } from './utils/share';
import { openTelegramChat, SUPPORT_BUTTON } from './support';
import { haptic, installFullscreenInsets, installKeyboardInset, notify } from './utils/telegram';
import { applyTheme, currentTheme, hydrateSavedTheme, type Theme } from './utils/theme';
import { formatDateRu } from './utils/date';
import type {
  AppStateResponse,
  CreateTournamentForm,
  TournamentSnapshot,
} from './types';
import { PlayerMatchView } from './components/PlayerMatchView';
import { LeaderboardView } from './components/LeaderboardView';
import { ProfileView } from './components/ProfileView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AdminPlayersView } from './components/AdminPlayersView';
import { AdminSettingsView } from './components/AdminSettingsView';
import { BottomNav, type BottomNavItem } from './components/BottomNav';
import { Brand } from './components/Brand';
import { Modal } from './components/Modal';
import { ToastHost } from './components/ToastHost';
import { SupportHeaderButton } from './components/SupportHeaderButton';
import { HomeView } from './components/HomeView';

const CreateTournamentView = lazy(() =>
  import('./components/CreateTournamentView').then((m) => ({ default: m.CreateTournamentView }))
);
const PublicLiveView = lazy(() =>
  import('./components/PublicLiveView').then((m) => ({ default: m.PublicLiveView }))
);

export default function App() {
  const livePath = getLivePathFromUrl();
  const [loading, setLoading] = useState(!livePath);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => currentTheme());
  const [appState, setAppState] = useState<AppStateResponse | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null);
  const [showHome, setShowHome] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<{ id: number; name: string } | null>(null);

  const [mode, setMode] = useState<'PLAYER' | 'ADMIN'>('PLAYER');
  const [playerTab, setPlayerTab] = useState<'match' | 'table' | 'profile'>('match');
  const [adminTab, setAdminTab] = useState<'dashboard' | 'players' | 'table' | 'settings'>('dashboard');

  const startHandledRef = useRef(false);

  const showError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Произошла ошибка';
    haptic('error');
    notify(msg);
  }, []);

  const fetchState = useCallback(
    async (tId?: number | null, opts?: { light?: boolean }) => {
      try {
        if (livePath || !isTelegramEnv()) {
          setLoading(false);
          return;
        }
        const startTournamentId = !startHandledRef.current ? getStartTournamentId() : null;
        if (startTournamentId && !startHandledRef.current) {
          startHandledRef.current = true;
          try {
            const joined = await apiClient.joinTournament(startTournamentId);
            setSelectedTournamentId(joined.tournament.id);
            setShowHome(false);
            const res = await apiClient.getState({ tournamentId: joined.tournament.id });
            setAppState(res);
            setLoading(false);
            return;
          } catch (joinErr) {
            showError(joinErr);
          }
        }

        const effectiveId = tId ?? selectedTournamentId;
        const canPollLight = Boolean(opts?.light && effectiveId);
        const res = await apiClient.getState(
          effectiveId ? { tournamentId: effectiveId, ...(canPollLight ? { light: true } : {}) } : {}
        );

        if (res.light) {
          let needsFullRefresh = false;
          setAppState((prev) => {
            if (!prev) {
              needsFullRefresh = true;
              return prev;
            }
            const prevStatus = prev.activeTournament?.tournament.status;
            const nextStatus = res.activeTournament?.tournament.status;
            if (prevStatus && nextStatus && prevStatus !== nextStatus && nextStatus === 'FINISHED') {
              needsFullRefresh = true;
            }
            return {
              ...prev,
              activeTournament: res.activeTournament,
            };
          });
          if (needsFullRefresh) {
            const full = await apiClient.getState(effectiveId ? { tournamentId: effectiveId } : {});
            setAppState(full);
          }
        } else {
          setAppState(res);
        }

        if (res.activeTournament && !selectedTournamentId) {
          setSelectedTournamentId(res.activeTournament.tournament.id);
          if (res.activeTournament.isAdmin) {
            setMode('ADMIN');
          }
        }
      } catch (err) {
        showError(err);
      } finally {
        setLoading(false);
      }
    },
    [selectedTournamentId, showError, livePath]
  );

  useEffect(() => {
    const stopInsets = installFullscreenInsets();
    const stopKeyboard = installKeyboardInset();
    hydrateSavedTheme((resolved) => setTheme(resolved));
    if (livePath) {
      return () => {
        stopInsets();
        stopKeyboard();
      };
    }
    const webApp = window.Telegram?.WebApp;
    webApp?.ready?.();
    webApp?.expand?.();
    const user = webApp?.initDataUnsafe?.user;
    if (user && user.allows_write_to_pm !== true && webApp?.requestWriteAccess) {
      const storageKey = `kp_write_req_${user.id}`;
      if (!sessionStorage.getItem(storageKey)) {
        sessionStorage.setItem(storageKey, '1');
        try {
          webApp.requestWriteAccess();
        } catch (_) {}
      }
    }
    fetchState();
    return () => {
      stopInsets();
      stopKeyboard();
    };
  }, [fetchState, livePath]);

  // 2.5s serverless live polling when tab is visible (light mode when inside tournament)
  useEffect(() => {
    if (livePath || !isTelegramEnv() || isCreating) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        const useLight = Boolean(!showHome && selectedTournamentId);
        fetchState(selectedTournamentId, { light: useLight });
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [fetchState, selectedTournamentId, isCreating, showHome, livePath]);

  const applySnapshot = (snap: TournamentSnapshot) => {
    setSelectedTournamentId(snap.tournament.id);
    setAppState((prev) => {
      if (!prev) return prev;
      const list = prev.tournaments || [];
      const exists = list.some((t) => t.id === snap.tournament.id);
      const historyList = prev.tournamentHistory || [];
      const historyExists = historyList.some((t) => t.id === snap.tournament.id);
      return {
        ...prev,
        tournaments: exists
          ? list.map((t) => (t.id === snap.tournament.id ? snap.tournament : t))
          : [snap.tournament, ...list],
        tournamentHistory: historyExists
          ? historyList.map((t) =>
              t.id === snap.tournament.id
                ? {
                    ...t,
                    ...snap.tournament,
                    participantsCount: snap.players.length,
                  }
                : t
            )
          : [
              {
                ...snap.tournament,
                participantsCount: snap.players.length,
                myStats: null,
              },
              ...historyList,
            ],
        activeTournament: snap,
      };
    });
  };

  const handleCreateTournament = async (form: CreateTournamentForm) => {
    setBusy(true);
    try {
      const snap = await apiClient.createTournament({ ...form, joinAsPlayer: true });
      applySnapshot(snap);
      setIsCreating(false);
      setShowHome(false);
      setMode('ADMIN');
      setAdminTab('players');
      setCreatedInvite({ id: snap.tournament.id, name: snap.tournament.name });
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (fn: () => Promise<TournamentSnapshot>) => {
    setBusy(true);
    try {
      const snap = await fn();
      applySnapshot(snap);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleManageClubPlayer = async (params: {
    action: 'list' | 'add' | 'delete';
    id?: number;
    name?: string;
  }) => {
    setBusy(true);
    try {
      const res = await apiClient.manageClubPlayer(params);
      setAppState((prev) => (prev ? { ...prev, clubPlayers: res.clubPlayers } : prev));
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const snapshot = appState?.activeTournament ?? null;
  const hideBottomNav = Boolean(
    snapshot && mode === 'PLAYER' && snapshot.tournament.status === 'FINISHED'
  );

  useEffect(() => {
    if (hideBottomNav && playerTab === 'profile') {
      setPlayerTab('match');
    }
  }, [hideBottomNav, playerTab]);

  if (livePath) {
    return (
      <Suspense fallback={<div className="w-full max-w-md mx-auto h-[100dvh] bg-[var(--bg)] flex items-center justify-center"><span className="loading loading-spinner text-[#2ea6ff]" /></div>}>
        <PublicLiveView
          publicPath={livePath}
          theme={theme}
          onToggleTheme={() => {
            const next = theme === 'dark' ? 'light' : 'dark';
            setTheme(next);
            applyTheme(next);
          }}
        />
      </Suspense>
    );
  }

  if (!isTelegramEnv()) {
    return (
      <div className="w-full max-w-md mx-auto h-[100dvh] bg-[var(--bg)] text-white flex flex-col items-center justify-center p-6 text-center">
        <ToastHost />
        <Trophy size={56} className="text-[#2ea6ff] mb-4" />
        <h1 className="text-2xl mb-2">
          <Brand />
        </h1>
        <p className="text-sm text-[var(--muted)] mb-6">
          Это Telegram Mini App на базе Telegram Serverless. Откройте приложение через бота{' '}
          <a
            href="https://t.me/kickerpickerbot"
            className="text-[#2ea6ff] underline font-semibold"
          >
            @kickerpickerbot
          </a>{' '}
          для автоматической авторизации и работы с турнирами.
        </p>
        <button
          type="button"
          onClick={() => openTelegramChat()}
          className="w-full max-w-xs py-3 px-4 rounded-2xl bg-[var(--bg-3)] border border-[var(--border-strong)] text-[var(--text)] text-sm font-semibold active:scale-95 transition-transform"
        >
          {SUPPORT_BUTTON}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto h-[100dvh] bg-[var(--bg)] text-white flex flex-col items-center justify-center gap-3">
        <ToastHost />
        <span className="loading loading-spinner text-[#2ea6ff]" />
        <Brand className="text-lg mt-1" />
        <span className="text-xs text-[var(--muted)]">Загрузка турнира...</span>
      </div>
    );
  }

  if (isCreating) {
    const defaultTournamentName = `Турнир ${formatDateRu(new Date())}`;
    return (
      <div className="w-full max-w-md mx-auto h-[100dvh] bg-[var(--bg)] text-[var(--text)] flex flex-col relative overflow-hidden">
        <ToastHost />
        <div className="bg-[var(--bg-2)] border-b border-[var(--border)] px-3 pb-2.5 pt-[calc(8px+var(--tg-inset-top,0px))] flex items-center justify-between gap-2 z-20 shrink-0">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              setIsCreating(false);
            }}
            className="w-10 h-10 rounded-full bg-[var(--bg-3)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text)] active:scale-95 shrink-0"
            aria-label="Назад"
            title="Назад"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="text-sm font-bold text-[var(--text)]">Новый турнир</span>
          <SupportHeaderButton />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pt-4 pb-8">
          <Suspense fallback={<div className="py-10 flex justify-center"><span className="loading loading-spinner text-[#2ea6ff]" /></div>}>
            <CreateTournamentView
              defaultName={defaultTournamentName}
              busy={busy}
              onSubmit={handleCreateTournament}
              onCancel={() => setIsCreating(false)}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  if (!snapshot || showHome) {
    const homeTournaments =
      appState?.tournamentHistory && appState.tournamentHistory.length > 0
        ? appState.tournamentHistory
        : (appState?.tournaments || []).map((t) => ({
            ...t,
            participantsCount: 0,
            myStats: null,
          }));
    const fullUserName = appState?.user
      ? [appState.user.first_name, appState.user.last_name].filter(Boolean).join(' ') ||
        appState.user.username ||
        'Игрок'
      : 'Игрок';

    return (
      <div className="w-full max-w-md mx-auto h-[100dvh] bg-[var(--bg)] text-[var(--text)] flex flex-col relative overflow-hidden">
        <ToastHost />
        <div className="bg-[var(--bg-2)] border-b border-[var(--border)] px-3 pb-2.5 pt-[calc(8px+var(--tg-inset-top,0px))] flex items-center justify-between gap-2 z-20 shrink-0">
          <div className="flex items-center gap-2 shrink-0">
            {snapshot && (
              <button
                type="button"
                onClick={() => {
                  haptic('light');
                  setShowHome(false);
                }}
                className="w-10 h-10 rounded-full bg-[var(--bg-3)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text)] active:scale-95 shrink-0"
                aria-label="Вернуться в турнир"
                title="Вернуться в турнир"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <SupportHeaderButton />
          </div>

          <Brand className="text-base" />

          <button
            type="button"
            onClick={() => {
              haptic('light');
              const next = theme === 'dark' ? 'light' : 'dark';
              setTheme(next);
              applyTheme(next);
            }}
            className="w-10 h-10 rounded-full bg-[var(--bg-3)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text)] active:scale-95 shrink-0"
            aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pt-4 pb-6">
          <HomeView
            tournaments={homeTournaments}
            currentTournamentId={snapshot?.tournament.id ?? null}
            playerProfile={appState?.playerProfile ?? null}
            userName={fullUserName}
            onSelectTournament={(tId) => {
              const picked = (appState?.tournaments || appState?.tournamentHistory || []).find((t) => t.id === tId);
              const uid = appState?.user.id ?? 0;
              const pickedIsAdmin = Boolean(
                picked &&
                  (picked.creatorTgId === uid ||
                    (Array.isArray(picked.coAdminTgIds) && picked.coAdminTgIds.includes(uid)))
              );
              setSelectedTournamentId(tId);
              setShowHome(false);
              setMode(pickedIsAdmin ? 'ADMIN' : 'PLAYER');
              setPlayerTab('match');
              setAdminTab('dashboard');
              fetchState(tId);
            }}
            onCreateTournament={() => setIsCreating(true)}
          />
        </div>
      </div>
    );
  }

  const navItems: BottomNavItem[] =
    mode === 'PLAYER'
      ? [
          {
            id: 'match',
            label: 'Матч',
            icon: <Gamepad2 size={20} />,
            active: playerTab === 'match',
            dot: snapshot.myCurrentMatch?.status === 'WAITING_CONFIRM',
            onClick: () => {
              haptic('light');
              setPlayerTab('match');
            },
          },
          {
            id: 'table',
            label: 'Таблица',
            icon: <Trophy size={20} />,
            active: playerTab === 'table',
            onClick: () => {
              haptic('light');
              setPlayerTab('table');
            },
          },
          {
            id: 'profile',
            label: 'Профиль',
            icon: <User size={20} />,
            active: playerTab === 'profile',
            onClick: () => {
              haptic('light');
              setPlayerTab('profile');
            },
          },
        ]
      : [
          {
            id: 'dashboard',
            label: 'Дашборд',
            icon: <LayoutGrid size={20} />,
            active: adminTab === 'dashboard',
            onClick: () => {
              haptic('light');
              setAdminTab('dashboard');
            },
          },
          {
            id: 'players',
            label: 'Участники',
            icon: <Users size={20} />,
            active: adminTab === 'players',
            onClick: () => {
              haptic('light');
              setAdminTab('players');
            },
          },
          {
            id: 'table',
            label: 'Таблица',
            icon: <Trophy size={20} />,
            active: adminTab === 'table',
            onClick: () => {
              haptic('light');
              setAdminTab('table');
            },
          },
          {
            id: 'settings',
            label: 'Настройки',
            icon: <Settings size={20} />,
            active: adminTab === 'settings',
            onClick: () => {
              haptic('light');
              setAdminTab('settings');
            },
          },
        ];

  return (
    <div className="w-full max-w-md mx-auto h-[100dvh] bg-[var(--bg)] text-white flex flex-col relative overflow-hidden">
      <ToastHost />

      {/* Top bar: home + support button + role / finished tabs */}
      <div className="bg-[var(--bg-2)] border-b border-[var(--border)] px-3 pb-2.5 pt-[calc(8px+var(--tg-inset-top,0px))] flex items-center justify-between gap-2 z-20 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              setShowHome(true);
            }}
            className="w-10 h-10 rounded-full bg-[var(--bg-3)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text)] active:scale-95 shrink-0"
            aria-label="Главный экран"
            title="Главный экран"
          >
            <Home size={19} />
          </button>
          <SupportHeaderButton />
        </div>

        {snapshot.isAdmin ? (
          <div className="flex bg-[#2c2c2e] rounded-full p-1 border border-[#3a3a3c] text-sm font-bold shrink-0">
            <button
              type="button"
              onClick={() => setMode('PLAYER')}
              className={`px-3.5 py-2 min-h-[38px] rounded-full transition-colors flex items-center justify-center ${
                mode === 'PLAYER' ? 'bg-[#2ea6ff] text-white shadow-sm' : 'text-gray-400'
              }`}
            >
              Игрок
            </button>
            <button
              type="button"
              onClick={() => setMode('ADMIN')}
              className={`px-3.5 py-2 min-h-[38px] rounded-full transition-colors flex items-center justify-center ${
                mode === 'ADMIN' ? 'bg-[#2ea6ff] text-white shadow-sm' : 'text-gray-400'
              }`}
            >
              Админ
            </button>
          </div>
        ) : (
          hideBottomNav && (
            <div className="flex bg-[#2c2c2e] rounded-full p-1 border border-[#3a3a3c] text-xs font-bold shrink-0">
              <button
                type="button"
                onClick={() => {
                  haptic('light');
                  setPlayerTab('match');
                }}
                className={`px-3.5 py-2 min-h-[34px] rounded-full transition-colors flex items-center justify-center ${
                  playerTab === 'match' ? 'bg-[#2ea6ff] text-white shadow-sm' : 'text-gray-400'
                }`}
              >
                Итоги
              </button>
              <button
                type="button"
                onClick={() => {
                  haptic('light');
                  setPlayerTab('table');
                }}
                className={`px-3.5 py-2 min-h-[34px] rounded-full transition-colors flex items-center justify-center ${
                  playerTab === 'table' ? 'bg-[#2ea6ff] text-white shadow-sm' : 'text-gray-400'
                }`}
              >
                Таблица
              </button>
            </div>
          )
        )}
      </div>

      {/* Main Content */}
      <div className={`flex-1 overflow-hidden relative ${hideBottomNav ? 'no-dock' : ''}`}>
        {mode === 'PLAYER' ? (
          <>
            {playerTab === 'match' && (
              <PlayerMatchView
                snapshot={snapshot}
                busy={busy}
                onOpenTable={() => {
                  haptic('light');
                  setPlayerTab('table');
                }}
                onGoHome={() => {
                  haptic('light');
                  setShowHome(true);
                }}
                onSubmitScore={(matchId, score1, score2) =>
                  runAction(async () => {
                    const res = await apiClient.submitScore({ matchId, score1, score2 });
                    if (res.notifiedCount === 0 && res.myCurrentMatch?.status === 'WAITING_CONFIRM') {
                      showError(
                        new Error(
                          'Соперники ещё не разрешили сообщения от бота @kickerpickerbot. Нажмите «Напомнить» после запуска бота или подтвердите счёт на экране соперника.'
                        )
                      );
                    }
                    return res;
                  })
                }
                onConfirmScore={(matchId, action) =>
                  runAction(() => apiClient.confirmScore({ matchId, action }))
                }
                onRemindConfirm={async (matchId) => {
                  setBusy(true);
                  try {
                    const res = await apiClient.remindConfirm(matchId);
                    if (res.sentCount === 0) {
                      showError(
                        new Error(
                          'Бот не может написать сопернику: попросите его открыть @kickerpickerbot и нажать /start.'
                        )
                      );
                    }
                  } catch (err) {
                    showError(err);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
            {playerTab === 'table' && (
              <LeaderboardView
                snapshot={snapshot}
                busy={busy}
              />
            )}
            {playerTab === 'profile' && (
              <ProfileView
                snapshot={snapshot}
                tournamentHistory={appState?.tournamentHistory || []}
                busy={busy}
                theme={theme}
                onChangeTheme={(nextTheme) => {
                  haptic('light');
                  setTheme(nextTheme);
                  applyTheme(nextTheme);
                }}
                onSelectTournament={(tId) => {
                  setSelectedTournamentId(tId);
                  setPlayerTab('match');
                  fetchState(tId);
                }}
                onLeave={async () => {
                  setBusy(true);
                  try {
                    await apiClient.leaveTournament(snapshot.tournament.id);
                    setSelectedTournamentId(null);
                    setShowHome(true);
                    await fetchState(null);
                  } catch (err) {
                    showError(err);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
          </>
        ) : (
          <>
            {adminTab === 'dashboard' && (
              <AdminDashboardView
                snapshot={snapshot}
                busy={busy}
                onStartRound={() =>
                  runAction(() => apiClient.startRound(snapshot.tournament.id))
                }
                onStartPlayoff={(options) =>
                  runAction(() => apiClient.startPlayoff(snapshot.tournament.id, options))
                }
                onCancelPendingPlayoff={() =>
                  runAction(() => apiClient.startPlayoff(snapshot.tournament.id, true))
                }
                onFinishTournament={(reopen) =>
                  runAction(() => apiClient.finishTournament(snapshot.tournament.id, reopen))
                }
                onDeleteLastRound={() =>
                  runAction(() => apiClient.deleteLastRound(snapshot.tournament.id))
                }
                onAdminSaveMatch={(matchId, score1, score2) =>
                  runAction(() =>
                    apiClient.submitScore({ matchId, score1, score2, forceAdmin: true })
                  )
                }
                onAdminManageMatch={(params) =>
                  runAction(() => apiClient.adminManageMatch(params))
                }
                onToggleDisabledTable={(tNum) => {
                  const current = Array.isArray(snapshot.tournament.disabledTables)
                    ? snapshot.tournament.disabledTables
                    : [];
                  const next = current.includes(tNum)
                    ? current.filter((x) => x !== tNum)
                    : [...current, tNum].sort((a, b) => a - b);
                  if (next.length >= snapshot.tournament.tablesCount) {
                    showError(new Error('Хотя бы один стол должен оставаться активным'));
                    return Promise.resolve();
                  }
                  return runAction(() =>
                    apiClient.updateTournament({
                      tournamentId: snapshot.tournament.id,
                      disabledTables: next,
                    })
                  );
                }}
                onToggleLive={(enabled) =>
                  runAction(() => apiClient.publishLive(snapshot.tournament.id, enabled))
                }
                onOpenSettings={() => setAdminTab('settings')}
                onRefresh={() => fetchState(snapshot.tournament.id)}
              />
            )}
            {adminTab === 'players' && (
              <AdminPlayersView
                snapshot={snapshot}
                busy={busy}
                clubPlayers={appState?.clubPlayers || []}
                onAddGuest={async (payload) => {
                  await runAction(() => apiClient.addGuestPlayer(snapshot.tournament.id, payload));
                  if (typeof payload !== 'string' && payload.saveToClub !== false) {
                    apiClient
                      .manageClubPlayer({ action: 'list' })
                      .then((res) => {
                        setAppState((prev) =>
                          prev ? { ...prev, clubPlayers: res.clubPlayers } : prev
                        );
                      })
                      .catch(() => {});
                  }
                }}
                onManagePlayer={(params) =>
                  runAction(() =>
                    apiClient.managePlayer({
                      tournamentId: snapshot.tournament.id,
                      ...params,
                    })
                  )
                }
                onToggleActive={(playerId) =>
                  runAction(() =>
                    apiClient.togglePlayerActive(snapshot.tournament.id, playerId)
                  )
                }
                onManageClubPlayer={handleManageClubPlayer}
                onStartRound={(opts) =>
                  runAction(() => apiClient.startRound(snapshot.tournament.id, opts))
                }
              />
            )}
            {adminTab === 'table' && (
              <LeaderboardView
                snapshot={snapshot}
                busy={busy}
                onSaveTableConfig={(tableConfig) =>
                  runAction(() =>
                    apiClient.updateTournament({
                      tournamentId: snapshot.tournament.id,
                      tableConfig,
                    })
                  )
                }
              />
            )}
            {adminTab === 'settings' && (
              <AdminSettingsView
                snapshot={snapshot}
                busy={busy}
                onBack={() => setAdminTab('dashboard')}
                onSave={(payload) =>
                  runAction(() => apiClient.updateTournament(payload))
                }
                onToggleLive={(enabled) =>
                  runAction(() => apiClient.publishLive(snapshot.tournament.id, enabled))
                }
                onTransferAdmin={async (playerId) => {
                  setBusy(true);
                  try {
                    const snap = await apiClient.transferAdmin(snapshot.tournament.id, playerId);
                    applySnapshot(snap);
                    if (!snap.isAdmin) {
                      setMode('PLAYER');
                      setPlayerTab('match');
                    }
                  } catch (err) {
                    showError(err);
                  } finally {
                    setBusy(false);
                  }
                }}
                onDelete={async () => {
                  setBusy(true);
                  try {
                    await apiClient.deleteTournament(snapshot.tournament.id);
                    setSelectedTournamentId(null);
                    setShowHome(true);
                    setAdminTab('dashboard');
                    await fetchState(null);
                  } catch (err) {
                    showError(err);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Elevated gym-gym Dock + Unbounded кикер пикер Brand underneath */}
      {!hideBottomNav && <BottomNav items={navItems} />}

      {/* Created Tournament Invite Modal (gym-gym Modal) */}
      {createdInvite && (
        <Modal
          title={
            <span className="flex items-center gap-2">
              <CheckCircle2 size={20} className="text-[#34c759]" /> Турнир создан!
            </span>
          }
          onClose={() => setCreatedInvite(null)}
          closeLabel="Перейти к участникам"
          footer={
            <button
              type="button"
              onClick={() => shareTournamentInTelegram(createdInvite)}
              className="btn btn-primary w-full py-3.5 text-sm shadow-[0_4px_20px_rgba(46,166,255,0.35)]"
            >
              <Share2 size={17} /> Поделиться в Telegram
            </button>
          }
        >
          <p className="text-xs text-[var(--muted)]">
            Отправьте эту ссылку игрокам, чтобы они автоматически попали в «{createdInvite.name}».
          </p>
          <div className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-3 py-2.5 text-xs font-mono text-[#2ea6ff] break-all select-all">
            {getTournamentInviteLink(createdInvite.id)}
          </div>
        </Modal>
      )}
    </div>
  );
}
