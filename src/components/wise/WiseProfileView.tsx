import React, { useState } from 'react';
import {
  User,
  LogOut,
  Trophy,
  Sun,
  Moon,
  History,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';
import type { TournamentHistoryItem, TournamentSnapshot } from '../../types';
import { apiClient } from '../../api/client';
import { formatDateRu, getPlayoffPodium } from '../../utils/date';
import { haptic } from '../../utils/telegram';
import type { Theme } from '../../utils/theme';
import { getDypModeLabel } from '../InfoTooltip';
import { Modal } from '../Modal';
import { PlayerAvatar } from '../PlayerAvatar';
import { PlayoffBracketView } from '../PlayoffBracketView';
import { formatBracketSlotLabel } from '../MatchCard';
import { TournamentHistoryCard } from '../TournamentHistoryCard';
import {
  WiseCard,
  WiseList,
  WiseListRow,
  WisePillButton,
  WiseScreenHeader,
  WiseSegmentedControl,
} from './WisePrimitives';

interface Props {
  snapshot?: TournamentSnapshot | null;
  userName?: string;
  userAvatarUrl?: string | null;
  tournamentHistory: TournamentHistoryItem[];
  theme: Theme;
  onChangeTheme: (theme: Theme) => void;
  onSelectTournament: (tournamentId: number) => void;
  onLeave: () => Promise<void>;
  busy: boolean;
}

function getStatusPill(status: TournamentHistoryItem['status']) {
  if (status === 'FINISHED') {
    return { label: 'Завершён', cls: 'bg-[var(--bg-3)] text-[var(--muted)]' };
  }
  if (status === 'PLAYOFF') {
    return { label: 'Плей-офф', cls: 'bg-[var(--accent-soft)] text-[var(--accent-text)]' };
  }
  if (status === 'QUALIFICATION') {
    return { label: 'Идёт', cls: 'bg-[var(--accent)] text-[var(--on-accent)]' };
  }
  return { label: 'Регистрация', cls: 'bg-[var(--bg-3)] text-[var(--muted)]' };
}

export const WiseProfileView: React.FC<Props> = ({
  snapshot = null,
  userName,
  userAvatarUrl,
  tournamentHistory,
  theme,
  onChangeTheme,
  onSelectTournament,
  onLeave,
  busy,
}) => {
  const myPlayerId = snapshot?.myPlayerId ?? null;
  const leaderboard = snapshot?.leaderboard ?? [];
  const myHistory = snapshot?.myHistory ?? [];
  const myStats = myPlayerId ? leaderboard.find((r) => r.playerId === myPlayerId) : undefined;
  const isLight = theme === 'light';

  const [inspectedSnapshot, setInspectedSnapshot] = useState<TournamentSnapshot | null>(null);
  const [inspectLoadingId, setInspectLoadingId] = useState<number | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectTab, setInspectTab] = useState<'stats' | 'table' | 'playoff'>('stats');
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);

  const handleOpenTournamentDetails = async (item: TournamentHistoryItem) => {
    if (snapshot && item.id === snapshot.tournament.id) {
      setInspectedSnapshot(snapshot);
      setInspectTab('stats');
      setInspectError(null);
      return;
    }
    setInspectLoadingId(item.id);
    setInspectError(null);
    try {
      const res = await apiClient.getState({ tournamentId: item.id });
      if (res.activeTournament) {
        setInspectedSnapshot(res.activeTournament);
        setInspectTab('stats');
      } else {
        setInspectError('Не удалось загрузить статистику турнира');
      }
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : 'Ошибка загрузки статистики');
    } finally {
      setInspectLoadingId(null);
    }
  };

  if (inspectedSnapshot) {
    const t = inspectedSnapshot.tournament;
    const tMyStats = inspectedSnapshot.leaderboard.find(
      (r) => r.playerId === inspectedSnapshot.myPlayerId
    );
    const tBadge = getStatusPill(t.status);
    const tDate = formatDateRu(t.finishedAt || t.startedAt || t.createdAt);
    const podium = getPlayoffPodium(inspectedSnapshot.playoffMatches);
    const hasPlayoff =
      t.status === 'PLAYOFF' ||
      t.status === 'FINISHED' ||
      inspectedSnapshot.playoffMatches.length > 0;
    const isCurrentActive = Boolean(snapshot && t.id === snapshot.tournament.id);

    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg)] z-10 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              setInspectedSnapshot(null);
            }}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent-text)] active:scale-95 transition-transform"
          >
            <ArrowLeft size={17} /> В профиль
          </button>
          <span className="text-xs font-semibold text-[var(--muted)]">Статистика турнира</span>
          {!isCurrentActive ? (
            <button
              type="button"
              onClick={() => {
                haptic('light');
                setInspectedSnapshot(null);
                onSelectTournament(t.id);
              }}
              className="text-xs font-bold text-[var(--on-accent)] bg-[var(--accent)] px-3 py-1.5 rounded-full inline-flex items-center gap-1 active:scale-95"
            >
              <ExternalLink size={12} /> Открыть
            </button>
          ) : (
            <span className="text-[11px] font-bold text-[var(--accent-text)] bg-[var(--accent-soft)] px-2.5 py-1 rounded-full">
              Текущий
            </span>
          )}
        </div>

        <div
          data-testid="profile-tournament-stats-scroll"
          className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain content-dock-pad"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="p-4 space-y-4">
            <WiseCard className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-bold text-[var(--text)] leading-snug">{t.name}</h2>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${tBadge.cls}`}>
                  {tBadge.label}
                </span>
              </div>
              <div className="text-xs text-[var(--muted)] flex flex-wrap items-center gap-x-2 gap-y-1">
                {tDate && <span>{tDate}</span>}
                <span>· {getDypModeLabel(t.dypMode)}</span>
                <span>· Участников: {inspectedSnapshot.players.length}</span>
              </div>

              {(podium.first || podium.second || podium.third) && (
                <div className="pt-2.5 border-t border-[var(--border)] space-y-1.5 text-xs">
                  {podium.first && (
                    <div className="flex justify-between gap-2">
                      <span className="text-amber-500 font-bold">1 место</span>
                      <span className="font-bold text-[var(--text)] truncate">{podium.first}</span>
                    </div>
                  )}
                  {podium.second && (
                    <div className="flex justify-between gap-2">
                      <span className="text-[var(--muted)] font-bold">2 место</span>
                      <span className="font-semibold text-[var(--text)] truncate">{podium.second}</span>
                    </div>
                  )}
                  {podium.third && (
                    <div className="flex justify-between gap-2">
                      <span className="text-amber-600 font-bold">3 место</span>
                      <span className="font-semibold text-[var(--text)] truncate">{podium.third}</span>
                    </div>
                  )}
                </div>
              )}
            </WiseCard>

            {tMyStats ? (
              <WiseCard accent className="space-y-3">
                <div className="text-xs font-bold text-[var(--accent-text)]">Ваши показатели</div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-[var(--bg)] rounded-2xl p-2.5">
                    <div className="text-base font-bold tabular-nums text-[var(--text)]">#{tMyStats.rank}</div>
                    <div className="text-[10px] text-[var(--muted)]">Место</div>
                  </div>
                  <div className="bg-[var(--bg)] rounded-2xl p-2.5">
                    <div className="text-base font-bold tabular-nums text-[var(--text)]">{tMyStats.points}</div>
                    <div className="text-[10px] text-[var(--muted)]">Очки</div>
                  </div>
                  <div className="bg-[var(--bg)] rounded-2xl p-2.5">
                    <div className="text-base font-bold tabular-nums text-[var(--accent-text)]">
                      {tMyStats.wins}/{tMyStats.games}
                    </div>
                    <div className="text-[10px] text-[var(--muted)]">Поб/Игр</div>
                  </div>
                  <div className="bg-[var(--bg)] rounded-2xl p-2.5">
                    <div
                      className={`text-base font-bold tabular-nums ${
                        tMyStats.diff > 0
                          ? 'text-[var(--ok)]'
                          : tMyStats.diff < 0
                            ? 'text-[var(--danger)]'
                            : 'text-[var(--muted)]'
                      }`}
                    >
                      {tMyStats.diff > 0 ? `+${tMyStats.diff}` : tMyStats.diff}
                    </div>
                    <div className="text-[10px] text-[var(--muted)]">+/-</div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--muted)] pt-2 border-t border-[var(--border)]">
                  <span>
                    Голы: <strong className="text-[var(--text)]">{tMyStats.goalsFor}:{tMyStats.goalsAgainst}</strong>
                  </span>
                  <span>
                    Ср. очки: <strong className="text-[var(--text)]">{tMyStats.ppm}</strong>
                  </span>
                  <span>
                    Побед:{' '}
                    <strong className="text-[var(--text)]">
                      {tMyStats.winRate ?? (tMyStats.games > 0 ? Math.round((tMyStats.wins / tMyStats.games) * 100) : 0)}%
                    </strong>
                  </span>
                </div>
              </WiseCard>
            ) : (
              <WiseCard className="text-xs text-[var(--muted)]">
                Вы участвовали в этом турнире как организатор.
              </WiseCard>
            )}

            <WiseSegmentedControl
              value={inspectTab}
              onChange={setInspectTab}
              options={[
                { value: 'stats', label: `Матчи (${inspectedSnapshot.myHistory.length})` },
                { value: 'table', label: `Таблица (${inspectedSnapshot.leaderboard.length})` },
                ...(hasPlayoff ? [{ value: 'playoff' as const, label: 'Плей-офф' }] : []),
              ]}
            />

            {inspectTab === 'stats' && (
              <div>
                {inspectedSnapshot.myHistory.length > 0 ? (
                  <WiseList>
                    {inspectedSnapshot.myHistory.map((m) => {
                      const iWon =
                        (m.myTeam === 1 && m.score1 > m.score2) ||
                        (m.myTeam === 2 && m.score2 > m.score1);
                      return (
                        <WiseListRow key={m.id}>
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="text-[11px] text-[var(--muted)]">
                              {m.stage === 'PLAYOFF'
                                ? formatBracketSlotLabel(m.bracketSlot) || 'Плей-офф'
                                : `Раунд ${m.roundNumber}`}{' '}
                              · Стол {m.tableNumber}
                            </div>
                            <div className="text-xs font-semibold text-[var(--text)] truncate mt-0.5">
                              {m.team1Label} <span className="text-[var(--muted)]">vs</span> {m.team2Label}
                            </div>
                          </div>
                          <div
                            className={`px-3 py-1 rounded-full font-bold text-xs tabular-nums shrink-0 ${
                              iWon
                                ? 'bg-[var(--ok-soft)] text-[var(--ok)]'
                                : 'bg-[var(--danger-soft)] text-[var(--danger)]'
                            }`}
                          >
                            {m.score1} : {m.score2}
                          </div>
                        </WiseListRow>
                      );
                    })}
                  </WiseList>
                ) : (
                  <WiseCard className="text-center text-xs text-[var(--muted)] py-6">
                    В этом турнире нет сыгранных вами матчей
                  </WiseCard>
                )}
              </div>
            )}

            {inspectTab === 'table' && (
              <WiseCard className="!p-0 overflow-hidden">
                <div className="flex text-[10px] font-bold text-[var(--muted)] uppercase px-3.5 py-2.5 border-b border-[var(--border)]">
                  <div className="w-7 text-center">#</div>
                  <div className="flex-1">Игрок</div>
                  <div className="w-9 text-center">Поб</div>
                  <div className="w-11 text-center">Очк</div>
                  <div className="w-10 text-center">+/-</div>
                  <div className="w-9 text-center">Игр</div>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {inspectedSnapshot.leaderboard.map((row) => {
                    const isMe = row.playerId === inspectedSnapshot.myPlayerId;
                    return (
                      <div
                        key={row.playerId}
                        className={`flex items-center px-3.5 py-2.5 text-xs ${
                          isMe ? 'bg-[var(--accent-soft)]' : ''
                        }`}
                      >
                        <div
                          className={`w-7 text-center font-bold tabular-nums ${
                            row.rank <= 3 ? 'text-amber-500' : 'text-[var(--muted)]'
                          }`}
                        >
                          {row.rank}
                        </div>
                        <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                          <PlayerAvatar
                            avatarUrl={row.avatarUrl}
                            initials={row.initials}
                            name={row.name}
                            isMe={isMe}
                            size="sm"
                          />
                          <span
                            className={`truncate ${
                              isMe ? 'text-[var(--accent-text)] font-bold' : 'text-[var(--text)] font-medium'
                            }`}
                          >
                            {row.name} {isMe ? '(Вы)' : ''}
                          </span>
                        </div>
                        <div className="w-9 text-center font-bold tabular-nums text-[var(--text)]">{row.wins}</div>
                        <div className="w-11 text-center tabular-nums text-[var(--muted)]">{row.points}</div>
                        <div
                          className={`w-10 text-center font-semibold tabular-nums ${
                            row.diff > 0
                              ? 'text-[var(--ok)]'
                              : row.diff < 0
                                ? 'text-[var(--danger)]'
                                : 'text-[var(--muted)]'
                          }`}
                        >
                          {row.diff > 0 ? `+${row.diff}` : row.diff}
                        </div>
                        <div className="w-9 text-center tabular-nums text-[var(--muted)]">{row.games}</div>
                      </div>
                    );
                  })}
                </div>
              </WiseCard>
            )}

            {inspectTab === 'playoff' && hasPlayoff && (
              <WiseCard className="!p-0 overflow-hidden">
                <PlayoffBracketView
                  matches={inspectedSnapshot.playoffMatches}
                  playoffSize={t.playoffSize}
                  thirdPlaceMatch={t.thirdPlaceMatch}
                  myPlayerId={inspectedSnapshot.myPlayerId}
                />
              </WiseCard>
            )}
          </div>
        </div>
      </div>
    );
  }

  const displayName = myStats?.name || userName || 'Гость турнира';

  return (
    <div
      className="h-full min-h-0 overflow-y-auto overscroll-y-contain content-dock-pad px-4 pt-4"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="flex flex-col min-h-full space-y-5 pb-6">
        {/* Чистый Wise Hero профиля с круглой кнопкой смены темы */}
        <WiseScreenHeader
          title={displayName}
          subtitle={snapshot ? snapshot.tournament.name : 'Личный профиль'}
          left={
            myStats?.avatarUrl || userAvatarUrl ? (
              <PlayerAvatar
                avatarUrl={myStats?.avatarUrl || userAvatarUrl || undefined}
                initials={myStats?.initials || displayName.slice(0, 2).toUpperCase()}
                name={displayName}
                isMe
                size="md"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center">
                <User size={22} />
              </div>
            )
          }
          right={
            <button
              type="button"
              onClick={() => {
                haptic('light');
                onChangeTheme(isLight ? 'dark' : 'light');
              }}
              className="w-10 h-10 rounded-full bg-[var(--bg-3)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text)] active:scale-95 transition-transform"
              aria-label={isLight ? 'Тёмная тема' : 'Светлая тема'}
              title={isLight ? 'Тёмная тема' : 'Светлая тема'}
              data-testid="profile-theme-btn"
            >
              {isLight ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          }
        />

        {myStats && (
          <WiseCard>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-xl font-bold tabular-nums text-amber-500">#{myStats.rank}</div>
                <div className="text-[11px] text-[var(--muted)] mt-0.5">Место</div>
              </div>
              <div>
                <div className="text-xl font-bold tabular-nums text-[var(--text)]">{myStats.points}</div>
                <div className="text-[11px] text-[var(--muted)] mt-0.5">Очки</div>
              </div>
              <div>
                <div className="text-xl font-bold tabular-nums text-[var(--accent-text)]">
                  {myStats.wins}/{myStats.games}
                </div>
                <div className="text-[11px] text-[var(--muted)] mt-0.5">Побед</div>
              </div>
              <div>
                <div className="text-xl font-bold tabular-nums text-[var(--text)]">
                  {myStats.diff > 0 ? `+${myStats.diff}` : myStats.diff}
                </div>
                <div className="text-[11px] text-[var(--muted)] mt-0.5">+/-</div>
              </div>
            </div>
          </WiseCard>
        )}

        <section className="space-y-2">
          <div className="text-sm font-bold text-[var(--text)] flex items-center gap-1.5">
            <History size={15} className="text-[var(--muted)]" />
            История турниров ({tournamentHistory.length})
          </div>

          {inspectError && (
            <div className="text-xs text-[var(--danger)] bg-[var(--danger-soft)] rounded-2xl px-3.5 py-2.5">
              {inspectError}
            </div>
          )}

          {tournamentHistory.length > 0 ? (
            <WiseList>
              {tournamentHistory.map((item) => (
                <TournamentHistoryCard
                  key={item.id}
                  item={item}
                  variant="row"
                  isCurrent={Boolean(snapshot && item.id === snapshot.tournament.id)}
                  loading={inspectLoadingId === item.id}
                  onClick={() => handleOpenTournamentDetails(item)}
                />
              ))}
            </WiseList>
          ) : (
            <WiseCard className="text-center text-xs text-[var(--muted)] py-6">
              Вы пока не участвовали в турнирах
            </WiseCard>
          )}
        </section>

        {snapshot && (
          <section className="space-y-2">
            <div className="text-sm font-bold text-[var(--text)] flex items-center gap-1.5">
              <Trophy size={15} className="text-[var(--muted)]" />
              История встреч ({myHistory.length})
            </div>

            {myHistory.length > 0 ? (
              <WiseList>
                {myHistory.map((m) => {
                  const iWon =
                    (m.myTeam === 1 && m.score1 > m.score2) ||
                    (m.myTeam === 2 && m.score2 > m.score1);
                  return (
                    <WiseListRow key={m.id}>
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="text-[11px] text-[var(--muted)]">
                          {m.stage === 'PLAYOFF'
                            ? formatBracketSlotLabel(m.bracketSlot) || 'Плей-офф'
                            : `Раунд ${m.roundNumber}`}{' '}
                          · Стол {m.tableNumber}
                        </div>
                        <div className="text-xs font-semibold text-[var(--text)] truncate mt-0.5">
                          {m.team1Label} <span className="text-[var(--muted)]">vs</span> {m.team2Label}
                        </div>
                      </div>
                      <div
                        className={`px-3 py-1 rounded-full font-bold text-xs tabular-nums shrink-0 ${
                          iWon
                            ? 'bg-[var(--ok-soft)] text-[var(--ok)]'
                            : 'bg-[var(--danger-soft)] text-[var(--danger)]'
                        }`}
                      >
                        {m.score1} : {m.score2}
                      </div>
                    </WiseListRow>
                  );
                })}
              </WiseList>
            ) : (
              <WiseCard className="text-center text-xs text-[var(--muted)] py-6">
                Сыгранных матчей пока нет
              </WiseCard>
            )}
          </section>
        )}

        {myPlayerId && (
          <div className="pt-2 mt-auto">
            <WisePillButton
              variant="danger"
              disabled={busy}
              onClick={() => setConfirmLeaveOpen(true)}
              className="w-full py-3.5"
            >
              <LogOut size={16} /> Выписаться из турнира
            </WisePillButton>
          </div>
        )}

        {confirmLeaveOpen && (
          <Modal
            title="Выписаться из турнира?"
            onClose={() => setConfirmLeaveOpen(false)}
            hideClose
            footer={
              <div className="btn-row">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmLeaveOpen(false)}
                  className="btn btn-ghost disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setConfirmLeaveOpen(false);
                    await onLeave();
                  }}
                  className="btn bg-red-600 text-white font-bold disabled:opacity-50"
                >
                  {busy ? 'Выписываем...' : 'Выписаться'}
                </button>
              </div>
            }
          >
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              Точно уверен? Весь прогресс потеряется
            </p>
          </Modal>
        )}
      </div>
    </div>
  );
};
