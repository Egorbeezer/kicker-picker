import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Radio,
  RefreshCw,
  Sun,
  Moon,
  Clock,
  Trophy,
  Maximize2,
  Minimize2,
  LayoutPanelLeft,
  ArrowLeft,
} from 'lucide-react';
import type { LeaderboardRow, PublicLiveData, TableColumnConfig, TableColumnKey } from '../types';
import { fetchPublicLive } from '../api/client';
import type { Theme } from '../utils/theme';
import { Brand } from './Brand';
import { MatchCard } from './MatchCard';
import { PlayoffBracketView } from './PlayoffBracketView';
import { PlayerAvatar } from './PlayerAvatar';
import { SupportHeaderButton } from './SupportHeaderButton';
import { openTelegramChat, SUPPORT_BUTTON } from '../support';
import { formatTimeHm, formatTimeHms } from '../utils/date';
import { getPlayoffQualifiedIds } from '../utils/playoffZone';
import { getDypModeLabel } from './InfoTooltip';

interface Props {
  publicPath: string;
  theme: Theme;
  onToggleTheme: () => void;
  onClose?: () => void;
}

const COL_LABELS: Record<TableColumnKey, { short: string; width: string }> = {
  wins: { short: 'Поб', width: 'w-10' },
  ppm: { short: 'Ср.очк', width: 'w-12' },
  fairPpm: { short: 'Ч.очк', width: 'w-12' },
  points: { short: 'Очки', width: 'w-10' },
  diff: { short: '+/-', width: 'w-10' },
  games: { short: 'Игр', width: 'w-9' },
  losses: { short: 'Пор', width: 'w-9' },
  goalsFor: { short: 'Зб', width: 'w-9' },
  goalsAgainst: { short: 'Пр', width: 'w-9' },
  winRate: { short: 'Поб%', width: 'w-11' },
  buchholz: { short: 'BH₁', width: 'w-11' },
  avgBuchholz: { short: 'ØBH', width: 'w-11' },
  sonnebornBerger: { short: 'SB', width: 'w-11' },
  name: { short: 'Игрок', width: 'flex-1' },
};

const DEFAULT_LIVE_COLS: TableColumnConfig[] = [
  { key: 'wins', sort: true, visible: true },
  { key: 'ppm', sort: true, visible: true },
  { key: 'diff', sort: true, visible: true },
  { key: 'games', sort: true, visible: true },
  { key: 'name', sort: false, visible: true },
];

function renderCell(key: TableColumnKey, row: LeaderboardRow) {
  if (key === 'wins') return <span className="font-bold text-sm text-white">{row.wins}</span>;
  if (key === 'ppm') return <span className="text-xs text-gray-300">{row.ppm}</span>;
  if (key === 'fairPpm') {
    return (
      <span className="text-xs text-gray-300">
        {row.fairPpm ?? row.ppm}
        {row.isBelowGameThreshold ? '*' : ''}
      </span>
    );
  }
  if (key === 'points') return <span className="font-bold text-xs text-white">{row.points}</span>;
  if (key === 'diff') {
    const str = row.diff > 0 ? `+${row.diff}` : `${row.diff}`;
    return (
      <span
        className={`text-xs font-medium ${
          row.diff > 0 ? 'text-green-400' : row.diff < 0 ? 'text-red-400' : 'text-gray-400'
        }`}
      >
        {str}
      </span>
    );
  }
  if (key === 'games') return <span className="text-xs text-gray-300">{row.games}</span>;
  if (key === 'losses') return <span className="text-xs text-gray-300">{row.losses ?? 0}</span>;
  if (key === 'goalsFor') return <span className="text-xs text-gray-300">{row.goalsFor}</span>;
  if (key === 'goalsAgainst') return <span className="text-xs text-[var(--muted)]">{row.goalsAgainst}</span>;
  if (key === 'winRate') return <span className="text-xs text-[var(--muted)]">{row.winRate ?? 0}%</span>;
  if (key === 'buchholz') return <span className="text-xs text-[var(--muted)]">{row.buchholz ?? 0}</span>;
  if (key === 'avgBuchholz') return <span className="text-xs text-[var(--muted)]">{row.avgBuchholz ?? 0}</span>;
  if (key === 'sonnebornBerger') return <span className="text-xs text-[var(--muted)]">{row.sonnebornBerger ?? 0}</span>;
  return null;
}

export const PublicLiveView: React.FC<Props> = ({ publicPath, theme, onToggleTheme, onClose }) => {
  const [data, setData] = useState<PublicLiveData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staleError, setStaleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'round' | 'table' | 'playoff'>('round');
  const [tvMode, setTvMode] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 960 : false
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dataRef = useRef<PublicLiveData | null>(null);
  dataRef.current = data;
  const reqSeqRef = useRef(0);

  const load = useCallback(
    async (manual = false) => {
      const reqId = ++reqSeqRef.current;
      if (manual) setRefreshing(true);
      try {
        const res = await fetchPublicLive(publicPath);
        if (reqId !== reqSeqRef.current) return;
        setData(res);
        setError(null);
        setStaleError(null);
      } catch (err) {
        if (reqId !== reqSeqRef.current) return;
        const msg = err instanceof Error ? err.message : 'Не удалось загрузить данные';
        if (dataRef.current) {
          setStaleError(msg);
        } else {
          setError(msg);
        }
      } finally {
        if (reqId === reqSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [publicPath]
  );

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        load();
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (_) {}
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[var(--bg)] text-white flex flex-col items-center justify-center gap-3 p-6">
        <span className="loading loading-spinner text-[#2ea6ff]" />
        <Brand className="text-lg" />
        <span className="text-xs text-[var(--muted)]">Подключение к live-трансляции...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[100dvh] bg-[var(--bg)] text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
        <Trophy size={48} className="text-[#2ea6ff]" />
        <Brand className="text-xl" />
        <p className="text-sm text-[var(--muted)] max-w-sm">
          {error || 'Live-трансляция недоступна'}
        </p>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost px-4 py-2.5 text-sm"
            >
              <ArrowLeft size={16} /> Назад
            </button>
          )}
          <button
            type="button"
            onClick={() => load(true)}
            className="btn btn-primary px-5 py-2.5 text-sm"
          >
            Повторить
          </button>
        </div>
        <button
          type="button"
          onClick={() => openTelegramChat()}
          className="px-4 py-2.5 rounded-2xl bg-[var(--bg-3)] border border-[var(--border-strong)] text-[var(--text)] text-sm font-semibold active:scale-95 transition-transform"
        >
          {SUPPORT_BUTTON}
        </button>
      </div>
    );
  }

  const { tournament, timings, leaderboard, currentRoundMatches, playoffMatches } = data;
  const hasPlayoff =
    tournament.status === 'PLAYOFF' ||
    tournament.status === 'FINISHED' ||
    playoffMatches.length > 0;

  const colConfig =
    Array.isArray(tournament.tableConfig) && tournament.tableConfig.length > 0
      ? tournament.tableConfig
      : DEFAULT_LIVE_COLS;
  const visibleCols = colConfig.filter((c) => c.key !== 'name' && c.visible).reverse();

  const roundSection = (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400">
          {tournament.status === 'PLAYOFF' || tournament.status === 'FINISHED'
            ? `Плей-офф • Раунд ${tournament.currentRound}`
            : tournament.currentRound > 0
              ? `Квалификация • Раунд ${tournament.currentRound}`
              : 'Матчи ещё не начались'}
        </h3>
        {currentRoundMatches.length > 0 && (
          <span className="text-xs font-semibold text-[#2ea6ff]">
            {
              currentRoundMatches.filter(
                (m) => m.status === 'FINISHED' || m.status === 'CANCELLED'
              ).length
            }{' '}
            / {currentRoundMatches.length}
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        {currentRoundMatches.map((m) => (
          <MatchCard key={m.id} match={m} myPlayerId={null} />
        ))}
        {currentRoundMatches.length === 0 && (
          <div className="bg-[#2c2c2e] border border-[#3a3a3c] rounded-2xl p-6 text-center text-sm text-gray-400">
            Ожидаем старта первого раунда
          </div>
        )}
      </div>
    </div>
  );

  const qualifiedIds = getPlayoffQualifiedIds(leaderboard, tournament.playoffSize);

  const tableSection = (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold text-gray-400">
          Турнирная таблица ({leaderboard.length})
        </h3>
        <span className="text-[11px] font-bold text-[#2ea6ff] bg-[#2ea6ff]/10 px-2 py-0.5 rounded">
          Топ-{tournament.playoffSize}
        </span>
      </div>

      <div className="bg-[#2c2c2e] border border-[#3a3a3c] rounded-2xl overflow-hidden">
        <div className="flex text-[11px] font-bold text-gray-500 uppercase tracking-wider px-3 py-2.5 border-b border-[#3a3a3c]">
          <div className="w-7 text-center">#</div>
          <div className="flex-1">Игрок</div>
          {visibleCols.map((c) => (
            <div key={c.key} className={`${COL_LABELS[c.key]?.width || 'w-10'} text-center`}>
              {COL_LABELS[c.key]?.short}
            </div>
          ))}
        </div>

        <div className="divide-y divide-[#3a3a3c]/50">
          {leaderboard.map((row) => {
            const inPlayoffZone = qualifiedIds.has(row.playerId);
            return (
              <div
                key={row.playerId}
                className={`flex items-center px-3 py-2.5 ${
                  !row.isActive
                    ? 'bg-gray-500/20 opacity-75'
                    : inPlayoffZone
                      ? ''
                      : 'opacity-75'
                }`}
              >
                <div
                  className={`w-7 text-center font-bold text-sm ${
                    row.rank <= 3 ? 'text-yellow-500' : 'text-gray-300'
                  }`}
                >
                  {row.rank}
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                  <PlayerAvatar
                    avatarUrl={null}
                    initials={row.initials}
                    name={row.name}
                    size="sm"
                  />
                  <span className="text-sm font-medium text-white truncate">
                    {row.name}
                  </span>
                  {!row.isActive && (
                    <span className="text-[10px] font-medium text-gray-400 bg-gray-500/20 px-1.5 py-0.5 rounded shrink-0">
                      Отсутствует
                    </span>
                  )}
                  {tournament.useBuckets && row.dypRole && (
                    <span
                      className={`text-[9px] font-semibold px-1 py-0.5 rounded shrink-0 ${
                        row.dypRole === 'A'
                          ? 'bg-[#2ea6ff]/20 text-[#2ea6ff]'
                          : 'bg-[#96f84d]/20 text-[#96f84d]'
                      }`}
                    >
                      {row.dypRole}
                    </span>
                  )}
                </div>
                {visibleCols.map((c) => (
                  <div key={c.key} className={`${COL_LABELS[c.key]?.width || 'w-10'} text-center`}>
                    {renderCell(c.key, row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const playoffSection = hasPlayoff ? (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-400 px-1">
        Сетка плей-офф
      </h3>
      <div className="bg-[#2c2c2e] border border-[#3a3a3c] rounded-2xl overflow-hidden">
        <PlayoffBracketView
          matches={playoffMatches}
          playoffSize={tournament.playoffSize}
          thirdPlaceMatch={tournament.thirdPlaceMatch}
          myPlayerId={null}
        />
      </div>
    </div>
  ) : null;

  return (
    <div className="min-h-[100dvh] bg-[var(--bg)] text-white flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 bg-[#2c2c2e]/95 backdrop-blur-md border-b border-[#3a3a3c]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--bg-3)] border border-[var(--border-strong)] text-xs font-bold text-[var(--text)] active:scale-95 shrink-0"
                >
                  <ArrowLeft size={13} /> Назад
                </button>
              )}
              <Brand className="text-base" />
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">
                <Radio size={11} className="animate-pulse" /> LIVE
              </span>
              <span className="text-[11px] text-gray-400 hidden sm:inline">
                {formatTimeHms(data.updatedAt)}
              </span>
            </div>
            <h1 className="text-lg font-semibold truncate mt-0.5">{tournament.name}</h1>
            <div className="text-xs text-gray-400">
              {tournament.status === 'REGISTRATION' && 'Регистрация'}
              {tournament.status === 'QUALIFICATION' && `Квалификация • Раунд ${tournament.currentRound}`}
              {tournament.status === 'PLAYOFF' && `Плей-офф • Раунд ${tournament.currentRound}`}
              {tournament.status === 'FINISHED' && 'Турнир завершен'}
              {' • '}
              {getDypModeLabel(tournament.dypMode)}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <SupportHeaderButton />
            <button
              type="button"
              onClick={() => setTvMode((v) => !v)}
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-bold active:scale-95 ${
                tvMode
                  ? 'bg-[#2ea6ff]/15 border-[#2ea6ff]/40 text-[#2ea6ff]'
                  : 'bg-[#1c1c1d] border-[#3a3a3c] text-gray-300'
              }`}
              title="Режим ТВ-экрана"
            >
              <LayoutPanelLeft size={15} /> ТВ
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-2 rounded-xl bg-[#1c1c1d] border border-[#3a3a3c] text-gray-300 active:scale-95"
              aria-label="Сменить тему"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              type="button"
              onClick={() => load(true)}
              className="p-2 rounded-xl bg-[#1c1c1d] border border-[#3a3a3c] text-gray-300 active:scale-95"
              title="Обновить"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="hidden sm:flex p-2 rounded-xl bg-[#1c1c1d] border border-[#3a3a3c] text-gray-300 active:scale-95"
              title="На весь экран"
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

        {/* Timings strip */}
        {timings && (timings.totalCount > 0 || timings.elapsedMinutes > 0) && (
          <div className="max-w-6xl mx-auto px-4 pb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Clock size={13} className="text-[#2ea6ff]" />
              Идёт: <strong className="text-white">{timings.elapsedMinutes} мин</strong>
            </span>
            <span>
              Матчей: <strong className="text-white">{timings.playedCount}/{timings.totalCount}</strong> ({timings.progressPercent}%)
            </span>
            {timings.avgMatchMinutes !== null && (
              <span>
                Ср. матч: <strong className="text-white">~{timings.avgMatchMinutes} мин</strong>
              </span>
            )}
            {timings.estimatedEndAt && tournament.status !== 'FINISHED' && (
              <span>
                Раунд до: <strong className="text-[#2ea6ff]">{formatTimeHm(timings.estimatedEndAt)}</strong>
              </span>
            )}
          </div>
        )}
      </header>

      <main className="max-w-6xl w-full mx-auto p-4 flex-1">
        {staleError && (
          <div className="mb-3 px-3 py-2 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-xs text-amber-300 flex items-center justify-between gap-2">
            <span>Проблема обновления данных: {staleError}</span>
            <button
              type="button"
              onClick={() => load(true)}
              className="px-2.5 py-1 rounded-xl bg-amber-500/20 font-bold text-amber-200 shrink-0 active:scale-95"
            >
              Обновить
            </button>
          </div>
        )}
        {tvMode ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-5">{roundSection}</div>
            <div className="lg:col-span-7 space-y-5">
              {playoffSection}
              {tableSection}
            </div>
          </div>
        ) : (
          <div className="max-w-xl mx-auto space-y-4">
            <div className={`grid ${hasPlayoff ? 'grid-cols-3' : 'grid-cols-2'} gap-1 bg-[#2c2c2e] border border-[#3a3a3c] p-1 rounded-xl`}>
              <button
                type="button"
                onClick={() => setTab('round')}
                className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                  tab === 'round' ? 'bg-[#2ea6ff] text-white' : 'text-gray-400'
                }`}
              >
                Раунд
              </button>
              <button
                type="button"
                onClick={() => setTab('table')}
                className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                  tab === 'table' ? 'bg-[#2ea6ff] text-white' : 'text-gray-400'
                }`}
              >
                Таблица
              </button>
              {hasPlayoff && (
                <button
                  type="button"
                  onClick={() => setTab('playoff')}
                  className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                    tab === 'playoff' ? 'bg-[#2ea6ff] text-white' : 'text-gray-400'
                  }`}
                >
                  Плей-офф
                </button>
              )}
            </div>

            {tab === 'round' && roundSection}
            {tab === 'table' && tableSection}
            {tab === 'playoff' && playoffSection}
          </div>
        )}
      </main>
    </div>
  );
};
