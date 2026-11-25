import React, { useState, useEffect } from 'react';
import { SlidersHorizontal, Clock, Share2, Radio, ExternalLink } from 'lucide-react';
import type { LeaderboardRow, TableColumnConfig, TableColumnKey, TournamentSnapshot } from '../types';
import { buildPublicLiveUrl } from '../api/client';
import { haptic, notify } from '../utils/telegram';
import { formatTimeHm } from '../utils/date';
import { renderLeaderboardToPng } from '../utils/exportTableImage';
import { getPlayoffQualifiedIds } from '../utils/playoffZone';
import { renderPlayoffToPng } from '../utils/exportPlayoffImage';
import { shareImageFile, shareLiveUrlInTelegram } from '../utils/share';
import { Modal } from './Modal';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayoffBracketView } from './PlayoffBracketView';
import { ScreenshotIcon } from './ScreenshotIcon';
import { TableConfigModal, type TableColumnMeta } from './TableConfigModal';

interface Props {
  snapshot: TournamentSnapshot;
  busy?: boolean;
  onSaveTableConfig?: (config: TableColumnConfig[]) => Promise<void>;
}

const DEFAULT_META: TableColumnMeta[] = [
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

const META_BY_KEY = new Map<TableColumnKey, TableColumnMeta>(DEFAULT_META.map((m) => [m.key, m]));

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

export const LeaderboardView: React.FC<Props> = ({ snapshot, busy = false, onSaveTableConfig }) => {
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
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sendingPreview, setSendingPreview] = useState(false);
  const [previewImage, setPreviewImage] = useState<{
    dataUrl: string;
    base64: string;
    shareBase64?: string;
    blob: Blob;
  } | null>(null);

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

  const isPlayoffView = hasPlayoff && subTab === 'playoff';

  const handleShareTableImage = async () => {
    if (sharing) return;
    setSharing(true);
    haptic('light');
    try {
      const rendered = isPlayoffView
        ? await renderPlayoffToPng(snapshot)
        : await renderLeaderboardToPng({
            snapshot,
            activeConfig,
          });
      setPreviewImage(rendered);
    } catch (err) {
      haptic('error');
      notify(err instanceof Error ? err.message : isPlayoffView ? 'Не удалось выгрузить сетку плей-офф' : 'Не удалось выгрузить таблицу');
    } finally {
      setSharing(false);
    }
  };

  const handleSendPreviewImage = async () => {
    if (!previewImage || sendingPreview) return;
    setSendingPreview(true);
    haptic('light');
    try {
      const filename = `${isPlayoffView ? 'playoff' : 'table'}-${tournament.id}.png`;
      const title = isPlayoffView ? `${tournament.name}: плей-офф` : `${tournament.name}: таблица`;
      const outcome = await shareImageFile({
        blob: previewImage.blob,
        filename,
        title,
      });
      if (outcome === 'shared') {
        haptic('success');
        notify(isPlayoffView ? 'Сетка плей-офф готова к отправке' : 'Таблица готова к отправке');
      } else if (outcome === 'copied') {
        haptic('success');
        notify('Скриншот скопирован, вставьте его в любой чат');
      } else if (outcome === 'downloaded') {
        haptic('success');
        notify('Скриншот сохранён, отправьте его в нужный чат');
      } else if (outcome === 'unsupported') {
        notify('На этом устройстве недоступен быстрый экспорт файла');
      }
    } catch (err) {
      haptic('error');
      notify(err instanceof Error ? err.message : 'Не удалось поделиться фото');
    } finally {
      setSendingPreview(false);
    }
  };

  const qualifiedIds = getPlayoffQualifiedIds(leaderboard, tournament.playoffSize);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="shrink-0 p-4 border-b border-[var(--border)] bg-[var(--bg)] z-10">
        <div className="flex justify-between items-center gap-2">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight text-[var(--text)] truncate">
              {hasPlayoff && subTab === 'playoff' ? 'Сетка плей-офф' : 'Турнирная таблица'}
            </h2>
            {(!hasPlayoff || subTab === 'group') && sortLabels.length > 0 && (
              <div className="text-[11px] text-[var(--muted)] mt-0.5 truncate">
                Приоритет: {sortLabels.join(' → ')}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {tournament.publicPath && (
              <button
                type="button"
                data-testid="leaderboard-live-btn"
                onClick={() => {
                  haptic('light');
                  setShowLiveModal(true);
                }}
                aria-label="Live-трансляция"
                title="Live-трансляция"
                className="h-9 px-2.5 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-xs font-bold inline-flex items-center gap-1 active:scale-95 transition-transform"
              >
                <Radio size={14} />
                <span>LIVE</span>
              </button>
            )}
            <button
              type="button"
              data-testid="share-table-screenshot-btn"
              disabled={sharing}
              onClick={handleShareTableImage}
              aria-label={
                isPlayoffView
                  ? 'Поделиться скриншотом сетки плей-офф'
                  : 'Поделиться скриншотом таблицы'
              }
              title={
                isPlayoffView
                  ? 'Поделиться сеткой плей-офф как фото'
                  : 'Поделиться полной таблицей как фото'
              }
              className="w-9 h-9 rounded-full bg-[var(--card)] flex items-center justify-center active:scale-95 disabled:opacity-50 transition-opacity"
            >
              {sharing ? (
                <span className="loading loading-spinner loading-xs text-[var(--accent-text)]" />
              ) : (
                <ScreenshotIcon size={20} />
              )}
            </button>
            {(!hasPlayoff || subTab === 'group') && (
              <>
                <span className="text-xs font-bold text-[var(--text)] bg-[var(--card)] px-3 py-1.5 rounded-full">
                  Топ-{tournament.playoffSize}
                </span>
                {isAdmin && onSaveTableConfig && (
                  <button
                    type="button"
                    onClick={() => setEditingConfig(activeConfig)}
                    className="w-9 h-9 rounded-full bg-[var(--card)] text-[var(--text)] flex items-center justify-center active:scale-95"
                    title="Настроить таблицу"
                    aria-label="Настроить таблицу"
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
          <div className="grid grid-cols-2 gap-1 bg-[var(--card)] p-1 rounded-full mt-3">
            <button
              type="button"
              onClick={() => setSubTab('playoff')}
              className={`py-2 rounded-full text-xs font-bold transition-colors ${
                subTab === 'playoff'
                  ? 'bg-[var(--bg)] text-[var(--text)] shadow-sm'
                  : 'text-[var(--muted)]'
              }`}
            >
              Плей-офф
            </button>
            <button
              type="button"
              onClick={() => setSubTab('group')}
              className={`py-2 rounded-full text-xs font-bold transition-colors ${
                subTab === 'group'
                  ? 'bg-[var(--bg)] text-[var(--text)] shadow-sm'
                  : 'text-[var(--muted)]'
              }`}
            >
              Групповая
            </button>
          </div>
        )}

        {(!hasPlayoff || subTab === 'group') && (
          <div className="flex text-[11px] font-bold text-[var(--muted)] mt-3 uppercase tracking-wider px-2">
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

      <div
        data-testid="leaderboard-scroll"
        className="flex-1 min-h-0 overflow-y-auto content-dock-pad"
      >
        {hasPlayoff && subTab === 'playoff' ? (
          <PlayoffBracketView
            matches={playoffMatches}
            playoffSize={tournament.playoffSize}
            thirdPlaceMatch={tournament.thirdPlaceMatch}
            myPlayerId={myPlayerId}
          />
        ) : (
          <>
            <div className="mx-3 my-2.5 bg-[var(--card)] rounded-[24px] overflow-hidden divide-y divide-[var(--border)]">
              {leaderboard.map((row) => {
                const isMe = row.playerId === myPlayerId;
                const inPlayoffZone = qualifiedIds.has(row.playerId);

                return (
                  <div
                    key={row.playerId}
                    data-testid="leaderboard-row"
                    className={`flex items-center px-3 py-3 border-l-4 ${
                      inPlayoffZone ? 'border-l-[var(--accent)]' : 'border-l-transparent'
                    } ${
                      !row.isActive
                        ? 'bg-gray-500/20 opacity-65'
                        : isMe
                          ? 'bg-[var(--accent-soft)]'
                          : ''
                    }`}
                  >
                    <div
                      className={`w-7 text-center font-bold text-sm tabular-nums ${
                        row.rank <= 3
                          ? 'text-[var(--accent-text)]'
                          : inPlayoffZone
                            ? 'text-[var(--text)]'
                            : 'text-[var(--muted)]'
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
                            className={`font-semibold text-sm truncate flex items-center gap-1 ${
                              isMe ? 'text-[var(--accent-text)] font-bold' : 'text-[var(--text)]'
                            }`}
                          >
                            <span className="truncate">{row.name} {isMe ? '(Вы)' : ''}</span>
                            {tournament.useBuckets && row.dypRole && (
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                                  row.dypRole === 'A'
                                    ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                                    : 'bg-[var(--bg)] text-[var(--muted)]'
                                }`}
                              >
                                {row.dypRole}
                              </span>
                            )}
                          </div>
                          {!row.isActive && (
                            <span className="text-[10px] font-medium text-[var(--muted)]">Отсутствует</span>
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
                <div className="text-center text-[var(--muted)] text-sm py-12">
                  Пока нет участников
                </div>
              )}
            </div>

            {leaderboard.some((r) => r.isBelowGameThreshold) &&
              visibleStatCols.some((c) => c.key === 'fairPpm') && (
                <div className="text-[11px] text-[var(--muted)] px-4 pt-1">
                  * Сыграно меньше 75% матчей: среднее очко уменьшено пропорционально порогу.
                </div>
              )}

            {snapshot.timings && (snapshot.timings.totalCount > 0 || snapshot.timings.elapsedMinutes > 0) && (
              <div className="mx-3 mt-3 mb-2 bg-[var(--card)] rounded-[24px] p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--text)]">
                  <span className="flex items-center gap-1.5">
                    <Clock size={14} className="text-[var(--accent-text)]" /> Тайминги турнира
                  </span>
                  <span className="text-[var(--accent-text)]">{snapshot.timings.progressPercent}%</span>
                </div>
                <div className="w-full bg-[var(--bg-3)] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[var(--accent-text)] h-full transition-[width] duration-500 ease-out"
                    style={{ width: `${snapshot.timings.progressPercent}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--muted)] pt-0.5">
                  <div>
                    Прошло: <strong className="text-[var(--text)]">{snapshot.timings.elapsedMinutes} мин</strong>
                  </div>
                  <div>
                    Матчей: <strong className="text-[var(--text)]">{snapshot.timings.playedCount}/{snapshot.timings.totalCount}</strong>
                  </div>
                  <div>
                    Средний матч:{' '}
                    <strong className="text-[var(--text)]">
                      {snapshot.timings.avgMatchMinutes !== null
                        ? `~${snapshot.timings.avgMatchMinutes} мин`
                        : '—'}
                    </strong>
                  </div>
                  <div>
                    {tournament.status === 'FINISHED' ? 'Завершён' : 'Окончание раунда'}:{' '}
                    <strong className="text-[var(--text)]">
                      {snapshot.timings.estimatedEndAt
                        ? formatTimeHm(snapshot.timings.estimatedEndAt)
                        : '—'}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Live-трансляция для игрока */}
      {showLiveModal && tournament.publicPath && (
        <Modal
          title="Live-трансляция"
          onClose={() => setShowLiveModal(false)}
          closeLabel="Закрыть"
        >
          <div className="space-y-3">
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              Публичное табло с таблицей, матчами и сеткой для браузера и ТВ.
            </p>
            <button
              type="button"
              onClick={() => {
                haptic('light');
                const liveUrl = buildPublicLiveUrl(tournament.publicPath!);
                const tgWebApp = window.Telegram?.WebApp as
                  | { openLink?: (url: string) => void }
                  | undefined;
                if (tgWebApp?.openLink) {
                  tgWebApp.openLink(liveUrl);
                } else {
                  window.open(liveUrl, '_blank', 'noopener,noreferrer');
                }
              }}
              className="btn btn-primary w-full py-3"
            >
              <ExternalLink size={16} />
              Открыть в браузере
            </button>
            <button
              type="button"
              onClick={() => {
                haptic('light');
                shareLiveUrlInTelegram({
                  name: tournament.name,
                  publicPath: tournament.publicPath!,
                });
              }}
              className="w-full py-3 rounded-full bg-[var(--card)] text-[var(--text)] font-bold text-sm inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Share2 size={16} />
              Поделиться ссылкой
            </button>
          </div>
        </Modal>
      )}

      {/* Table / playoff image preview modal */}
      {previewImage && (
        <Modal
          title={isPlayoffView ? 'Фото плей-офф' : 'Фото таблицы'}
          onClose={() => {
            setPreviewImage(null);
          }}
          closeLabel="Закрыть"
          footer={
            <button
              type="button"
              disabled={sendingPreview}
              onClick={handleSendPreviewImage}
              className="btn btn-primary w-full py-3"
            >
              {sendingPreview ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Share2 size={16} />
              )}
              {sendingPreview ? 'Отправка...' : 'Поделиться'}
            </button>
          }
        >
          <div className="space-y-2">
            <img
              src={previewImage.dataUrl}
              alt={isPlayoffView ? 'Сетка плей-офф' : 'Турнирная таблица'}
              className="w-full rounded-2xl border border-[var(--border-strong)]"
            />
          </div>
        </Modal>
      )}

      {/* Table config modal */}
      {editingConfig && onSaveTableConfig && (
        <TableConfigModal
          config={editingConfig}
          metaByKey={META_BY_KEY}
          busy={busy}
          onChange={setEditingConfig}
          onResetDefault={() => setEditingConfig(getNormalizedConfig(null))}
          onSave={async (payload) => {
            setEditingConfig(null);
            await onSaveTableConfig(payload);
          }}
          onClose={() => setEditingConfig(null)}
        />
      )}
    </div>
  );
};
