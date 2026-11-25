import React, { useState } from 'react';
import {
  Trophy,
  Play,
  Trash2,
  CheckCircle2,
  Undo2,
  Medal,
  Image as ImageIcon,
  Edit3,
  Check,
  X,
  Radio,
  Share2,
  RefreshCw,
  Settings,
  Clock,
} from 'lucide-react';
import type { MatchItem, TournamentSnapshot } from '../../types';
import { formatTimeHm, getPlayoffPodium } from '../../utils/date';
import { haptic, notify } from '../../utils/telegram';
import { shareImageFile, shareTournamentInTelegram } from '../../utils/share';
import { renderPodiumToPng, type PodiumImageResult } from '../../utils/exportPodiumImage';
import { getDypModeLabel } from '../InfoTooltip';
import { MatchCard } from '../MatchCard';
import { ScorePickerRow } from '../ScorePickerRow';
import { AdminDashboardModals } from '../admin/AdminDashboardModals';
import {
  WiseCard,
  WiseCircleAction,
  WisePillButton,
  WiseProgressBar,
  WiseScreenHeader,
  WiseSearchInput,
  WiseSegmentedControl,
} from './WisePrimitives';

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

export const WiseAdminDashboardView: React.FC<Props> = ({
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
  const [promptThirdPlace, setPromptThirdPlace] = useState<boolean>(
    Boolean(tournament.thirdPlaceMatch)
  );

  const openPodiumPreview = async () => {
    setGeneratingPodium(true);
    try {
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
      const outcome = await shareImageFile({
        blob: podiumPreview.blob,
        filename: `podium-${tournament.id}.png`,
        title: `${tournament.name}: победители`,
      });
      if (outcome === 'shared') {
        haptic('success');
        notify('Карточка призёров готова к отправке');
      } else if (outcome === 'copied') {
        haptic('success');
        notify('Скриншот скопирован, вставьте его в любой чат');
      } else if (outcome === 'downloaded') {
        haptic('success');
        notify('Скриншот сохранён, отправьте его в нужный чат');
      } else if (outcome === 'unsupported') {
        notify('На этом устройстве недоступен быстрый экспорт файла');
      }
    } catch (e) {
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

  const stageSummary =
    tournament.status === 'REGISTRATION'
      ? 'Регистрация'
      : tournament.status === 'QUALIFICATION'
        ? `Квалификация · Раунд ${tournament.currentRound}`
        : tournament.status === 'PLAYOFF'
          ? `Плей-офф · Раунд ${tournament.currentRound}`
          : 'Турнир завершён';

  const metaLine = [
    stageSummary,
    `${getDypModeLabel(tournament.dypMode)}${tournament.useBuckets ? ' (A/B)' : ''}`,
    `Столов: ${activeTablesCount}/${tournament.tablesCount}`,
    tournament.autoRounds ? 'Авто' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col h-full overflow-y-auto content-dock-pad">
      <div className="px-4 pt-4 pb-6 space-y-4">
        {/* Wise Hero */}
        <WiseScreenHeader
          title={tournament.name}
          subtitle={metaLine}
          right={
            totalCount > 0 ? (
              <span className="px-3 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] text-xs font-bold tabular-nums shrink-0">
                {finishedCount}/{totalCount}
              </span>
            ) : undefined
          }
        />

        {totalCount > 0 && (
          <div className="space-y-1.5">
            <WiseProgressBar value={finishedCount} max={totalCount} />
            {timings && (timings.playedCount > 0 || timings.elapsedMinutes > 0) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} className="text-[var(--accent-text)]" />
                  Идёт: <strong className="text-[var(--text)]">{timings.elapsedMinutes} мин</strong>
                </span>
                {timings.avgMatchMinutes !== null && (
                  <span>
                    Матч: <strong className="text-[var(--text)]">~{timings.avgMatchMinutes} мин</strong>
                  </span>
                )}
                <span>
                  Игр: <strong className="text-[var(--text)]">{timings.playedCount}/{timings.totalCount}</strong>
                </span>
                {timings.estimatedEndAt && tournament.status !== 'FINISHED' && (
                  <span>
                    До <strong className="text-[var(--accent-text)]">{formatTimeHm(timings.estimatedEndAt)}</strong>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* 4 круглых быстрых действия Wise */}
        <div className="grid grid-cols-4 gap-2">
          <WiseCircleAction
            icon={<Radio size={19} />}
            label="Live"
            active={Boolean(tournament.publicPath)}
            onClick={() => setShowLiveModal(true)}
            ariaLabel="Публичная Live-ссылка"
          />
          <WiseCircleAction
            icon={<Share2 size={19} />}
            label="Пригласить"
            onClick={() => shareTournamentInTelegram({ id: tournament.id, name: tournament.name })}
            ariaLabel="Поделиться ссылкой"
          />
          <WiseCircleAction
            icon={<RefreshCw size={19} />}
            label="Обновить"
            onClick={() => {
              void onRefresh();
            }}
            ariaLabel="Обновить"
          />
          <WiseCircleAction
            icon={<Settings size={19} />}
            label="Настройки"
            onClick={onOpenSettings}
            ariaLabel="Настройки турнира"
          />
        </div>

        {/* Быстрое переключение столов */}
        {tournament.tablesCount > 1 && tournament.status !== 'FINISHED' && (
          <WiseCard className="!py-2.5 !px-3.5 flex items-center justify-between gap-2 overflow-x-auto">
            <span className="text-xs font-semibold text-[var(--muted)] shrink-0">Столы:</span>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: tournament.tablesCount }, (_, i) => i + 1).map((tNum) => {
                const isOff = disabledSet.has(tNum);
                return (
                  <button
                    key={tNum}
                    type="button"
                    disabled={busy}
                    onClick={() => onToggleDisabledTable(tNum)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors active:scale-95 shrink-0 ${
                      isOff
                        ? 'bg-[var(--danger-soft)] text-[var(--danger)] line-through'
                        : 'bg-[var(--ok-soft)] text-[var(--ok)]'
                    }`}
                  >
                    #{tNum}
                  </button>
                );
              })}
            </div>
          </WiseCard>
        )}

        {/* Основные действия по раунду и плей-офф */}
        {tournament.status !== 'PLAYOFF' && tournament.status !== 'FINISHED' && (
          <>
            {tournament.pendingPlayoff ? (
              <WiseCard className="!bg-[var(--warn-soft)] flex items-center justify-between gap-3">
                <div className="text-xs text-[var(--text)] leading-snug">
                  <span className="font-bold text-[var(--warn)]">Плей-офф запланирован.</span>{' '}
                  Автораунды остановлены, после текущих матчей сразу стартует плей-офф.
                </div>
                <WisePillButton
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    void onCancelPendingPlayoff();
                  }}
                  className="shrink-0 !py-2 !px-3 text-xs bg-[var(--bg)]"
                >
                  Отменить
                </WisePillButton>
              </WiseCard>
            ) : (
              <div className="flex gap-2">
                {!(tournament.autoRounds && tournament.currentRound > 0) && (
                  <WisePillButton
                    variant="primary"
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
                    className="flex-1 py-3.5"
                  >
                    <Play size={16} />
                    {tournament.skipQualification || tournament.dypMode === 'elimination'
                      ? 'Запустить плей-офф'
                      : tournament.currentRound === 0
                        ? 'Запустить 1-й раунд'
                        : `Раунд ${tournament.currentRound + 1}`}
                  </WisePillButton>
                )}

                {tournament.currentRound > 0 && (
                  <>
                    <WisePillButton
                      variant="warn"
                      disabled={
                        busy ||
                        players.filter((p) => p.isActive).length <
                          (tournament.teamFormat === 'single' ? 2 : 4)
                      }
                      onClick={() => {
                        setPromptPlayoffSize(tournament.playoffSize || 8);
                        setPromptThirdPlace(Boolean(tournament.thirdPlaceMatch));
                        setPlayoffPromptOpen(true);
                      }}
                      className={tournament.autoRounds ? 'flex-1 py-3.5 text-xs' : 'px-4 py-3.5 text-xs'}
                    >
                      <Trophy size={15} /> В плей-офф
                    </WisePillButton>
                    {allCurrentFinished && (
                      <WisePillButton
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setConfirmFinish(true)}
                        title="Завершить турнир после квалификации"
                        className="px-3.5 py-3.5 text-xs !bg-[var(--ok-soft)] !text-[var(--ok)]"
                      >
                        <CheckCircle2 size={15} /> Завершить
                      </WisePillButton>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Панель завершения плей-офф */}
        {tournament.status === 'PLAYOFF' && (
          <WiseCard accent={playoffReadyToFinish} className="space-y-3">
            <div className="text-xs leading-snug">
              {playoffReadyToFinish ? (
                <>
                  <div className="font-bold text-[var(--ok)] flex items-center gap-1.5">
                    <CheckCircle2 size={14} />{' '}
                    {thirdPlaceMatch
                      ? 'Финал и матч за 3-е место завершены!'
                      : 'Финальный матч завершён!'}
                  </div>
                  <div className="text-[var(--muted)] mt-1">
                    Проверьте результаты и официально завершите турнир.
                  </div>
                </>
              ) : (
                <>
                  <div className="font-bold text-[var(--text)] flex items-center gap-1.5">
                    <Trophy size={14} className="text-amber-500" /> Идёт стадия плей-офф
                  </div>
                  <div className="text-[var(--muted)] mt-1">
                    Кнопка завершения станет активна после окончания финала
                    {tournament.thirdPlaceMatch ? ' и матча за 3-е место' : ''}.
                  </div>
                </>
              )}
            </div>
            <WisePillButton
              variant="primary"
              disabled={busy || !playoffReadyToFinish}
              onClick={() => setConfirmFinish(true)}
              className="w-full py-3"
            >
              <CheckCircle2 size={16} /> Завершить турнир
            </WisePillButton>
          </WiseCard>
        )}

        {/* Завершённый турнир: подиум и возобновление */}
        {tournament.status === 'FINISHED' && (
          <WiseCard className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold text-sm text-amber-500 flex items-center gap-1.5">
                <Medal size={16} /> Турнир завершён
              </div>
              <WisePillButton
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void onFinishTournament(true);
                }}
                className="!py-1.5 !px-3 text-xs bg-[var(--bg)]"
              >
                <Undo2 size={12} /> Возобновить
              </WisePillButton>
            </div>
            <WisePillButton
              variant="warn"
              loading={generatingPodium}
              disabled={generatingPodium}
              onClick={() => {
                void openPodiumPreview();
              }}
              className="w-full py-2.5 text-xs"
            >
              {!generatingPodium && <ImageIcon size={15} />}
              {generatingPodium ? 'Генерируем картинку…' : 'Карточка призёров · Поделиться'}
            </WisePillButton>
            {(podium.first || podium.second || podium.third) && (
              <div className="space-y-1.5 text-xs">
                {podium.first && (
                  <div className="flex items-center justify-between bg-[var(--bg)] rounded-2xl px-3.5 py-2">
                    <span className="text-amber-500 font-bold">1 место</span>
                    <span className="font-bold text-[var(--text)] truncate ml-2">{podium.first}</span>
                  </div>
                )}
                {podium.second && (
                  <div className="flex items-center justify-between bg-[var(--bg)] rounded-2xl px-3.5 py-2">
                    <span className="text-[var(--muted)] font-bold">2 место</span>
                    <span className="font-semibold text-[var(--text)] truncate ml-2">{podium.second}</span>
                  </div>
                )}
                {podium.third && (
                  <div className="flex items-center justify-between bg-[var(--bg)] rounded-2xl px-3.5 py-2">
                    <span className="text-amber-600 font-bold">3 место</span>
                    <span className="font-semibold text-[var(--text)] truncate ml-2">{podium.third}</span>
                  </div>
                )}
              </div>
            )}
          </WiseCard>
        )}

        {(() => {
          const minNeeded = tournament.teamFormat === 'single' ? 2 : 4;
          return (
            activePlayersCount < minNeeded &&
            tournament.status === 'REGISTRATION' && (
              <WiseCard className="!bg-[var(--warn-soft)] text-xs text-[var(--warn)]">
                Для старта раунда нужно минимум {minNeeded} активных игрока (сейчас: {activePlayersCount}). Добавьте участников во вкладке «Участники» или отправьте ссылку-приглашение.
              </WiseCard>
            )
          );
        })()}

        <div className="flex items-center justify-between pt-1">
          <h3 className="text-sm font-bold text-[var(--text)]">
            {tournament.status === 'PLAYOFF' || tournament.status === 'FINISHED'
              ? 'Матчи плей-офф'
              : 'Матчи раунда'}
          </h3>
          {tournament.currentRound > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDeleteRound(true)}
              className="text-xs font-bold text-[var(--danger)] bg-[var(--danger-soft)] px-3 py-1.5 rounded-full inline-flex items-center gap-1 active:scale-95 disabled:opacity-40"
            >
              <Trash2 size={12} /> Удалить раунд
            </button>
          )}
        </div>

        {currentRoundMatches.length > 0 && (
          <div className="space-y-2.5">
            <WiseSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Поиск по игроку или столу..."
              ariaLabel="Поиск матчей"
            />
            <WiseSegmentedControl
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'Все' },
                { value: 'playing', label: 'В игре' },
                { value: 'finished', label: 'Готово' },
              ]}
            />
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
                            <span className="text-[var(--accent-text)] text-sm font-bold tabular-nums">{inlineScore1}</span>
                          </div>
                          <ScorePickerRow
                            score={inlineScore1}
                            maxScore={maxBtn}
                            onChange={setInlineScore1}
                          />
                          <div className="flex items-center justify-between text-[11px] font-bold pt-1">
                            <span className="text-[var(--text)] truncate pr-2">{match.team2Label}</span>
                            <span className="text-[var(--accent-text)] text-sm font-bold tabular-nums">{inlineScore2}</span>
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
                              className="px-3.5 py-2 rounded-full bg-[var(--bg)] text-xs font-semibold text-[var(--muted)] inline-flex items-center gap-1"
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
                              className="flex-1 py-2 px-3 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-xs font-bold inline-flex items-center justify-center gap-1 disabled:opacity-50"
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
                            className="text-xs font-bold text-[var(--accent-text)] bg-[var(--accent-soft)] px-3 py-1.5 rounded-full inline-flex items-center gap-1.5"
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
          <WiseCard className="text-center text-xs text-[var(--muted)] py-8">
            Матчи еще не запущены
          </WiseCard>
        )}
      </div>

      <AdminDashboardModals
        tournament={tournament}
        busy={busy}
        podium={podium}
        editingMatch={editingMatch}
        setEditingMatch={setEditingMatch}
        getMaxButtonForMatch={getMaxButtonForMatch}
        onSaveEditingMatch={handleSave}
        onAdminManageMatch={onAdminManageMatch}
        confirmDeleteRound={confirmDeleteRound}
        setConfirmDeleteRound={setConfirmDeleteRound}
        onDeleteLastRound={onDeleteLastRound}
        showLiveModal={showLiveModal}
        setShowLiveModal={setShowLiveModal}
        onToggleLive={onToggleLive}
        confirmFinish={confirmFinish}
        setConfirmFinish={setConfirmFinish}
        onFinishTournament={onFinishTournament}
        onOpenPodiumPreview={openPodiumPreview}
        podiumPreview={podiumPreview}
        setPodiumPreview={setPodiumPreview}
        sharingPodium={sharingPodium}
        onSharePodium={handleSharePodium}
        playoffPromptOpen={playoffPromptOpen}
        setPlayoffPromptOpen={setPlayoffPromptOpen}
        promptPlayoffSize={promptPlayoffSize}
        setPromptPlayoffSize={setPromptPlayoffSize}
        promptThirdPlace={promptThirdPlace}
        setPromptThirdPlace={setPromptThirdPlace}
        onStartPlayoff={onStartPlayoff}
      />
    </div>
  );
};
