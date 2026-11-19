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
import type { TournamentHistoryItem, TournamentSnapshot } from '../types';
import { apiClient } from '../api/client';
import { formatDateRu, getPlayoffPodium } from '../utils/date';
import { getDypModeLabel } from './InfoTooltip';
import type { Theme } from '../utils/theme';
import { Modal } from './Modal';
import { PlayerAvatar } from './PlayerAvatar';
import { Toggle } from './Toggle';
import { PlayoffBracketView } from './PlayoffBracketView';
import { formatBracketSlotLabel } from './MatchCard';
import { TournamentHistoryCard } from './TournamentHistoryCard';

interface Props {
  snapshot: TournamentSnapshot;
  tournamentHistory: TournamentHistoryItem[];
  theme: Theme;
  onChangeTheme: (theme: Theme) => void;
  onSelectTournament: (tournamentId: number) => void;
  onLeave: () => Promise<void>;
  busy: boolean;
}

function getStatusBadge(status: TournamentHistoryItem['status']) {
  if (status === 'FINISHED') {
    return { label: 'Завершён', cls: 'bg-green-500/15 text-green-400 border-green-500/30' };
  }
  if (status === 'PLAYOFF') {
    return { label: 'Плей-офф', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' };
  }
  if (status === 'QUALIFICATION') {
    return { label: 'Идёт', cls: 'bg-[#2ea6ff]/15 text-[#2ea6ff] border-[#2ea6ff]/30' };
  }
  return { label: 'Регистрация', cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30' };
}

export const ProfileView: React.FC<Props> = ({
  snapshot,
  tournamentHistory,
  theme,
  onChangeTheme,
  onSelectTournament,
  onLeave,
  busy,
}) => {
  const { myPlayerId, leaderboard, myHistory } = snapshot;
  const myStats = leaderboard.find((r) => r.playerId === myPlayerId);
  const isLight = theme === 'light';

  const [inspectedSnapshot, setInspectedSnapshot] = useState<TournamentSnapshot | null>(null);
  const [inspectLoadingId, setInspectLoadingId] = useState<number | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectTab, setInspectTab] = useState<'stats' | 'table' | 'playoff'>('stats');
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);

  const handleOpenTournamentDetails = async (item: TournamentHistoryItem) => {
    if (item.id === snapshot.tournament.id) {
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

  // Drill-down view for selected historical tournament
  if (inspectedSnapshot) {
    const t = inspectedSnapshot.tournament;
    const tMyStats = inspectedSnapshot.leaderboard.find(
      (r) => r.playerId === inspectedSnapshot.myPlayerId
    );
    const tBadge = getStatusBadge(t.status);
    const tDate = formatDateRu(t.finishedAt || t.startedAt || t.createdAt);
    const podium = getPlayoffPodium(inspectedSnapshot.playoffMatches);
    const hasPlayoff =
      t.status === 'PLAYOFF' ||
      t.status === 'FINISHED' ||
      inspectedSnapshot.playoffMatches.length > 0;
    const isCurrentActive = t.id === snapshot.tournament.id;

    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 p-4 border-b border-[var(--border)] bg-[var(--bg-2)]/95 backdrop-blur-md z-10 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setInspectedSnapshot(null)}
            className="flex items-center gap-1.5 text-sm font-semibold text-[#2ea6ff] active:scale-95"
          >
            <ArrowLeft size={18} /> В профиль
          </button>
          <span className="text-xs font-bold text-gray-400">Статистика турнира</span>
          {!isCurrentActive ? (
            <button
              type="button"
              onClick={() => {
                setInspectedSnapshot(null);
                onSelectTournament(t.id);
              }}
              className="text-xs font-bold text-[#2ea6ff] bg-[#2ea6ff]/10 border border-[#2ea6ff]/30 px-2.5 py-1.5 rounded-lg flex items-center gap-1 active:scale-95"
            >
              <ExternalLink size={12} /> Открыть
            </button>
          ) : (
            <span className="text-[11px] font-bold text-green-400 bg-green-500/10 border border-green-500/25 px-2 py-1 rounded-lg">
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
          {/* Tournament header card */}
          <div className="bg-[#2c2c2e] border border-[#3a3a3c] rounded-2xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold leading-snug">{t.name}</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${tBadge.cls}`}>
                {tBadge.label}
              </span>
            </div>
            <div className="text-xs text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-1">
              {tDate && <span>{tDate}</span>}
              <span>• {getDypModeLabel(t.dypMode)}</span>
              <span>• Участников: {inspectedSnapshot.players.length}</span>
            </div>

            {(podium.first || podium.second || podium.third) && (
              <div className="pt-2 border-t border-[#3a3a3c]/60 space-y-1 text-xs">
                {podium.first && (
                  <div className="flex justify-between gap-2">
                    <span className="text-yellow-500 font-bold">🥇 1 место</span>
                    <span className="font-semibold text-white truncate">{podium.first}</span>
                  </div>
                )}
                {podium.second && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-300 font-bold">🥈 2 место</span>
                    <span className="font-medium text-white truncate">{podium.second}</span>
                  </div>
                )}
                {podium.third && (
                  <div className="flex justify-between gap-2">
                    <span className="text-amber-500 font-bold">🥉 3 место</span>
                    <span className="font-medium text-white truncate">{podium.third}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* My personal stats summary */}
          {tMyStats ? (
            <div className="bg-[#2c2c2e] border border-[#2ea6ff]/30 rounded-2xl p-4">
              <div className="text-xs font-semibold text-gray-400 mb-3">
                Ваши показатели
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-[#1c1c1d] rounded-xl p-2 border border-[#3a3a3c]">
                  <div className="text-base font-semibold text-yellow-500">#{tMyStats.rank}</div>
                  <div className="text-[10px] text-gray-400">Место</div>
                </div>
                <div className="bg-[#1c1c1d] rounded-xl p-2 border border-[#3a3a3c]">
                  <div className="text-base font-semibold text-white">{tMyStats.points}</div>
                  <div className="text-[10px] text-gray-400">Очки</div>
                </div>
                <div className="bg-[#1c1c1d] rounded-xl p-2 border border-[#3a3a3c]">
                  <div className="text-base font-semibold text-[#2ea6ff]">
                    {tMyStats.wins}/{tMyStats.games}
                  </div>
                  <div className="text-[10px] text-gray-400">Поб/Игр</div>
                </div>
                <div className="bg-[#1c1c1d] rounded-xl p-2 border border-[#3a3a3c]">
                  <div
                    className={`text-base font-semibold ${
                      tMyStats.diff > 0
                        ? 'text-green-400'
                        : tMyStats.diff < 0
                          ? 'text-red-400'
                          : 'text-gray-300'
                    }`}
                  >
                    {tMyStats.diff > 0 ? `+${tMyStats.diff}` : tMyStats.diff}
                  </div>
                  <div className="text-[10px] text-gray-400">+/-</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400 mt-3 pt-2.5 border-t border-[#3a3a3c]/60">
                <span>
                  Голы: <strong className="text-white">{tMyStats.goalsFor}:{tMyStats.goalsAgainst}</strong>
                </span>
                <span>
                  Ср. очки: <strong className="text-white">{tMyStats.ppm}</strong>
                </span>
                <span>
                  Побед:{' '}
                  <strong className="text-white">
                    {tMyStats.winRate ?? (tMyStats.games > 0 ? Math.round((tMyStats.wins / tMyStats.games) * 100) : 0)}%
                  </strong>
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-[#2c2c2e] border border-[#3a3a3c] rounded-2xl p-3.5 text-xs text-gray-400">
              Вы участвовали в этом турнире как организатор.
            </div>
          )}

          {/* Inner navigation tabs */}
          <div className={`grid ${hasPlayoff ? 'grid-cols-3' : 'grid-cols-2'} gap-1 bg-[#2c2c2e] border border-[#3a3a3c] p-1 rounded-xl`}>
            <button
              type="button"
              onClick={() => setInspectTab('stats')}
              className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                inspectTab === 'stats' ? 'bg-[#2ea6ff] text-white' : 'text-gray-400'
              }`}
            >
              Матчи ({inspectedSnapshot.myHistory.length})
            </button>
            <button
              type="button"
              onClick={() => setInspectTab('table')}
              className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                inspectTab === 'table' ? 'bg-[#2ea6ff] text-white' : 'text-gray-400'
              }`}
            >
              Таблица ({inspectedSnapshot.leaderboard.length})
            </button>
            {hasPlayoff && (
              <button
                type="button"
                onClick={() => setInspectTab('playoff')}
                className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                  inspectTab === 'playoff' ? 'bg-[#2ea6ff] text-white' : 'text-gray-400'
                }`}
              >
                Плей-офф
              </button>
            )}
          </div>

          {inspectTab === 'stats' && (
            <div className="space-y-2">
              {inspectedSnapshot.myHistory.map((m) => {
                const iWon =
                  (m.myTeam === 1 && m.score1 > m.score2) ||
                  (m.myTeam === 2 && m.score2 > m.score1);
                return (
                  <div
                    key={m.id}
                    className="bg-[#2c2c2e] border border-[#3a3a3c] rounded-xl p-3 flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="text-[11px] text-gray-400 mb-1">
                        {m.stage === 'PLAYOFF'
                          ? formatBracketSlotLabel(m.bracketSlot) || 'Плей-офф'
                          : `Раунд ${m.roundNumber}`}{' '}
                        • Стол {m.tableNumber}
                      </div>
                      <div className="text-xs font-medium text-white truncate">
                        {m.team1Label} <span className="text-gray-500">vs</span> {m.team2Label}
                      </div>
                    </div>
                    <div
                      className={`px-3 py-1.5 rounded-lg font-semibold text-sm shrink-0 ${
                        iWon ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                      }`}
                    >
                      {m.score1} : {m.score2}
                    </div>
                  </div>
                );
              })}
              {inspectedSnapshot.myHistory.length === 0 && (
                <div className="text-center text-gray-500 text-sm py-8 bg-[#2c2c2e]/40 rounded-xl border border-[#3a3a3c]/50">
                  В этом турнире нет сыгранных вами матчей
                </div>
              )}
            </div>
          )}

          {inspectTab === 'table' && (
            <div className="bg-[#2c2c2e] border border-[#3a3a3c] rounded-2xl overflow-hidden">
              <div className="flex text-[10px] font-bold text-gray-500 uppercase px-3 py-2 border-b border-[#3a3a3c]">
                <div className="w-7 text-center">#</div>
                <div className="flex-1">Игрок</div>
                <div className="w-9 text-center">Поб</div>
                <div className="w-11 text-center">Очк</div>
                <div className="w-10 text-center">+/-</div>
                <div className="w-9 text-center">Игр</div>
              </div>
              <div className="divide-y divide-[#3a3a3c]/50">
                {inspectedSnapshot.leaderboard.map((row) => {
                  const isMe = row.playerId === inspectedSnapshot.myPlayerId;
                  return (
                    <div
                      key={row.playerId}
                      className={`flex items-center px-3 py-2.5 text-xs ${
                        isMe ? 'bg-[#2ea6ff]/10' : ''
                      }`}
                    >
                      <div
                        className={`w-7 text-center font-bold ${
                          row.rank <= 3 ? 'text-yellow-500' : 'text-gray-300'
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
                            isMe ? 'text-[#2ea6ff] font-bold' : 'text-white font-medium'
                          }`}
                        >
                          {row.name} {isMe ? '(Вы)' : ''}
                        </span>
                      </div>
                      <div className="w-9 text-center font-bold text-white">{row.wins}</div>
                      <div className="w-11 text-center text-gray-300">{row.points}</div>
                      <div
                        className={`w-10 text-center font-semibold ${
                          row.diff > 0
                            ? 'text-green-400'
                            : row.diff < 0
                              ? 'text-red-400'
                              : 'text-gray-400'
                        }`}
                      >
                        {row.diff > 0 ? `+${row.diff}` : row.diff}
                      </div>
                      <div className="w-9 text-center text-gray-400">{row.games}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {inspectTab === 'playoff' && hasPlayoff && (
            <div className="bg-[#2c2c2e] border border-[#3a3a3c] rounded-2xl overflow-hidden">
              <PlayoffBracketView
                matches={inspectedSnapshot.playoffMatches}
                playoffSize={t.playoffSize}
                thirdPlaceMatch={t.thirdPlaceMatch}
                myPlayerId={inspectedSnapshot.myPlayerId}
              />
            </div>
          )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full min-h-0 overflow-y-auto overscroll-y-contain content-dock-pad p-4"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="flex flex-col min-h-full">
      <div className="flex flex-col items-center text-center py-6 bg-[#2c2c2e] rounded-2xl border border-[#3a3a3c] mb-4">
        {myStats?.avatarUrl ? (
          <PlayerAvatar
            avatarUrl={myStats.avatarUrl}
            initials={myStats.initials}
            name={myStats.name}
            isMe
            size="lg"
            className="mb-3"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-[#2ea6ff]/20 text-[#2ea6ff] flex items-center justify-center mb-3">
            <User size={32} />
          </div>
        )}
        <h2 className="text-xl font-bold">{myStats?.name || 'Гость турнира'}</h2>
        {myStats && (
          <div className="flex gap-6 mt-4 text-center">
            <div>
              <div className="text-lg font-semibold text-yellow-500">#{myStats.rank}</div>
              <div className="text-[11px] text-gray-400">Место</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-white">{myStats.points}</div>
              <div className="text-[11px] text-gray-400">Очки</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-[#2ea6ff]">
                {myStats.wins}/{myStats.games}
              </div>
              <div className="text-[11px] text-gray-400">Побед</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-gray-300">
                {myStats.diff > 0 ? `+${myStats.diff}` : myStats.diff}
              </div>
              <div className="text-[11px] text-gray-400">+/-</div>
            </div>
          </div>
        )}
      </div>

      <h3 className="text-xs font-semibold text-gray-500 mb-2 px-1">
        Настройки профиля
      </h3>
      <div className="bg-[#2c2c2e] border border-[#3a3a3c] rounded-2xl p-4 mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#2ea6ff]/15 text-[#2ea6ff] flex items-center justify-center shrink-0">
            {isLight ? <Sun size={18} /> : <Moon size={18} />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Светлая тема</div>
            <div className="text-[11px] text-gray-400">
              {isLight ? 'Включена (сохраняется)' : 'Выключена, используется тёмная'}
            </div>
          </div>
        </div>
        <Toggle
          checked={isLight}
          onChange={(checked) => onChangeTheme(checked ? 'light' : 'dark')}
          ariaLabel="Переключить тему интерфейса"
        />
      </div>

      {/* Tournament participation history */}
      <h3 className="text-xs font-semibold text-gray-500 mb-2 px-1 flex items-center gap-1.5">
        <History size={13} /> История турниров ({tournamentHistory.length})
      </h3>

      {inspectError && (
        <div className="mb-2 text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-xl p-2.5">
          {inspectError}
        </div>
      )}

      <div className="space-y-2.5 mb-5">
        {tournamentHistory.map((item) => (
          <TournamentHistoryCard
            key={item.id}
            item={item}
            isCurrent={item.id === snapshot.tournament.id}
            loading={inspectLoadingId === item.id}
            onClick={() => handleOpenTournamentDetails(item)}
          />
        ))}

        {tournamentHistory.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-6 bg-[#2c2c2e]/40 rounded-xl border border-[#3a3a3c]/50">
            Вы пока не участвовали в турнирах
          </div>
        )}
      </div>

      <h3 className="text-xs font-semibold text-gray-500 mb-2 px-1 flex items-center gap-1.5">
        <Trophy size={13} /> История встреч ({myHistory.length})
      </h3>

      <div className="space-y-2 mb-6">
        {myHistory.map((m) => {
          const iWon =
            (m.myTeam === 1 && m.score1 > m.score2) ||
            (m.myTeam === 2 && m.score2 > m.score1);
          return (
            <div
              key={m.id}
              className="bg-[#2c2c2e] border border-[#3a3a3c] rounded-xl p-3 flex items-center justify-between"
            >
              <div className="min-w-0 flex-1 pr-3">
                <div className="text-[11px] text-gray-400 mb-1">
                  {m.stage === 'PLAYOFF'
                    ? formatBracketSlotLabel(m.bracketSlot) || 'Плей-офф'
                    : `Раунд ${m.roundNumber}`}{' '}
                  • Стол {m.tableNumber}
                </div>
                <div className="text-xs font-medium text-white truncate">
                  {m.team1Label} <span className="text-gray-500">vs</span> {m.team2Label}
                </div>
              </div>
              <div
                className={`px-3 py-1.5 rounded-lg font-semibold text-sm shrink-0 ${
                  iWon ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                }`}
              >
                {m.score1} : {m.score2}
              </div>
            </div>
          );
        })}

        {myHistory.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-8 bg-[#2c2c2e]/40 rounded-xl border border-[#3a3a3c]/50">
            Сыгранных матчей пока нет
          </div>
        )}
      </div>

      {myPlayerId && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmLeaveOpen(true)}
          className="mt-auto flex items-center justify-center gap-2 text-red-500 bg-red-500/10 px-6 py-3.5 rounded-xl font-semibold border border-red-500/20 active:scale-95 transition-transform duration-150 ease-out"
        >
          <LogOut size={18} /> Выписаться из турнира
        </button>
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
