import { useEffect, useState, useCallback, useRef } from 'react';
import { apiClient, getLivePathFromUrl, getStartTournamentId, isTelegramEnv } from '../api/client';
import { haptic, installFullscreenInsets, installKeyboardInset, notify } from '../utils/telegram';
import { installSingleInstanceSync, type SingleInstanceController } from '../utils/singleInstance';
import { applyTheme, currentTheme, hydrateSavedTheme, type Theme } from '../utils/theme';
import type {
  AppStateResponse,
  CreateTournamentForm,
  TournamentSnapshot,
} from '../types';

/**
 * Централизованный контроллер состояния Mini App:
 * - синхронизация с Telegram WebApp & single-instance защита от дублей;
 * - опрос getState (полный и light-polling раз в 2.5с);
 * - обёртки runLocked/runAction с защитой от двойного нажатия.
 */
export function useAppController() {
  const livePath = getLivePathFromUrl();
  const [loading, setLoading] = useState(!livePath);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
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
  const actionLockRef = useRef(false);
  const supersededRef = useRef(false);
  const singleInstanceRef = useRef<SingleInstanceController | null>(null);
  const selectedTournamentIdRef = useRef<number | null>(selectedTournamentId);
  selectedTournamentIdRef.current = selectedTournamentId;
  const appStateRef = useRef<AppStateResponse | null>(appState);
  appStateRef.current = appState;
  const requestSeqRef = useRef(0);
  const snapshotVersionRef = useRef<string | null>(
    appState?.activeTournament?.snapshotVersion ?? null
  );
  snapshotVersionRef.current = appState?.activeTournament?.snapshotVersion ?? null;
  const consecutivePollErrorsRef = useRef(0);
  const pollToastShownRef = useRef(false);

  const showError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Произошла ошибка';
    haptic('error');
    notify(msg);
  }, []);

  const fetchState = useCallback(
    async (tId?: number | null, opts?: { light?: boolean; background?: boolean }): Promise<boolean> => {
      const reqId = ++requestSeqRef.current;
      try {
        if (livePath || !isTelegramEnv()) {
          setLoading(false);
          return true;
        }
        const startTournamentId = !startHandledRef.current ? getStartTournamentId() : null;
        if (startTournamentId && !startHandledRef.current) {
          startHandledRef.current = true;
          try {
            const joined = await apiClient.joinTournament(startTournamentId);
            if (reqId !== requestSeqRef.current) return true;
            selectedTournamentIdRef.current = joined.tournament.id;
            setSelectedTournamentId(joined.tournament.id);
            setShowHome(false);
            const res = await apiClient.getState({ tournamentId: joined.tournament.id });
            if (reqId !== requestSeqRef.current) return true;
            setAppState(res);
            setInitialLoadError(null);
            consecutivePollErrorsRef.current = 0;
            pollToastShownRef.current = false;
            setLoading(false);
            return true;
          } catch (joinErr) {
            showError(joinErr);
          }
        }

        const effectiveId = tId === undefined ? selectedTournamentIdRef.current : tId;
        const canPollLight = Boolean(opts?.light && effectiveId);
        const pollVersion = canPollLight ? snapshotVersionRef.current : null;
        const res = await apiClient.getState(
          effectiveId
            ? {
                tournamentId: effectiveId,
                ...(canPollLight ? { light: true } : {}),
                ...(pollVersion ? { snapshotVersion: pollVersion } : {}),
              }
            : {}
        );

        if (reqId !== requestSeqRef.current) return true;

        consecutivePollErrorsRef.current = 0;
        pollToastShownRef.current = false;
        setInitialLoadError(null);

        if (res.light) {
          if (res.unchanged) {
            setLoading(false);
            return true;
          }
          const prevState = appStateRef.current;
          if (!prevState) {
            const full = await apiClient.getState(effectiveId ? { tournamentId: effectiveId } : {});
            if (reqId !== requestSeqRef.current) return true;
            setAppState(full);
          } else {
            const prevStatus = prevState.activeTournament?.tournament.status;
            const nextStatus = res.activeTournament?.tournament.status;
            const needsFullRefresh = Boolean(
              prevStatus && nextStatus && prevStatus !== nextStatus && nextStatus === 'FINISHED'
            );
            setAppState((prev) =>
              prev ? { ...prev, activeTournament: res.activeTournament ?? null } : prev
            );
            if (needsFullRefresh) {
              const full = await apiClient.getState(effectiveId ? { tournamentId: effectiveId } : {});
              if (reqId !== requestSeqRef.current) return true;
              setAppState(full);
            }
          }
        } else {
          setAppState(res);
        }

        if (res.activeTournament && !selectedTournamentIdRef.current) {
          selectedTournamentIdRef.current = res.activeTournament.tournament.id;
          setSelectedTournamentId(res.activeTournament.tournament.id);
          if (res.activeTournament.isAdmin) {
            setMode('ADMIN');
          }
        }
        return true;
      } catch (err) {
        if (reqId !== requestSeqRef.current) return false;
        const msg = err instanceof Error ? err.message : 'Не удалось загрузить данные';
        if (!opts?.background && !appStateRef.current) {
          setInitialLoadError(msg);
        }
        if (opts?.background) {
          consecutivePollErrorsRef.current += 1;
          if (!pollToastShownRef.current) {
            pollToastShownRef.current = true;
            showError(err);
          }
        } else {
          showError(err);
        }
        return false;
      } finally {
        if (reqId === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [showError, livePath]
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
        } catch {
          // ignore unsupported write access prompt
        }
      }
    }
    fetchState();

    const sync = installSingleInstanceSync({
      onSuperseded: () => {
        supersededRef.current = true;
      },
      onActivate: (latestTournamentId) => {
        supersededRef.current = false;
        const targetId =
          latestTournamentId && latestTournamentId !== selectedTournamentIdRef.current
            ? latestTournamentId
            : selectedTournamentIdRef.current;
        if (latestTournamentId && latestTournamentId !== selectedTournamentIdRef.current) {
          setSelectedTournamentId(latestTournamentId);
          setShowHome(false);
        }
        if (isTelegramEnv()) {
          void fetchState(targetId);
        }
      },
    });
    singleInstanceRef.current = sync;
    sync.announce(getStartTournamentId() ?? selectedTournamentIdRef.current);

    return () => {
      sync.cleanup();
      singleInstanceRef.current = null;
      stopInsets();
      stopKeyboard();
    };
  }, [fetchState, livePath]);

  useEffect(() => {
    singleInstanceRef.current?.announce(selectedTournamentId);
  }, [selectedTournamentId]);

  useEffect(() => {
    if (livePath || !isTelegramEnv() || isCreating) return;
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let pollInFlight = false;

    const getPollDelay = () => {
      const errs = consecutivePollErrorsRef.current;
      if (errs <= 0) return 2500;
      return Math.min(20_000, 2500 * Math.pow(2, errs));
    };

    const scheduleNext = () => {
      if (cancelled) return;
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(runPoll, getPollDelay());
    };

    const runPoll = () => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible' || supersededRef.current || pollInFlight) {
        scheduleNext();
        return;
      }
      pollInFlight = true;
      const useLight = Boolean(!showHome && selectedTournamentId);
      void fetchState(selectedTournamentId, { light: useLight, background: true }).finally(() => {
        pollInFlight = false;
        scheduleNext();
      });
    };

    const onReconnectOrWake = () => {
      if (document.visibilityState !== 'visible' || supersededRef.current) return;
      consecutivePollErrorsRef.current = 0;
      pollToastShownRef.current = false;
      runPoll();
    };

    scheduleNext();
    window.addEventListener('online', onReconnectOrWake);
    document.addEventListener('visibilitychange', onReconnectOrWake);

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      window.removeEventListener('online', onReconnectOrWake);
      document.removeEventListener('visibilitychange', onReconnectOrWake);
    };
  }, [fetchState, selectedTournamentId, isCreating, showHome, livePath]);

  const applySnapshot = useCallback((snap: TournamentSnapshot) => {
    requestSeqRef.current += 1;
    selectedTournamentIdRef.current = snap.tournament.id;
    setInitialLoadError(null);
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
  }, []);

  const runLocked = useCallback(
    async (statusText: string, fn: () => Promise<void>) => {
      if (actionLockRef.current) return;
      actionLockRef.current = true;
      setBusy(true);
      setPendingStatus(statusText);
      try {
        await fn();
      } catch (err) {
        showError(err);
      } finally {
        actionLockRef.current = false;
        setBusy(false);
        setPendingStatus(null);
      }
    },
    [showError]
  );

  const handleCreateTournament = useCallback(
    (form: CreateTournamentForm) =>
      runLocked('Создаём турнир...', async () => {
        const snap = await apiClient.createTournament({ ...form, joinAsPlayer: true });
        applySnapshot(snap);
        setIsCreating(false);
        setShowHome(false);
        setMode('ADMIN');
        setAdminTab('players');
        setCreatedInvite({ id: snap.tournament.id, name: snap.tournament.name });
        notify('Турнир создан');
      }),
    [applySnapshot, runLocked]
  );

  const runAction = useCallback(
    (fn: () => Promise<TournamentSnapshot>, statusText = 'Выполняем действие...', successToast?: string) =>
      runLocked(statusText, async () => {
        const snap = await fn();
        applySnapshot(snap);
        if (successToast) notify(successToast);
      }),
    [applySnapshot, runLocked]
  );

  const handleManageClubPlayer = useCallback(
    (params: { action: 'list' | 'add' | 'delete'; id?: number; name?: string }) =>
      runLocked('Обновляем список клуба...', async () => {
        const res = await apiClient.manageClubPlayer(params);
        setAppState((prev) => (prev ? { ...prev, clubPlayers: res.clubPlayers } : prev));
      }),
    [runLocked]
  );

  const changeTheme = useCallback((nextTheme: Theme) => {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    changeTheme(theme === 'dark' ? 'light' : 'dark');
  }, [changeTheme, theme]);

  const setClubPlayers = useCallback((clubPlayers: AppStateResponse['clubPlayers']) => {
    setAppState((prev) => (prev ? { ...prev, clubPlayers } : prev));
  }, []);

  const handleSelectTournament = useCallback(
    (tId: number) => {
      const picked = (appState?.tournaments || appState?.tournamentHistory || []).find((t) => t.id === tId);
      const uid = appState?.user.id ?? 0;
      const pickedIsAdmin = Boolean(
        picked &&
          (picked.creatorTgId === uid ||
            (Array.isArray(picked.coAdminTgIds) && picked.coAdminTgIds.includes(uid)))
      );
      selectedTournamentIdRef.current = tId;
      setSelectedTournamentId(tId);
      setShowHome(false);
      setMode(pickedIsAdmin ? 'ADMIN' : 'PLAYER');
      setPlayerTab('match');
      setAdminTab('dashboard');
      fetchState(tId);
    },
    [appState, fetchState]
  );

  const snapshot = appState?.activeTournament ?? null;
  const hideBottomNav = Boolean(
    snapshot && mode === 'PLAYER' && snapshot.tournament.status === 'FINISHED'
  );

  useEffect(() => {
    if (hideBottomNav && playerTab === 'profile') {
      setPlayerTab('match');
    }
  }, [hideBottomNav, playerTab]);

  return {
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
    selectedTournamentId,
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
  };
}
