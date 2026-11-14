import React, { useState } from 'react';
import {
  Trophy,
  Play,
  Share2,
  Settings,
  RefreshCw,
  RotateCcw,
  Ban,
  Trash2,
  Radio,
  Clock,
  CheckCircle2,
  Undo2,
  Medal,
  Download,
  Image as ImageIcon,
  Search,
  Edit3,
  Check,
  X,
} from 'lucide-react';
import type { MatchItem, TournamentSnapshot } from '../types';
import { apiClient } from '../api/client';
import { formatTimeHm, getPlayoffPodium } from '../utils/date';
import { haptic, notify } from '../utils/telegram';
import { shareLiveUrlInTelegram, shareTournamentInTelegram } from '../utils/share';
import type { PodiumImageResult } from '../utils/exportPodiumImage';
import { Modal } from './Modal';
import { MatchCard } from './MatchCard';
import { ScorePickerRow } from './ScorePickerRow';
import { Toggle } from './Toggle';

interface Props {
  snapshot: TournamentSnapshot;
  onStartRound: () => Promise<void>;
  onStartPlayoff: (options?: { playoffSize?: number; thirdPlaceMatch?: boolean }) => Promise<void>;
  onCancelPendingPlayoff: () => Promise<void>;
  onFinishTournament: (reopen?: boolean) => Promise<void>;
  onDeleteLastRound: () => Promise<void>;
  onAdminSaveMatch: (matchId: number, score1: number, score2: number) => Promise<void>;
  onAdminManageMatch: (params: {
    matchId: number;
    action: 'set_table' | 'reset' | 'toggle_cancel';
    tableNumber?: number;
  }) => Promise<void>;
  onToggleDisabledTable: (tableNumber: number) => Promise<void>;
  onToggleLive: (enabled: boolean) => Promise<void>;
  onOpenSettings: () => void;
  onRefresh: () => Promise<void>;
  busy: boolean;
}

export const AdminDashboardView: React.FC<Props> = ({
  snapshot,
  onStartRound,
  onStartPlayoff,
  onCancelPendingPlayoff,
  onFinishTournament,
  onDeleteLastRound,
  onAdminSaveMatch,
  onAdminManageMatch,
  onToggleDisabledTable,
  onToggleLive,
  onOpenSettings,
  onRefresh,
  busy,
}) => {
  const { tournament, currentRoundMatches, playoffMatches, players, timings } = snapshot;
  const [editingMatch, setEditingMatch] = useState<MatchItem | null>(null);
  const [confirmDeleteRound, setConfirmDeleteRound] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [podiumPreview, setPodiumPreview] = useState<PodiumImageResult | null>(null);
  const [generatingPodium, setGeneratingPodium] = useState(false);
  const [sharingPodium, setSharingPodium] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'playing' | 'finished'>('all');
  const [inlineMatchId, setInlineMatchId] = useState<number | null>(null);
  const [inlineScore1, setInlineScore1] = useState(0);
  const [inlineScore2, setInlineScore2] = useState(0);
  const [playoffPromptOpen, setPlayoffPromptOpen] = useState(false);
  const [promptPlayoffSize, setPromptPlayoffSize] = useState<number>(tournament.playoffSize || 8);
  const [promptThirdPlace, setPromptThirdPlace] = useState<boolean>(Boolean(tournament.thirdPlaceMatch));

  const openPodiumPreview = async () => {
    setGeneratingPodium(true);
    try {
      const { renderPodiumToPng } = await import('../utils/exportPodiumImage');
      const rendered = await renderPodiumToPng(snapshot);
      setPodiumPreview(rendered);
      haptic('success');
    } catch {
      notify('Не удалось сформировать картинку призёров');
    } finally {
      setGeneratingPodium(false);
    }
  };

  const handleSharePodium = async () => {
    if (!podiumPreview || sharingPodium) return;
    setSharingPodium(true);
    haptic('light');
    try {
      const res = await apiClient.shareLeaderboard({
        tournamentId: tournament.id,
        imageBase64: podiumPreview.base64,
        kind: 'podium',
      });
      const webApp = window.Telegram?.WebApp;
      if (res.preparedMessageId && typeof webApp?.shareMessage === 'function') {
        webApp.shareMessage(res.preparedMessageId, (sent) => {
          if (sent) {
            haptic('success');
            notify('Итоги турнира отправлены в Telegram');
          }
        });
      } else if (res.sentToPm) {
        haptic('success');
        notify('Картинка отправлена вам в чат с ботом — перешлите её в любую группу');
      } else {
        throw new Error('Не удалось подготовить сообщение');
      }
    } catch (e) {
      const file = new File([podiumPreview.blob], `podium-${tournament.id}.png`, {
        type: 'image/png',
      });
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({
            files: [file],
            title: `${tournament.name} — победители`,
          });
          haptic('success');
          return;
        } catch {
          // user cancelled
        }
      }
      notify(e instanceof Error ? e.message : 'Ошибка отправки');
    } finally {
      setSharingPodium(false);
    }
  };

  const finalMatch = playoffMatches.find((m) => m.bracketSlot === 'FINAL');
  const thirdPlaceMatch = playoffMatches.find((m) => m.bracketSlot === 'THIRD_PLACE');
  const finalDone = Boolean(finalMatch && finalMatch.status === 'FINISHED');
  const thirdPlaceDone = !thirdPlaceMatch || thirdPlaceMatch.status === 'FINISHED';
  const playoffReadyToFinish = finalDone && thirdPlaceDone;
  const podium = getPlayoffPodium(playoffMatches);

  const finishedCount = currentRoundMatches.filter(
    (m) => m.status === 'FINISHED' || m.status === 'CANCELLED'
  ).length;
  const totalCount = currentRoundMatches.length;
  const allCurrentFinished = totalCount === 0 || finishedCount === totalCount;
  const activePlayersCount = players.filter((p) => p.isActive).length;
  const disabledSet = new Set(
    Array.isArray(tournament.disabledTables) ? tournament.disabledTables : []
  );
  const activeTablesCount = Math.max(1, tournament.tablesCount - disabledSet.size);

  const getMaxButtonForMatch = (m: MatchItem) =>
    m.stage === 'PLAYOFF'
      ? tournament.playoffWinByTwo
        ? tournament.playoffMaxScore
        : tournament.playoffTargetScore
      : tournament.winByTwo
        ? tournament.maxScore
        : tournament.targetScore;

  const handleSave = async () => {
    if (!editingMatch) return;
    await onAdminSaveMatch(editingMatch.id, editingMatch.score1, editingMatch.score2);
    setEditingMatch(null);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto content-dock-pad">
      <div className="p-4 border-b border-[#3a3a3c] bg-[#2c2c2e] sticky top-0 z-10">
        <div className="flex justify-between items-center gap-2">
          <h2 className="text-xl font-bold truncate pr-2">{tournament.name}</h2>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowLiveModal(true)}
              className={`p-1.5 rounded-lg border active:scale-95 ${
                tournament.publicPath
                  ? 'bg-green-500/15 text-green-400 border-green-500/35'
                  : 'bg-[#1c1c1d] text-gray-300 border-[#3a3a3c]'
              }`}
              title="Публичная Live-ссылка"
            >
              <Radio size={15} />
            </button>
            <button
              type="button"
              onClick={() =>
                shareTournamentInTelegram({ id: tournament.id, name: tournament.name })
              }
              className="bg-[#2ea6ff]/15 text-[#2ea6ff] border border-[#2ea6ff]/30 p-1.5 rounded-lg active:scale-95"
              title="Поделиться ссылкой"
            >
              <Share2 size={15} />
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="bg-[#1c1c1d] text-gray-300 border border-[#3a3a3c] p-1.5 rounded-lg active:scale-95"
              title="Обновить"
            >
              <RefreshCw size={15} />
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="bg-[#1c1c1d] text-gray-200 border border-[#3a3a3c] p-1.5 rounded-lg active:scale-95"
              title="Настройки турнира"
            >
              <Settings size={15} />
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-gray-400">
            {tournament.status === 'REGISTRATION' && 'Регистрация'}
            {tournament.status === 'QUALIFICATION' && `Квалификация • Раунд ${tournament.currentRound}`}
            {tournament.status === 'PLAYOFF' && `Плей-офф • Раунд ${tournament.currentRound}`}
            {tournament.status === 'FINISHED' && 'Турнир завершен'}
            {' • '}
            {tournament.dypMode === 'classic' ? 'Classic DYP' : 'Monster DYP'}
            {tournament.useBuckets ? ' (A/B)' : ''}
            {' • '}Столов: {activeTablesCount}/{tournament.tablesCount}
            {tournament.autoRounds ? ' • Авто' : ''}
          </span>
          {totalCount > 0 && (
            <span className="text-sm font-medium text-[#2ea6ff]">
              Сыграно {finishedCount} из {totalCount}
            </span>
          )}
        </div>

        {totalCount > 0 && (
          <div className="w-full bg-[#1c1c1d] h-2 rounded-full mt-3 overflow-hidden border border-[#3a3a3c]">
            <div
              className="bg-[#2ea6ff] h-full transition-all duration-500"
              style={{ width: `${(finishedCount / totalCount) * 100}%` }}
            />
          </div>
        )}

        {timings && (timings.playedCount > 0 || timings.elapsedMinutes > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 mt-2.5 pt-2 border-t border-[#3a3a3c]/50">
            <span className="flex items-center gap-1">
              <Clock size={12} className="text-[#2ea6ff]" />
              Идёт: <strong className="text-white">{timings.elapsedMinutes} мин</strong>
            </span>
            {timings.avgMatchMinutes !== null && (
              <span>
                Матч: <strong className="text-white">~{timings.avgMatchMinutes} мин</strong>
              </span>
            )}
            <span>
              Всего игр: <strong className="text-white">{timings.playedCount}/{timings.totalCount}</strong>
            </span>
            {timings.estimatedEndAt && tournament.status !== 'FINISHED' && (
              <span>
                Раунд до: <strong className="text-[#2ea6ff]">{formatTimeHm(timings.estimatedEndAt)}</strong>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Quick table toggles */}
        {tournament.tablesCount > 1 && tournament.status !== 'FINISHED' && (
          <div className="bg-[#2c2c2e] border border-[#3a3a3c] rounded-xl p-2.5 flex items-center justify-between gap-2 overflow-x-auto">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider shrink-0">
              Столы:
            </span>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: tournament.tablesCount }, (_, i) => i + 1).map((tNum) => {
                const isOff = disabledSet.has(tNum);
                return (
                  <button
                    key={tNum}
                    type="button"
                    disabled={busy}
                    onClick={() => onToggleDisabledTable(tNum)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors active:scale-95 shrink-0 ${
                      isOff
                        ? 'bg-red-500/10 border-red-500/30 text-red-400 line-through'
                        : 'bg-green-500/15 border-green-500/30 text-green-400'
                    }`}
                  >
                    #{tNum}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* Action bar */}
        {tournament.status !== 'PLAYOFF' && tournament.status !== 'FINISHED' && (
          <>
            {tournament.pendingPlayoff ? (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="text-xs text-yellow-300 leading-snug">
                  <span className="font-bold text-yellow-400">Плей-офф запланирован.</span>{' '}
                  Автораунды остановлены — после окончания текущих матчей сразу стартует плей-офф.
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onCancelPendingPlayoff}
                  className="shrink-0 bg-[#1c1c1d] border border-[#3a3a3c] text-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95"
                >
                  Отменить
                </button>
              </div>
            ) : (
              <div className="flex gap-2 mb-2">
                {!(tournament.autoRounds && tournament.currentRound > 0) && (
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !allCurrentFinished ||
                      activePlayersCount < (tournament.teamFormat === 'single' ? 2 : 4)
                    }
                    onClick={() => {
                      if (tournament.skipQualification || tournament.dypMode === 'elimination') {
                        setPromptPlayoffSize(tournament.playoffSize || 8);
                        setPromptThirdPlace(Boolean(tournament.thirdPlaceMatch));
                        setPlayoffPromptOpen(true);
                      } else {
                        void onStartRound();
                      }
                    }}
                    className="flex-1 bg-[#2ea6ff] disabled:opacity-40 text-white py-3 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <Play size={16} />
                    {tournament.skipQualification || tournament.dypMode === 'elimination'
                      ? 'Запустить плей-офф'
                      : tournament.currentRound === 0
                        ? 'Запустить 1-й раунд'
                        : `Раунд ${tournament.currentRound + 1}`}
                  </button>
                )}

                {tournament.currentRound > 0 && (
                  <>
                    <button
                      type="button"
                      disabled={busy || players.length < (tournament.teamFormat === 'single' ? 2 : 4)}
                      onClick={() => {
                        setPromptPlayoffSize(tournament.playoffSize || 8);
                        setPromptThirdPlace(Boolean(tournament.thirdPlaceMatch));
                        setPlayoffPromptOpen(true);
                      }}
                      className={`${
                        tournament.autoRounds ? 'flex-1 justify-center py-3' : 'px-3.5 py-3'
                      } text-xs font-bold text-amber-500 bg-amber-500/10 disabled:opacity-40 rounded-2xl flex items-center gap-1.5 border border-amber-500/25 active:scale-[0.98]`}
                    >
                      <Trophy size={15} /> В плей-офф
                    </button>
                    {allCurrentFinished && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmFinish(true)}
                        className="px-3 py-3 text-xs font-bold text-green-400 bg-green-500/10 disabled:opacity-40 rounded-xl flex items-center gap-1.5 border border-green-500/25 active:scale-[0.98]"
                        title="Завершить турнир после квалификации"
                      >
                        <CheckCircle2 size={15} /> Завершить
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Playoff completion action bar */}
        {tournament.status === 'PLAYOFF' && (
          <div
            className={`rounded-2xl border p-3.5 space-y-2.5 ${
              playoffReadyToFinish
                ? 'bg-green-500/10 border-green-500/35'
                : 'bg-[#2c2c2e] border-[#3a3a3c]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs leading-snug">
                {playoffReadyToFinish ? (
                  <>
                    <div className="font-bold text-green-400 flex items-center gap-1.5">
                      <CheckCircle2 size={14} />{' '}
                      {thirdPlaceMatch
                        ? 'Финал и матч за 3-е место завершены!'
                        : 'Финальный матч завершён!'}
                    </div>
                    <div className="text-gray-300 mt-0.5">
                      Проверьте результаты и официально завершите турнир.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <Trophy size={14} className="text-yellow-500" /> Идёт стадия плей-офф
                    </div>
                    <div className="text-gray-400 mt-0.5">
                      Кнопка завершения станет активна после окончания финала
                      {tournament.thirdPlaceMatch ? ' и матча за 3-е место' : ''}.
                    </div>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              disabled={busy || !playoffReadyToFinish}
              onClick={() => setConfirmFinish(true)}
              className="w-full bg-green-600 hover:bg-green-500 disabled:bg-[var(--bg-3)] disabled:text-[var(--muted)] disabled:border disabled:border-[var(--border-strong)] text-white py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-colors"
            >
              <CheckCircle2 size={16} /> Завершить турнир
            </button>
          </div>
        )}

        {/* Finished tournament podium & reopen */}
        {tournament.status === 'FINISHED' && (
          <div className="bg-[#2c2c2e] border border-yellow-500/35 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold text-sm text-yellow-500 flex items-center gap-1.5">
                <Medal size={16} /> Турнир завершён
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => onFinishTournament(true)}
                className="text-[11px] font-bold text-gray-300 bg-[#1c1c1d] border border-[#3a3a3c] px-2.5 py-1 rounded-lg flex items-center gap-1 active:scale-95 disabled:opacity-40"
              >
                <Undo2 size={12} /> Возобновить
              </button>
            </div>
            <button
              type="button"
              disabled={generatingPodium}
              onClick={openPodiumPreview}
              className="w-full py-2.5 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/20 border border-amber-500/35 text-amber-400 font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
            >
              <ImageIcon size={15} />
              {generatingPodium ? 'Генерируем картинку…' : 'Карточка призёров · Поделиться'}
            </button>
            {(podium.first || podium.second || podium.third) && (
              <div className="space-y-1.5 text-xs">
                {podium.first && (
                  <div className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-3 py-2">
                    <span className="text-yellow-500 font-bold">🥇 1 место</span>
                    <span className="font-bold text-white truncate ml-2">{podium.first}</span>
                  </div>
                )}
                {podium.second && (
                  <div className="flex items-center justify-between bg-[#1c1c1d] border border-[#3a3a3c] rounded-xl px-3 py-2">
                    <span className="text-gray-300 font-bold">🥈 2 место</span>
                    <span className="font-semibold text-white truncate ml-2">{podium.second}</span>
                  </div>
                )}
                {podium.third && (
                  <div className="flex items-center justify-between bg-[#1c1c1d] border border-[#3a3a3c] rounded-xl px-3 py-2">
                    <span className="text-amber-500 font-bold">🥉 3 место</span>
                    <span className="font-semibold text-white truncate ml-2">{podium.third}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activePlayersCount < 4 && tournament.status === 'REGISTRATION' && (
          <div className="text-xs text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
            Для старта раунда нужно минимум 4 активных игрока (сейчас: {activePlayersCount}). Добавьте участников во вкладке «Участники» или отправьте ссылку-приглашение.
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider">
            {tournament.status === 'PLAYOFF' || tournament.status === 'FINISHED'
              ? 'Матчи плей-офф'
              : 'Матчи раунда'}
          </h3>
          {tournament.currentRound > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDeleteRound(true)}
              className="text-[11px] font-bold text-red-400 bg-red-500/10 border border-red-500/25 px-2.5 py-1 rounded-lg flex items-center gap-1 active:scale-95 disabled:opacity-40"
            >
              <Trash2 size={12} /> Удалить раунд
            </button>
          )}
        </div>

        {/* Search & status filter bar */}
        {currentRoundMatches.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по игроку или столу..."
                aria-label="Поиск матчей"
                className="w-full bg-[var(--card)] border border-[var(--border)] rounded-2xl pl-8 pr-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-[#2ea6ff]"
              />
            </div>
            <div className="inline-flex bg-[var(--card)] border border-[var(--border)] rounded-full p-0.5 text-[11px]">
              {(
                [
                  ['all', 'Все'],
                  ['playing', 'В игре'],
                  ['finished', 'Готово'],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStatusFilter(k)}
                  className={`px-2.5 py-1 rounded-full font-bold transition-colors ${
                    statusFilter === k ? 'bg-[#2ea6ff] text-white' : 'text-[var(--muted)]'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          {currentRoundMatches
            .filter((match) => {
              if (statusFilter === 'playing' && match.status === 'FINISHED') return false;
              if (statusFilter === 'finished' && match.status !== 'FINISHED') return false;
              const q = searchQuery.trim().toLowerCase();
              if (!q) return true;
              const hay = `${match.team1Label} ${match.team2Label} стол ${match.tableNumber}`.toLowerCase();
              return hay.includes(q);
            })
            .map((match) => {
              const isInlineOpen = inlineMatchId === match.id;
              const maxBtn = getMaxButtonForMatch(match);
              return (
                <MatchCard
                  key={match.id}
                  match={match}
                  myPlayerId={snapshot.myPlayerId}
                  longMatchThresholdMin={tournament.longMatchAlertMin || 15}
                  onClick={() => setEditingMatch(match)}
                  inlineFooter={
                    tournament.status !== 'FINISHED' ? (
                      isInlineOpen ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-bold">
                            <span className="text-[var(--text)] truncate pr-2">{match.team1Label}</span>
                            <span className="text-[#2ea6ff] text-sm font-black">{inlineScore1}</span>
                          </div>
                          <ScorePickerRow
                            score={inlineScore1}
                            maxScore={maxBtn}
                            onChange={setInlineScore1}
                          />
                          <div className="flex items-center justify-between text-[11px] font-bold pt-1">
                            <span className="text-[var(--text)] truncate pr-2">{match.team2Label}</span>
                            <span className="text-[#2ea6ff] text-sm font-black">{inlineScore2}</span>
                          </div>
                          <ScorePickerRow
                            score={inlineScore2}
                            maxScore={maxBtn}
                            onChange={setInlineScore2}
                          />
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setInlineMatchId(null)}
                              className="px-3 py-1.5 rounded-full border border-[var(--border)] text-xs font-semibold text-[var(--muted)] inline-flex items-center gap-1"
                            >
                              <X size={13} /> Закрыть
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                await onAdminSaveMatch(match.id, inlineScore1, inlineScore2);
                                setInlineMatchId(null);
                              }}
                              className="flex-1 py-1.5 px-3 rounded-full bg-[#2ea6ff] text-white text-xs font-bold inline-flex items-center justify-center gap-1 disabled:opacity-50"
                            >
                              <Check size={13} /> Сохранить {inlineScore1}:{inlineScore2}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              haptic('light');
                              setInlineMatchId(match.id);
                              setInlineScore1(match.score1 || 0);
                              setInlineScore2(match.score2 || 0);
                            }}
                            className="text-xs font-bold text-[#2ea6ff] bg-[#2ea6ff]/10 hover:bg-[#2ea6ff]/20 px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Edit3 size={12} /> Быстрый счёт
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingMatch(match)}
                            className="text-[11px] font-medium text-[var(--muted)] px-2 py-1"
                          >
                            Стол / сброс →
                          </button>
                        </div>
                      )
                    ) : undefined
                  }
                />
              );
            })}
        </div>

        {currentRoundMatches.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-10">
            Матчи еще не запущены
          </div>
        )}
      </div>

      {/* Edit Match Modal (gym-gym Modal) */}
      {editingMatch && (
        <Modal
          title={`Редактирование матча (Стол ${editingMatch.tableNumber})`}
          onClose={() => setEditingMatch(null)}
          footer={
            <button
              type="button"
              disabled={busy}
              onClick={handleSave}
              className="btn btn-primary w-full py-3.5"
            >
              {busy ? 'Сохранение...' : `Сохранить счет: ${editingMatch.score1} - ${editingMatch.score2}`}
            </button>
          }
        >
          <div className="py-1 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-white truncate">
                  {editingMatch.team1Label}
                </span>
                <span className="text-xl font-black text-[#2ea6ff] shrink-0">
                  {editingMatch.score1}
                </span>
              </div>
              <ScorePickerRow
                score={editingMatch.score1}
                maxScore={getMaxButtonForMatch(editingMatch)}
                onChange={(val) =>
                  setEditingMatch((prev) => (prev ? { ...prev, score1: val } : null))
                }
              />
            </div>

            <div className="text-center font-black text-xs text-gray-500">VS</div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-white truncate">
                  {editingMatch.team2Label}
                </span>
                <span className="text-xl font-black text-[#2ea6ff] shrink-0">
                  {editingMatch.score2}
                </span>
              </div>
              <ScorePickerRow
                score={editingMatch.score2}
                maxScore={getMaxButtonForMatch(editingMatch)}
                onChange={(val) =>
                  setEditingMatch((prev) => (prev ? { ...prev, score2: val } : null))
                }
              />
            </div>

            {/* Table reassignment */}
            {tournament.tablesCount > 1 && (
              <div className="pt-2 border-t border-[var(--border)]">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                  Переназначить стол
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: tournament.tablesCount }, (_, i) => i + 1).map((tNum) => (
                    <button
                      key={tNum}
                      type="button"
                      disabled={busy || editingMatch.tableNumber === tNum}
                      onClick={async () => {
                        await onAdminManageMatch({
                          matchId: editingMatch.id,
                          action: 'set_table',
                          tableNumber: tNum,
                        });
                        setEditingMatch((prev) => (prev ? { ...prev, tableNumber: tNum } : null));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors active:scale-95 ${
                        editingMatch.tableNumber === tNum
                          ? 'bg-[#2ea6ff] border-[#2ea6ff] text-white'
                          : 'bg-[var(--bg)] border-[var(--border-strong)] text-gray-300'
                      }`}
                    >
                      Стол {tNum}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Match management actions: reset / cancel */}
            <div className="pt-2 border-t border-[var(--border)] grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const mId = editingMatch.id;
                  setEditingMatch(null);
                  await onAdminManageMatch({ matchId: mId, action: 'reset' });
                }}
                className="bg-[var(--bg)] border border-[var(--border-strong)] text-gray-200 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-40"
              >
                <RotateCcw size={14} /> Сбросить счёт
              </button>

              {editingMatch.stage === 'QUALIFICATION' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const mId = editingMatch.id;
                    setEditingMatch(null);
                    await onAdminManageMatch({ matchId: mId, action: 'toggle_cancel' });
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border active:scale-95 disabled:opacity-40 ${
                    editingMatch.status === 'CANCELLED'
                      ? 'bg-green-500/15 border-green-500/30 text-green-400'
                      : 'bg-red-500/10 border-red-500/25 text-red-400'
                  }`}
                >
                  <Ban size={14} />
                  {editingMatch.status === 'CANCELLED' ? 'Вернуть матч' : 'Отменить матч'}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Last Round Confirmation Modal */}
      {confirmDeleteRound && (
        <Modal
          title="Удалить текущий раунд?"
          onClose={() => setConfirmDeleteRound(false)}
          footer={
            <div className="btn-row">
              <button
                type="button"
                onClick={() => setConfirmDeleteRound(false)}
                className="btn btn-ghost"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setConfirmDeleteRound(false);
                  await onDeleteLastRound();
                }}
                className="btn bg-red-600 text-white font-bold"
              >
                Удалить раунд
              </button>
            </div>
          }
        >
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            Все матчи и результаты раунда №{tournament.currentRound} ({tournament.status === 'QUALIFICATION' ? 'Квалификация' : 'Плей-офф'}) будут безвозвратно удалены, а счётчик отдыхов вернётся на предыдущий шаг.
          </p>
        </Modal>
      )}

      {/* Public Live Broadcast Modal */}
      {showLiveModal && (
        <Modal
          title="Публичная Live-ссылка"
          onClose={() => setShowLiveModal(false)}
          closeLabel="Закрыть"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-sm text-white">Live-трансляция</div>
                <div className="text-xs text-[var(--muted)] mt-0.5">
                  Показывает текущий раунд, таблицу и сетку плей-офф в любом браузере и на ТВ без входа в Telegram
                </div>
              </div>
              <Toggle
                checked={Boolean(tournament.publicPath)}
                disabled={busy}
                onChange={(next) => onToggleLive(next)}
                color="green"
                ariaLabel="Включить Live-ссылку"
              />
            </div>

            {tournament.publicPath && (
              <button
                type="button"
                onClick={() =>
                  shareLiveUrlInTelegram({
                    name: tournament.name,
                    publicPath: tournament.publicPath!,
                  })
                }
                className="w-full bg-[#2ea6ff] text-white py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Share2 size={14} /> Поделиться
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* Finish Tournament Confirmation Modal */}
      {confirmFinish && (
        <Modal
          title="Завершить турнир?"
          onClose={() => setConfirmFinish(false)}
          footer={
            <div className="btn-row">
              <button
                type="button"
                onClick={() => setConfirmFinish(false)}
                className="btn btn-ghost"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setConfirmFinish(false);
                  await onFinishTournament(false);
                  await openPodiumPreview();
                }}
                className="btn bg-green-600 text-white font-bold"
              >
                Завершить
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-sm text-[var(--muted)]">
            <p className="leading-relaxed">
              {tournament.status === 'PLAYOFF'
                ? 'Турнир получит статус «Завершён», а итоговые призовые места будут зафиксированы.'
                : 'Завершить турнир по итогам квалификации без проведения плей-офф?'}
            </p>
            {(podium.first || podium.second || podium.third) && (
              <div className="space-y-1.5 text-xs">
                {podium.first && (
                  <div className="bg-[var(--bg)] border border-yellow-500/30 rounded-xl px-3 py-2 flex justify-between">
                    <span className="text-yellow-500 font-bold">🥇 1 место</span>
                    <span className="font-bold text-[var(--text)]">{podium.first}</span>
                  </div>
                )}
                {podium.second && (
                  <div className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-3 py-2 flex justify-between">
                    <span className="text-[var(--muted)] font-bold">🥈 2 место</span>
                    <span className="font-semibold text-[var(--text)]">{podium.second}</span>
                  </div>
                )}
                {podium.third && (
                  <div className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-3 py-2 flex justify-between">
                    <span className="text-amber-500 font-bold">🥉 3 место</span>
                    <span className="font-semibold text-[var(--text)]">{podium.third}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Podium Share Preview Modal */}
      {podiumPreview && (
        <Modal
          title="Итоги турнира"
          onClose={() => setPodiumPreview(null)}
          footer={
            <div className="btn-row">
              <a
                href={podiumPreview.dataUrl}
                download={`podium-${tournament.id}.png`}
                className="btn btn-ghost flex items-center justify-center gap-1.5"
              >
                <Download size={15} /> Скачать
              </a>
              <button
                type="button"
                disabled={sharingPodium}
                onClick={handleSharePodium}
                className="btn btn-primary font-bold flex items-center justify-center gap-1.5"
              >
                <Share2 size={15} />
                {sharingPodium ? 'Отправка…' : 'Поделиться'}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <img
              src={podiumPreview.dataUrl}
              alt="Победители и призёры турнира"
              className="w-full rounded-xl border border-[var(--border-strong)]"
            />
            <p className="text-xs text-[var(--muted)] text-center">
              Нажмите «Поделиться», чтобы отправить карточку призёров в Telegram.
            </p>
          </div>
        </Modal>
      )}

      {/* Playoff Start Configuration Modal */}
      {playoffPromptOpen && (
        <Modal
          title="Запуск плей-офф"
          onClose={() => setPlayoffPromptOpen(false)}
          footer={
            <div className="btn-row">
              <button
                type="button"
                onClick={() => setPlayoffPromptOpen(false)}
                className="btn btn-ghost"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const payload = {
                    playoffSize: promptPlayoffSize,
                    thirdPlaceMatch: promptThirdPlace,
                  };
                  setPlayoffPromptOpen(false);
                  await onStartPlayoff(payload);
                }}
                className="btn btn-primary font-bold"
              >
                Начать плей-офф
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                Размер сетки плей-офф
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(tournament.teamFormat === 'single' ? [2, 4, 8, 16, 32] : [4, 8, 16, 32]).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      haptic('light');
                      setPromptPlayoffSize(n);
                    }}
                    className={`px-3 py-1.5 rounded-2xl text-xs font-bold border transition-colors ${
                      promptPlayoffSize === n
                        ? 'bg-[#2ea6ff] text-white border-[#2ea6ff]'
                        : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'
                    }`}
                  >
                    Топ-{n}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between gap-2 bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-3.5 py-3 cursor-pointer">
              <div>
                <div className="text-sm font-semibold text-[var(--text)]">Матч за 3-е место</div>
                <div className="text-xs text-[var(--muted)]">
                  Проигравшие в полуфиналах сыграют за бронзу
                </div>
              </div>
              <input
                type="checkbox"
                checked={promptThirdPlace}
                onChange={(e) => setPromptThirdPlace(e.target.checked)}
                className="w-5 h-5 accent-[#2ea6ff]"
              />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
};
