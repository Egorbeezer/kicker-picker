import React from 'react';
import { Clock, CheckCircle, Ban } from 'lucide-react';
import type { MatchItem } from '../types';
import { PlayerAvatar } from './PlayerAvatar';

function toEpochMs(v?: string | number | null): number | null {
  if (!v) return null;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const parsed = Date.parse(v);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDurationBadge(match: MatchItem): string | null {
  if (match.status !== 'FINISHED') return null;
  const start = toEpochMs(match.createdAt);
  const end = toEpochMs(match.finishedAt);
  if (!start || !end || end <= start) return null;
  const sec = Math.round((end - start) / 1000);
  if (sec <= 0 || sec > 7200) return null;
  if (sec < 60) return `${sec}с`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem >= 10 ? `${min}м` : `${min} мин`;
}

interface Props {
  match: MatchItem;
  myPlayerId?: number | null;
  onClick?: () => void;
  longMatchThresholdMin?: number;
  inlineFooter?: React.ReactNode;
}

function getElapsedPlayingMin(match: MatchItem): number {
  if (match.status !== 'PLAYING' || !match.createdAt) return 0;
  const ms = toEpochMs(match.createdAt);
  if (!ms) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 60000));
}

export function formatBracketSlotLabel(slot: string | null): string | null {
  if (!slot) return null;
  if (slot === 'FINAL') return 'Финал';
  if (slot === 'THIRD_PLACE') return 'За 3-е место';
  if (slot.startsWith('R32_')) return `1/16 финала ${slot.slice(4)}`;
  if (slot.startsWith('EF')) return `1/8 финала ${slot.slice(2)}`;
  if (slot.startsWith('QF')) return `Четвертьфинал ${slot.slice(2)}`;
  if (slot.startsWith('SF')) return `Полуфинал ${slot.slice(2)}`;
  return slot;
}

export const MatchCard: React.FC<Props> = ({
  match,
  myPlayerId = null,
  onClick,
  longMatchThresholdMin = 15,
  inlineFooter,
}) => {
  const isWaiting = match.status === 'WAITING_CONFIRM';
  const waitingFromLabel =
    match.submittedByTeam === 1 ? match.team2Label : match.team1Label;
  const isMyMatch = match.myTeam != null;
  const slotLabel = formatBracketSlotLabel(match.bracketSlot);
  const durationLabel = formatDurationBadge(match);
  const elapsedMin = getElapsedPlayingMin(match);
  const isLongMatch = match.status === 'PLAYING' && elapsedMin >= longMatchThresholdMin;

  const hasSets =
    match.stage === 'PLAYOFF' &&
    (match.setsWon1 > 0 || match.setsWon2 > 0);

  const interactiveProps = onClick
    ? {
        onClick,
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};

  return (
    <div
      className={`p-3.5 rounded-[22px] relative overflow-hidden bg-[var(--card)] ${
        match.status === 'CANCELLED'
          ? 'opacity-60'
          : isMyMatch
            ? 'ring-1 ring-[var(--accent-text)]/35'
            : ''
      } ${onClick ? 'transition-transform active:scale-[0.98]' : ''}`}
    >
      <div {...interactiveProps} className={onClick ? 'cursor-pointer' : undefined}>
        <div className="flex justify-between items-center gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="font-bold text-[11px] bg-[var(--bg)] px-2.5 py-1 rounded-full text-[var(--text)]">
            Стол {match.tableNumber}
          </span>
          {slotLabel && (
            <span className="text-[11px] font-bold text-amber-500 bg-amber-500/15 px-2.5 py-0.5 rounded-full">
              {slotLabel}
            </span>
          )}
          {isMyMatch && (
            <span className="text-[10px] font-bold text-[var(--accent-text)] bg-[var(--accent-soft)] px-2.5 py-0.5 rounded-full">
              Ваш матч
            </span>
          )}
        </div>

        {match.status === 'PLAYING' && (
          <div className="flex items-center gap-1.5 shrink-0">
            {isLongMatch && (
              <span className="text-amber-500 bg-amber-500/15 px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1">
                <Clock size={10} /> {elapsedMin}м
              </span>
            )}
            <span className="text-amber-500 bg-amber-500/15 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 shrink-0">
              <Clock size={12} /> В игре
            </span>
          </div>
        )}
        {match.status === 'WAITING_CONFIRM' && (
          <span className="text-[var(--accent-text)] bg-[var(--accent-soft)] px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 shrink-0">
            <Clock size={12} /> Ждёт подтв.
          </span>
        )}
        {match.status === 'FINISHED' && (
          <div className="flex items-center gap-1.5 shrink-0">
            {durationLabel && (
              <span className="text-[10px] font-semibold text-[var(--muted)] bg-[var(--bg)] px-2 py-0.5 rounded-full">
                {durationLabel}
              </span>
            )}
            <span className="text-[var(--ok)] bg-[var(--ok-soft)] px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1">
              <CheckCircle size={12} /> Завершён
            </span>
          </div>
        )}
        {match.status === 'CANCELLED' && (
          <span className="text-[var(--muted)] bg-[var(--bg-3)] px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 shrink-0">
            <Ban size={12} /> Отменён
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        {/* Team 1 */}
        <div className="flex-1 flex flex-col items-start gap-1 min-w-0">
          <div className="flex -space-x-1.5">
            {match.team1Players.map((p) => (
              <PlayerAvatar
                key={p.id}
                avatarUrl={p.avatarUrl}
                initials={p.initials}
                name={p.name}
                isMe={p.id === myPlayerId}
                size="sm"
              />
            ))}
          </div>
          <div
            className={`text-xs leading-tight line-clamp-2 ${
              match.myTeam === 1 ? 'font-bold text-[var(--accent-text)]' : 'font-medium text-[var(--text)]'
            }`}
          >
            {match.team1Label}
          </div>
        </div>

        {/* Center score / VS */}
        <div className="px-2 text-center shrink-0">
          {match.status === 'CANCELLED' ? (
            <div className="font-bold text-xs text-[var(--muted)] uppercase">Отменён</div>
          ) : match.status !== 'PLAYING' ? (
            <div className="font-bold text-xl text-[var(--text)] tracking-tight tabular-nums">
              {match.score1} : {match.score2}
            </div>
          ) : (
            <div className="font-semibold text-sm text-[var(--muted)]">VS</div>
          )}
          {hasSets && (
            <div className="text-[10px] font-bold text-amber-500 mt-0.5">
              Сеты {match.setsWon1}:{match.setsWon2}
            </div>
          )}
        </div>

        {/* Team 2 */}
        <div className="flex-1 flex flex-col items-end gap-1 min-w-0 text-right">
          <div className="flex -space-x-1.5">
            {match.team2Players.map((p) => (
              <PlayerAvatar
                key={p.id}
                avatarUrl={p.avatarUrl}
                initials={p.initials}
                name={p.name}
                isMe={p.id === myPlayerId}
                size="sm"
              />
            ))}
          </div>
          <div
            className={`text-xs leading-tight line-clamp-2 ${
              match.myTeam === 2 ? 'font-bold text-[var(--accent-text)]' : 'font-medium text-[var(--text)]'
            }`}
          >
            {match.team2Label}
          </div>
        </div>
      </div>

      {isWaiting && (
        <div className="mt-2.5 bg-[var(--accent-soft)] rounded-2xl px-3 py-1.5 text-[11px] text-[var(--accent-text)] font-medium">
          Ожидается подтверждение от: <span className="font-bold">{waitingFromLabel}</span>
        </div>
      )}
      </div>

      {inlineFooter && (
        <div
          className="mt-2.5 pt-2.5 border-t border-[var(--border)]"
        >
          {inlineFooter}
        </div>
      )}
    </div>
  );
};
