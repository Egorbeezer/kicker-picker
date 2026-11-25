import React from 'react';
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
  Radio,
} from 'lucide-react';
import { apiClient, isTelegramEnv } from './api/client';
import {
  getTournamentInviteLink,
  shareLiveUrlInTelegram,
  shareTournamentInTelegram,
} from './utils/share';
import { openTelegramChat, SUPPORT_BUTTON } from './support';
import { haptic, notify } from './utils/telegram';
import { formatDateRu } from './utils/date';
import { useAppController } from './hooks/useAppController';
import { ActionStatusBanner } from './components/ActionStatusBanner';
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
import { CreateTournamentView } from './components/CreateTournamentView';
import { PublicLiveView } from './components/PublicLiveView';

export default function App() {
  const {
    livePath,
    loading,
    initialLoadError,
    busy,
    pendingStatus,
    theme,
    changeTheme,
    toggleTheme,
    appState,
    setClubPlayers,
    showError,
    snapshot,
    hideBottomNav,
    setSelectedTournamentId,
    showHome,
    setShowHome,
    isCreating,
    setIsCreating,
    createdInvite,
    setCreatedInvite,
    mode,
    setMode,
    playerTab,
    setPlayerTab,
    adminTab,
    setAdminTab,
    fetchState,
    applySnapshot,
    runLocked,
    runAction,
    handleCreateTournament,
    handleManageClubPlayer,
    handleSelectTournament,
  } = useAppController();

  if (livePath) {
    return (
      <PublicLiveView
        publicPath={livePath}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  if (!isTelegramEnv()) {
    return (
      <div className="w-full max-w-md mx-auto h-[100dvh] bg-[var(--bg)] text-white flex flex-col items-center justify-center p-6 text-center">
        <ToastHost />
        <ActionStatusBanner pendingStatus={pendingStatus} />
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
        <ActionStatusBanner pendingStatus={pendingStatus} />
        <span className="loading loading-spinner text-[#2ea6ff]" />
        <Brand className="text-lg mt-1" />
        <span className="text-xs text-[var(--muted)]">Загрузка турнира...</span>
      </div>
    );
  }

  if (initialLoadError && !appState) {
    return (
      <div className="w-full max-w-md mx-auto h-[100dvh] bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center p-6 text-center gap-3">
        <ToastHost />
        <ActionStatusBanner pendingStatus={pendingStatus} />
        <Trophy size={48} className="text-[#2ea6ff]" />
        <Brand className="text-xl" />
        <div className="text-sm font-bold">Не удалось загрузить данные</div>
        <p className="text-xs text-[var(--muted)] max-w-xs">{initialLoadError}</p>
        <button
          type="button"
          onClick={() => {
            haptic('light');
            void fetchState();
          }}
          className="btn btn-primary px-6 py-2.5 text-sm"
        >
          Повторить
        </button>
        <button
          type="button"
          onClick={() => openTelegramChat()}
          className="w-full max-w-xs py-2.5 px-4 rounded-2xl bg-[var(--bg-3)] border border-[var(--border-strong)] text-[var(--text)] text-sm font-semibold active:scale-95 transition-transform"
        >
          {SUPPORT_BUTTON}
        </button>
      </div>
    );
  }

  if (isCreating) {
    const defaultTournamentName = `Турнир ${formatDateRu(new Date())}`;
    return (
      <div className="w-full max-w-md mx-auto h-[100dvh] bg-[var(--bg)] text-[var(--text)] flex flex-col relative overflow-hidden">
        <ToastHost />
        <ActionStatusBanner pendingStatus={pendingStatus} />
        <div className="bg-[var(--bg-2)] border-b border-[var(--border)] px-3 pb-2.5 pt-[calc(8px+var(--tg-inset-top,0px))] flex items-center justify-between gap-2 z-20 shrink-0">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              setIsCreating(false);
              setShowHome(true);
            }}
            className="min-w-[62px] h-10 px-2.5 rounded-full bg-[var(--bg-3)] border border-[var(--border-strong)] inline-flex items-center justify-center text-[var(--text)] active:scale-95 transition-transform shrink-0"
            aria-label="Главный экран"
            title="Главный экран"
          >
            <Home size={20} />
          </button>
          <span className="text-sm font-bold text-[var(--text)]">Новый турнир</span>
          <SupportHeaderButton />
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <CreateTournamentView
            defaultName={defaultTournamentName}
            busy={busy}
            onSubmit={handleCreateTournament}
            onCancel={() => setIsCreating(false)}
          />
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
    const myLeaderboardAvatar = snapshot
      ? snapshot.leaderboard.find((r) => r.playerId === snapshot.myPlayerId)?.avatarUrl
      : null;
    const userAvatarUrl = appState?.user.avatarUrl || myLeaderboardAvatar || null;

    return (
      <div className="w-full max-w-md mx-auto h-[100dvh] bg-[var(--bg)] text-[var(--text)] flex flex-col relative overflow-hidden">
        <ToastHost />
        <ActionStatusBanner pendingStatus={pendingStatus} />
        <div
          data-testid="home-header"
          className="bg-[var(--bg-2)] border-b border-[var(--border)] px-3 pb-2.5 pt-[calc(8px+var(--tg-inset-top,0px))] flex items-center justify-between gap-2 z-20 shrink-0"
        >
          <div className="flex items-center gap-2 min-w-0">
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
            <Brand className="text-base truncate" />
          </div>

          <div className="flex items-center gap-2 shrink-0" data-testid="header-right-group">
            <button
              type="button"
              onClick={() => {
                haptic('light');
                toggleTheme();
              }}
              className="w-10 h-10 rounded-full bg-[var(--bg-3)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text)] active:scale-95 shrink-0"
              aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
              title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <SupportHeaderButton />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pt-4 pb-6">
          <HomeView
            tournaments={homeTournaments}
            currentTournamentId={snapshot?.tournament.id ?? null}
            playerProfile={appState?.playerProfile ?? null}
            userName={fullUserName}
            userAvatarUrl={userAvatarUrl}
            onSelectTournament={handleSelectTournament}
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
      <ActionStatusBanner pendingStatus={pendingStatus} />

      <div
        data-testid="app-header"
        className="bg-[var(--bg-2)] border-b border-[var(--border)] px-3 pb-2.5 pt-[calc(8px+var(--tg-inset-top,0px))] flex items-center justify-between gap-2 z-20 shrink-0"
      >
        <button
          type="button"
          onClick={() => {
            haptic('light');
            setShowHome(true);
          }}
          className="min-w-[62px] h-10 px-2.5 rounded-full bg-[var(--bg-3)] border border-[var(--border-strong)] inline-flex items-center justify-center text-[var(--text)] active:scale-95 transition-transform shrink-0"
          aria-label="Главный экран"
          title="Главный экран"
        >
          <Home size={20} />
        </button>

        <div className="flex items-center gap-2 shrink-0" data-testid="header-right-group">
          <SupportHeaderButton />

          {snapshot.isAdmin ? (
            <div className="flex bg-[#2c2c2e] rounded-full p-1 border border-[#3a3a3c] text-sm font-bold shrink-0">
              <button
                type="button"
                onClick={() => setMode('PLAYER')}
                className={`px-3 py-2 min-h-[38px] rounded-full transition-colors flex items-center justify-center ${
                  mode === 'PLAYER' ? 'bg-[#2ea6ff] text-white shadow-sm' : 'text-gray-400'
                }`}
              >
                Игрок
              </button>
              <button
                type="button"
                onClick={() => setMode('ADMIN')}
                className={`px-3 py-2 min-h-[38px] rounded-full transition-colors flex items-center justify-center ${
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
                  className={`px-3 py-2 min-h-[34px] rounded-full transition-colors flex items-center justify-center ${
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
                  className={`px-3 py-2 min-h-[34px] rounded-full transition-colors flex items-center justify-center ${
                    playerTab === 'table' ? 'bg-[#2ea6ff] text-white shadow-sm' : 'text-gray-400'
                  }`}
                >
                  Таблица
                </button>
              </div>
            )
          )}
        </div>
      </div>

      <div className={`flex-1 min-h-0 overflow-hidden relative ${hideBottomNav ? 'no-dock' : ''}`}>
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
                  runAction(
                    async () => {
                      const res = await apiClient.submitScore({ matchId, score1, score2 });
                      if (res.alreadySubmitted) {
                        notify('Этот счёт уже отправлен и ждёт подтверждения');
                      } else if (
                        res.notifiedCount === 0 &&
                        res.myCurrentMatch?.status === 'WAITING_CONFIRM'
                      ) {
                        showError(
                          new Error(
                            'Соперники ещё не разрешили сообщения от бота @kickerpickerbot. Нажмите «Напомнить» после запуска бота или подтвердите счёт на экране соперника.'
                          )
                        );
                      } else if (res.myCurrentMatch?.status === 'WAITING_CONFIRM') {
                        notify('Счёт отправлен на подтверждение');
                      } else {
                        notify('Счёт сохранён');
                      }
                      return res;
                    },
                    'Отправляем счёт...'
                  )
                }
                onConfirmScore={(matchId, action) =>
                  runAction(
                    () => apiClient.confirmScore({ matchId, action }),
                    action === 'confirm' ? 'Подтверждаем счёт...' : 'Оспариваем счёт...',
                    action === 'confirm' ? 'Счёт подтверждён' : 'Спор отправлен, матч возвращён в игру'
                  )
                }
                onRemindConfirm={(matchId) =>
                  runLocked('Отправляем напоминание...', async () => {
                    const res = await apiClient.remindConfirm(matchId);
                    if (res.sentCount === 0) {
                      showError(
                        new Error(
                          'Бот не может написать сопернику: попросите его открыть @kickerpickerbot и нажать /start.'
                        )
                      );
                    } else {
                      notify('Напоминание отправлено');
                    }
                  })
                }
              />
            )}
            {playerTab === 'table' && (
              <LeaderboardView snapshot={snapshot} busy={busy} />
            )}
            {playerTab === 'profile' && (
              <ProfileView
                snapshot={snapshot}
                tournamentHistory={appState?.tournamentHistory || []}
                busy={busy}
                theme={theme}
                onChangeTheme={(nextTheme) => {
                  haptic('light');
                  changeTheme(nextTheme);
                }}
                onSelectTournament={(tId) => {
                  setSelectedTournamentId(tId);
                  setPlayerTab('match');
                  fetchState(tId);
                }}
                onLeave={() =>
                  runLocked('Выписываем из турнира...', async () => {
                    await apiClient.leaveTournament(snapshot.tournament.id);
                    setSelectedTournamentId(null);
                    setMode('PLAYER');
                    setPlayerTab('match');
                    setShowHome(true);
                    await fetchState(null);
                    notify('Вы выписались из турнира');
                  })
                }
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
                  runAction(
                    () => apiClient.startRound(snapshot.tournament.id),
                    'Запускаем раунд...',
                    'Раунд запущен'
                  )
                }
                onStartPlayoff={(options) =>
                  runAction(
                    () => apiClient.startPlayoff(snapshot.tournament.id, options),
                    'Запускаем плей-офф...'
                  )
                }
                onCancelPendingPlayoff={() =>
                  runAction(
                    () => apiClient.startPlayoff(snapshot.tournament.id, true),
                    'Отменяем переход в плей-офф...'
                  )
                }
                onFinishTournament={(reopen) =>
                  runAction(
                    () => apiClient.finishTournament(snapshot.tournament.id, reopen),
                    reopen ? 'Возвращаем турнир в игру...' : 'Завершаем турнир...',
                    reopen ? 'Турнир возобновлён' : 'Турнир завершён'
                  )
                }
                onDeleteLastRound={() =>
                  runAction(
                    () => apiClient.deleteLastRound(snapshot.tournament.id),
                    'Удаляем раунд...',
                    'Последний раунд удалён'
                  )
                }
                onAdminSaveMatch={(matchId, score1, score2) =>
                  runAction(
                    () => apiClient.submitScore({ matchId, score1, score2, forceAdmin: true }),
                    'Сохраняем счёт...',
                    'Счёт сохранён'
                  )
                }
                onAdminManageMatch={(params) =>
                  runAction(() => apiClient.adminManageMatch(params), 'Обновляем матч...')
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
                onRefresh={async () => {
                  await fetchState(snapshot.tournament.id);
                }}
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
                      .then((res) => setClubPlayers(res.clubPlayers))
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
                  runAction(
                    () => apiClient.updateTournament(payload),
                    'Сохраняем настройки...',
                    'Настройки сохранены'
                  )
                }
                onToggleLive={(enabled) =>
                  runAction(
                    () => apiClient.publishLive(snapshot.tournament.id, enabled),
                    enabled ? 'Включаем Live-ссылку...' : 'Выключаем Live-ссылку...'
                  )
                }
                onTransferAdmin={(playerId) =>
                  runLocked('Передаём права организатора...', async () => {
                    const snap = await apiClient.transferAdmin(snapshot.tournament.id, playerId);
                    applySnapshot(snap);
                    if (!snap.isAdmin) {
                      setMode('PLAYER');
                      setPlayerTab('match');
                    }
                    notify('Права организатора переданы');
                  })
                }
                onDelete={() =>
                  runLocked('Удаляем турнир...', async () => {
                    await apiClient.deleteTournament(snapshot.tournament.id);
                    setSelectedTournamentId(null);
                    setMode('PLAYER');
                    setPlayerTab('match');
                    setShowHome(true);
                    setAdminTab('dashboard');
                    await fetchState(null);
                    notify('Турнир удалён');
                  })
                }
              />
            )}
          </>
        )}
      </div>

      {!hideBottomNav && <BottomNav items={navItems} />}

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
            <>
              <button
                type="button"
                onClick={() => shareTournamentInTelegram(createdInvite)}
                className="btn btn-primary w-full py-3.5 text-sm shadow-[0_4px_20px_rgba(46,166,255,0.35)]"
              >
                <Share2 size={17} /> Пригласить
              </button>
              {createdInvite.publicPath && (
                <button
                  type="button"
                  onClick={() =>
                    shareLiveUrlInTelegram({
                      name: createdInvite.name,
                      publicPath: createdInvite.publicPath!,
                    })
                  }
                  className="w-full py-3 px-4 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-500 font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <Radio size={17} /> Поделиться Live-трансляцией
                </button>
              )}
            </>
          }
        >
          <p className="text-xs text-[var(--muted)]">
            Отправьте эту ссылку игрокам, чтобы они автоматически попали в «{createdInvite.name}».
          </p>
          <div className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-3 py-2.5 text-xs font-mono text-[#2ea6ff] break-all select-all">
            {getTournamentInviteLink(createdInvite.id)}
          </div>
          {createdInvite.publicPath && (
            <p className="text-xs text-emerald-500 font-medium flex items-center gap-1.5">
              <Radio size={14} className="shrink-0" />
              Live-трансляция включена. Поделиться ссылкой можно кнопкой ниже.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
