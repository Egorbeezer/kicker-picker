import React, { useState, useEffect } from 'react';
import { SlidersHorizontal, Power, Eye, EyeOff, ArrowUp, ArrowDown, Share2, Download, Clock, Radio, GripVertical } from 'lucide-react';
import { TieBreakersTooltip } from './InfoTooltip';
import type { LeaderboardRow, TableColumnConfig, TableColumnKey, TournamentSnapshot } from '../types';
import { apiClient, buildPublicLiveUrl } from '../api/client';
import { haptic, notify } from '../utils/telegram';
import { Modal } from './Modal';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayoffBracketView } from './PlayoffBracketView';

interface Props {
  snapshot: TournamentSnapshot;
  busy?: boolean;
  onSaveTableConfig?: (config: TableColumnConfig[]) => Promise<void>;
  onOpenLive?: (publicPath: string) => void;
}

interface ColumnMeta {
  key: TableColumnKey;
  label: string;
  shortLabel: string;
  defaultSort: boolean;
  defaultVisible: boolean;
  widthClass: string;
}

const DEFAULT_META: ColumnMeta[] = [
  { key: 'wins', label: 'Выиграно игр', shortLabel: 'Поб', defaultSort: true, defaultVisible: true, widthClass: 'w-10' },
  { key: 'ppm', label: 'Среднее кол-во очков', shortLabel: 'Ср.очк', defaultSort: true, defaultVisible: true, widthClass: 'w-12' },
  { key: 'fairPpm', label: 'Среднее (честное с порогом)', shortLabel: 'Ч.очк', defaultSort: false, defaultVisible: false, widthClass: 'w-12' },
  { key: 'points', label: 'Всего очков', shortLabel: 'Очки', defaultSort: false, defaultVisible: false, widthClass: 'w-10' },
  { key: 'diff', label: 'Разница голов', shortLabel: '+/-', defaultSort: true, defaultVisible: true, widthClass: 'w-10' },
  { key: 'games', label: 'Количество игр', shortLabel: 'Игр', defaultSort: true, defaultVisible: true, widthClass: 'w-9' },
  { key: 'losses', label: 'Поражения', shortLabel: 'Пор', defaultSort: false, defaultVisible: false, widthClass: 'w-9' },
  { key: 'goalsFor', label: 'Забито голов', shortLabel: 'Зб', defaultSort: false, defaultVisible: false, widthClass: 'w-9' },
  { key: 'goalsAgainst', label: 'Пропущено голов', shortLabel: 'Пр', defaultSort: false, defaultVisible: false, widthClass: 'w-9' },
  { key: 'winRate', label: 'Процент побед', shortLabel: 'Поб%', defaultSort: false, defaultVisible: false, widthClass: 'w-11' },
  { key: 'buchholz', label: 'Бухгольц (сумма очков соперников)', shortLabel: 'BH₁', defaultSort: false, defaultVisible: false, widthClass: 'w-10' },
  { key: 'avgBuchholz', label: 'Средний Бухгольц соперников', shortLabel: 'ØBH', defaultSort: false, defaultVisible: false, widthClass: 'w-11' },
  { key: 'sonnebornBerger', label: 'Зоннеборн–Бергер', shortLabel: 'SB', defaultSort: false, defaultVisible: false, widthClass: 'w-10' },
  { key: 'name', label: 'Имя игрока', shortLabel: 'Игрок', defaultSort: false, defaultVisible: true, widthClass: 'flex-1' },
];

const META_BY_KEY = new Map<TableColumnKey, ColumnMeta>(DEFAULT_META.map((m) => [m.key, m]));

function getNormalizedConfig(raw?: TableColumnConfig[] | null): TableColumnConfig[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_META.map((m) => ({
      key: m.key,
      sort: m.defaultSort,
      visible: m.defaultVisible,
    }));
  }
  const seen = new Set<TableColumnKey>();
  const out: TableColumnConfig[] = [];
  for (const item of raw) {
    const meta = META_BY_KEY.get(item.key);
    if (!meta || seen.has(item.key)) continue;
    seen.add(item.key);
    out.push({
      key: item.key,
      sort: typeof item.sort === 'boolean' ? item.sort : meta.defaultSort,
      visible: typeof item.visible === 'boolean' ? item.visible : meta.defaultVisible,
    });
  }
  for (const meta of DEFAULT_META) {
    if (!seen.has(meta.key)) {
      out.push({ key: meta.key, sort: meta.defaultSort, visible: meta.defaultVisible });
    }
  }
  return out;
}

function renderStatCell(key: TableColumnKey, row: LeaderboardRow, isPrimary: boolean) {
  const numCls = isPrimary ? 'font-bold text-sm text-[var(--text)]' : 'text-xs text-[var(--text)] font-semibold';
  const mutedCls = isPrimary ? 'font-bold text-sm text-[var(--text)]' : 'text-xs text-[var(--muted)]';
  if (key === 'wins') return <span className={numCls}>{row.wins}</span>;
  if (key === 'ppm') return <span className={mutedCls}>{row.ppm}</span>;
  if (key === 'fairPpm') {
    const val = row.fairPpm ?? row.ppm;
    return (
      <span className={`${mutedCls} ${row.isBelowGameThreshold ? 'opacity-65' : ''}`}>
        {val}
        {row.isBelowGameThreshold ? '*' : ''}
      </span>
    );
  }
  if (key === 'points') return <span className={numCls}>{row.points}</span>;
  if (key === 'diff') {
    const diffStr = row.diff > 0 ? `+${row.diff}` : `${row.diff}`;
    return (
      <span
        className={`text-xs font-medium ${
          row.diff > 0 ? 'text-green-400' : row.diff < 0 ? 'text-red-400' : 'text-gray-400'
        }`}
      >
        {diffStr}
      </span>
    );
  }
  if (key === 'games') return <span className={mutedCls}>{row.games}</span>;
  if (key === 'losses') return <span className={mutedCls}>{row.losses ?? Math.max(0, row.games - row.wins)}</span>;
  if (key === 'goalsFor') return <span className={mutedCls}>{row.goalsFor}</span>;
  if (key === 'goalsAgainst') return <span className={mutedCls}>{row.goalsAgainst}</span>;
  if (key === 'winRate') {
    const wr = row.winRate ?? (row.games > 0 ? Math.round((row.wins / row.games) * 100) : 0);
    return <span className={mutedCls}>{wr}%</span>;
  }
  if (key === 'buchholz') return <span className={mutedCls}>{row.buchholz ?? 0}</span>;
  if (key === 'avgBuchholz') return <span className={mutedCls}>{row.avgBuchholz ?? 0}</span>;
  if (key === 'sonnebornBerger') return <span className={mutedCls}>{row.sonnebornBerger ?? 0}</span>;
  return null;
}

function formatTimeHm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const LeaderboardView: React.FC<Props> = ({ snapshot, busy = false, onSaveTableConfig, onOpenLive }) => {
  const { leaderboard, myPlayerId, tournament, isAdmin, playoffMatches } = snapshot;
  const activeConfig = getNormalizedConfig(tournament.tableConfig);
  const hasPlayoff =
    tournament.status === 'PLAYOFF' ||
    tournament.status === 'FINISHED' ||
    playoffMatches.length > 0;

  const [subTab, setSubTab] = useState<'playoff' | 'group'>(() =>
    hasPlayoff ? 'playoff' : 'group'
  );
  const [editingConfig, setEditingConfig] = useState<TableColumnConfig[] | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (hasPlayoff) {
      setSubTab('playoff');
    } else {
      setSubTab('group');
    }
  }, [tournament.id, hasPlayoff]);

  const nameVisible = activeConfig.find((c) => c.key === 'name')?.visible !== false;
  const visibleStatCols = activeConfig
    .filter((c) => c.key !== 'name' && c.visible)
    .reverse();
  const primarySortKey = activeConfig.find((c) => c.sort && c.key !== 'name')?.key || 'wins';
  const sortLabels = activeConfig
    .filter((c) => c.sort)
    .map((c) => META_BY_KEY.get(c.key)?.shortLabel)
    .filter(Boolean);

  const moveRow = (index: number, delta: number) => {
    if (!editingConfig) return;
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= editingConfig.length) return;
    const copy = [...editingConfig];
    [copy[index], copy[nextIdx]] = [copy[nextIdx], copy[index]];
    setEditingConfig(copy);
  };

  const reorderRow = (fromIdx: number, toIdx: number) => {
    if (!editingConfig || fromIdx === toIdx) return;
    if (fromIdx < 0 || fromIdx >= editingConfig.length || toIdx < 0 || toIdx >= editingConfig.length) return;
    const copy = [...editingConfig];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    setEditingConfig(copy);
  };

  const isPlayoffView = hasPlayoff && subTab === 'playoff';

  const handleShareTableImage = async () => {
    if (sharing) return;
    setSharing(true);
    haptic('light');
    try {
      const { dataUrl, base64, blob } = isPlayoffView
        ? await (await import('../utils/exportPlayoffImage')).renderPlayoffToPng(snapshot)
        : await (await import('../utils/exportTableImage')).renderLeaderboardToPng({
            snapshot,
            activeConfig,
          });

      const res = await apiClient.shareLeaderboard({
        tournamentId: tournament.id,
        imageBase64: base64,
        kind: isPlayoffView ? 'playoff' : 'standings',
      });

      const webApp = window.Telegram?.WebApp;
      if (res.preparedMessageId && webApp?.shareMessage) {
        webApp.shareMessage(res.preparedMessageId, (sent) => {
          if (sent) {
            haptic('success');
            notify(isPlayoffView ? 'Сетка плей-офф отправлена в чат Telegram' : 'Таблица отправлена в чат Telegram');
          }
        });
        return;
      }

      const file = new File([blob], `${isPlayoffView ? 'playoff' : 'table'}-${tournament.id}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: tournament.name,
        });
        return;
      }

      setPreviewDataUrl(dataUrl);
    } catch (err) {
      haptic('error');
      notify(err instanceof Error ? err.message : isPlayoffView ? 'Не удалось выгрузить сетку плей-офф' : 'Не удалось выгрузить таблицу');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto content-dock-pad">
      <div className="p-4 border-b border-[var(--border)] sticky top-0 bg-[var(--bg)] z-10">
        <div className="flex justify-between items-center gap-2">
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">
              {hasPlayoff && subTab === 'playoff' ? 'Сетка плей-офф' : 'Турнирная таблица'}
            </h2>
            {(!hasPlayoff || subTab === 'group') && sortLabels.length > 0 && (
              <div className="text-[10px] text-gray-500 mt-0.5 truncate">
                Приоритет: {sortLabels.join(' → ')}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {tournament.publicPath && (
              <button
                type="button"
                onClick={() => {
                  haptic('light');
                  if (onOpenLive) {
                    onOpenLive(tournament.publicPath!);
                    return;
                  }
                  window.open(buildPublicLiveUrl(tournament.publicPath!), '_blank', 'noopener,noreferrer');
                }}
                className="px-2.5 py-1.5 rounded-full bg-green-500/15 border border-green-500/35 text-green-400 text-xs font-bold flex items-center gap-1 active:scale-95"
                title="Открыть Live-трансляцию"
              >
                <Radio size={13} className="animate-pulse" />
                LIVE
              </button>
            )}
            <button
              type="button"
              disabled={sharing}
              onClick={handleShareTableImage}
              className="px-2.5 py-1.5 rounded-full bg-[#2ea6ff]/15 border border-[#2ea6ff]/30 text-[#2ea6ff] text-xs font-bold flex items-center gap-1 active:scale-95 disabled:opacity-50"
              title={isPlayoffView ? 'Поделиться сеткой плей-офф как фото' : 'Поделиться полной таблицей как фото'}
            >
              <Share2 size={14} />
              {sharing ? '...' : 'Поделиться'}
            </button>
            {(!hasPlayoff || subTab === 'group') && (
              <>
                <span className="text-xs text-gray-400 bg-[#2c2c2e] px-2.5 py-1 rounded-full border border-[#3a3a3c]">
                  Топ-{tournament.playoffSize}
                </span>
                {isAdmin && onSaveTableConfig && (
                  <button
                    type="button"
                    onClick={() => setEditingConfig(activeConfig)}
                    className="p-1.5 rounded-full bg-[#2c2c2e] border border-[#3a3a3c] text-gray-300 hover:text-white active:scale-95"
                    title="Настроить таблицу"
                  >
                    <SlidersHorizontal size={16} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Playoff / Group sub-tabs when playoff has started */}
        {hasPlayoff && (
          <div className="grid grid-cols-2 gap-1 bg-[#2c2c2e] border border-[#3a3a3c] p-1 rounded-xl mt-3">
            <button
              type="button"
              onClick={() => setSubTab('playoff')}
              className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                subTab === 'playoff'
                  ? 'bg-[#2ea6ff] text-white shadow-sm'
                  : 'text-gray-400'
              }`}
            >
              Плей-офф
            </button>
            <button
              type="button"
              onClick={() => setSubTab('group')}
              className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                subTab === 'group'
                  ? 'bg-[#2ea6ff] text-white shadow-sm'
                  : 'text-gray-400'
              }`}
            >
              Групповая
            </button>
          </div>
        )}

        {(!hasPlayoff || subTab === 'group') && (
          <div className="flex text-[11px] font-bold text-gray-500 mt-3 uppercase tracking-wider px-2">
            <div className="w-7 text-center">#</div>
            <div className="flex-1">{nameVisible ? 'Игрок' : ''}</div>
            {visibleStatCols.map((col) => {
              const meta = META_BY_KEY.get(col.key);
              return (
                <div key={col.key} className={`${meta?.widthClass || 'w-10'} text-center`}>
                  {meta?.shortLabel}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {hasPlayoff && subTab === 'playoff' ? (
        <PlayoffBracketView
          matches={playoffMatches}
          playoffSize={tournament.playoffSize}
          thirdPlaceMatch={tournament.thirdPlaceMatch}
          myPlayerId={myPlayerId}
        />
      ) : (
        <div className="p-2 space-y-1">
          {leaderboard.map((row) => {
            const isMe = row.playerId === myPlayerId;
            const inPlayoffZone = row.rank <= tournament.playoffSize;

            return (
              <div
                key={row.playerId}
                className={`flex items-center px-2 py-3 rounded-xl border ${
                  isMe
                    ? 'bg-[#2ea6ff]/10 border-[#2ea6ff]/30'
                    : inPlayoffZone
                      ? 'bg-[#2c2c2e]/50 border-transparent'
                      : 'border-transparent opacity-80'
                }`}
              >
                <div
                  className={`w-7 text-center font-bold text-sm ${
                    row.rank <= 3
                      ? 'text-yellow-500'
                      : inPlayoffZone
                        ? 'text-gray-200'
                        : 'text-gray-500'
                  }`}
                >
                  {row.rank}
                </div>
                <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
                  <PlayerAvatar
                    avatarUrl={row.avatarUrl}
                    initials={row.initials}
                    name={row.name}
                    isMe={isMe}
                    size="sm"
                  />
                  {nameVisible && (
                    <div className="min-w-0">
                      <div
                        className={`font-medium text-sm truncate flex items-center gap-1 ${
                          isMe ? 'text-[#2ea6ff] font-bold' : 'text-white'
                        }`}
                      >
                        <span className="truncate">{row.name} {isMe ? '(Вы)' : ''}</span>
                        {tournament.useBuckets && row.dypRole && (
                          <span
                            className={`text-[9px] font-black px-1 py-0.5 rounded shrink-0 ${
                              row.dypRole === 'A'
                                ? 'bg-[#2ea6ff]/20 text-[#2ea6ff]'
                                : 'bg-[#96f84d]/20 text-[#96f84d]'
                            }`}
                          >
                            {row.dypRole}
                          </span>
                        )}
                      </div>
                      {!row.isActive && (
                        <span className="text-[10px] text-gray-500">На паузе</span>
                      )}
                    </div>
                  )}
                </div>
                {visibleStatCols.map((col) => {
                  const meta = META_BY_KEY.get(col.key);
                  return (
                    <div key={col.key} className={`${meta?.widthClass || 'w-10'} text-center`}>
                      {renderStatCell(col.key, row, col.key === primarySortKey)}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {leaderboard.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-12">
              Пока нет участников
            </div>
          )}

          {leaderboard.some((r) => r.isBelowGameThreshold) &&
            visibleStatCols.some((c) => c.key === 'fairPpm') && (
              <div className="text-[11px] text-gray-400 px-2 pt-1">
                * Сыграно меньше 75% матчей — среднее очко уменьшено пропорционально порогу.
              </div>
            )}

          {snapshot.timings && (snapshot.timings.totalCount > 0 || snapshot.timings.elapsedMinutes > 0) && (
            <div className="mt-3 bg-[#2c2c2e] border border-[#3a3a3c] rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-gray-300">
                <span className="flex items-center gap-1.5">
                  <Clock size={14} className="text-[#2ea6ff]" /> Тайминги турнира
                </span>
                <span className="text-[#2ea6ff]">{snapshot.timings.progressPercent}%</span>
              </div>
              <div className="w-full bg-[#1c1c1d] h-1.5 rounded-full overflow-hidden border border-[#3a3a3c]">
                <div
                  className="bg-[#2ea6ff] h-full transition-all duration-500"
                  style={{ width: `${snapshot.timings.progressPercent}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-400 pt-0.5">
                <div>
                  Прошло: <strong className="text-white">{snapshot.timings.elapsedMinutes} мин</strong>
                </div>
                <div>
                  Матчей: <strong className="text-white">{snapshot.timings.playedCount}/{snapshot.timings.totalCount}</strong>
                </div>
                <div>
                  Средний матч:{' '}
                  <strong className="text-white">
                    {snapshot.timings.avgMatchMinutes !== null
                      ? `~${snapshot.timings.avgMatchMinutes} мин`
                      : '—'}
                  </strong>
                </div>
                <div>
                  {tournament.status === 'FINISHED' ? 'Завершён' : 'Окончание раунда'}:{' '}
                  <strong className="text-white">
                    {snapshot.timings.estimatedEndAt
                      ? formatTimeHm(snapshot.timings.estimatedEndAt)
                      : '—'}
                  </strong>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table / playoff image preview fallback modal */}
      {previewDataUrl && (
        <Modal
          title={isPlayoffView ? 'Фото плей-офф' : 'Фото таблицы'}
          onClose={() => setPreviewDataUrl(null)}
          closeLabel="Закрыть"
          footer={
            <a
              href={previewDataUrl}
              download={`${isPlayoffView ? 'playoff' : 'table'}-${tournament.id}.png`}
              className="btn btn-primary w-full py-3"
            >
              <Download size={16} /> Скачать фото
            </a>
          }
        >
          <div className="space-y-2">
            <p className="text-xs text-[var(--muted)]">
              Разрешите боту @kickerpickerbot отправку сообщений, чтобы сразу отправлять фото в Telegram, или сохраните картинку ниже.
            </p>
            <img
              src={previewDataUrl}
              alt={isPlayoffView ? 'Сетка плей-офф' : 'Турнирная таблица'}
              className="w-full rounded-2xl border border-[var(--border-strong)]"
            />
          </div>
        </Modal>
      )}

      {/* Table config modal (gym-gym Modal) */}
      {editingConfig && onSaveTableConfig && (
        <Modal
          title="Настройки таблицы"
          onClose={() => setEditingConfig(null)}
          hideClose
          footer={
            <div className="btn-row">
              <button
                type="button"
                onClick={() => setEditingConfig(getNormalizedConfig(null))}
                className="btn btn-ghost"
              >
                По умолчанию
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const payload = editingConfig;
                  setEditingConfig(null);
                  await onSaveTableConfig(payload);
                }}
                className="btn btn-primary"
              >
                Сохранить
              </button>
            </div>
          }
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[var(--muted)] pb-1">
              <span>Перетаскивайте за ручку (⋮⋮) для изменения приоритета</span>
              <TieBreakersTooltip />
            </div>
            {editingConfig.map((col, idx) => {
              const meta = META_BY_KEY.get(col.key);
              const isDragging = dragIndex === idx;
              const isDropTarget = dragOverIndex === idx && dragIndex !== null && dragIndex !== idx;
              return (
                <div
                  key={col.key}
                  data-col-idx={idx}
                  data-testid={`col-row-${col.key}`}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(idx);
                    setDragOverIndex(idx);
                    e.dataTransfer?.setData('text/plain', String(idx));
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverIndex !== idx) setDragOverIndex(idx);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromRaw = e.dataTransfer?.getData('text/plain');
                    const fromIdx = dragIndex ?? (fromRaw !== undefined && fromRaw !== '' ? Number(fromRaw) : idx);
                    reorderRow(fromIdx, idx);
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={`flex items-center justify-between bg-[var(--bg)] border rounded-2xl px-2.5 py-2 transition-all ${
                    isDragging
                      ? 'opacity-50 border-[#2ea6ff]'
                      : isDropTarget
                        ? 'border-[#2ea6ff] bg-[#2ea6ff]/10'
                        : 'border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <button
                      type="button"
                      data-testid={`col-drag-handle-${col.key}`}
                      aria-label={`Перетащить ${meta?.label}`}
                      onPointerDown={(e) => {
                        setDragIndex(idx);
                        setDragOverIndex(idx);
                        const startTarget = e.currentTarget;
                        if (startTarget.setPointerCapture) {
                          try {
                            startTarget.setPointerCapture(e.pointerId);
                          } catch {}
                        }
                      }}
                      onPointerMove={(e) => {
                        if (dragIndex === null) return;
                        const el = document.elementFromPoint(e.clientX, e.clientY);
                        const rowEl = el?.closest?.('[data-col-idx]') as HTMLElement | null;
                        if (rowEl?.dataset?.colIdx !== undefined) {
                          const targetIdx = Number(rowEl.dataset.colIdx);
                          if (Number.isInteger(targetIdx) && targetIdx !== dragIndex) {
                            reorderRow(dragIndex, targetIdx);
                            setDragIndex(targetIdx);
                            setDragOverIndex(targetIdx);
                          }
                        }
                      }}
                      onPointerUp={() => {
                        setDragIndex(null);
                        setDragOverIndex(null);
                      }}
                      onPointerCancel={() => {
                        setDragIndex(null);
                        setDragOverIndex(null);
                      }}
                      className="p-1.5 rounded-xl text-[var(--muted)] hover:text-[var(--text)] cursor-grab active:cursor-grabbing touch-none shrink-0"
                      title="Перетащите для смены порядка"
                    >
                      <GripVertical size={16} />
                    </button>
                    <span className="text-xs sm:text-sm font-medium text-[var(--text)] truncate">
                      {meta?.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingConfig((prev) =>
                          prev ? prev.map((c, i) => (i === idx ? { ...c, sort: !c.sort } : c)) : prev
                        )
                      }
                      className={`p-1.5 rounded-xl transition-colors ${
                        col.sort ? 'text-[#2ea6ff] bg-[#2ea6ff]/15' : 'text-[var(--muted)] opacity-50'
                      }`}
                      title="Учитывать в сортировке"
                    >
                      <Power size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingConfig((prev) =>
                          prev ? prev.map((c, i) => (i === idx ? { ...c, visible: !c.visible } : c)) : prev
                        )
                      }
                      className={`p-1.5 rounded-xl transition-colors ${
                        col.visible ? 'text-[var(--text)] bg-[var(--card)]' : 'text-[var(--muted)] opacity-50'
                      }`}
                      title="Показывать столбец"
                    >
                      {col.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveRow(idx, -1)}
                        className="text-[var(--muted)] disabled:opacity-25 p-0.5"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={idx === editingConfig.length - 1}
                        onClick={() => moveRow(idx, 1)}
                        className="text-[var(--muted)] disabled:opacity-25 p-0.5"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
};
