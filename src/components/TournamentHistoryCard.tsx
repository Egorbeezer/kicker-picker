import React from 'react';
import { Calendar, ChevronRight, Loader2, Radio, Trophy, Users } from 'lucide-react';
import type { TournamentHistoryItem } from '../types';
import { formatDateRu } from '../utils/date';
import { haptic } from '../utils/telegram';

const STATUS_META: Record<string, { label: string; badgeCls: string }> = {
  REGISTRATION: {
    label: 'Регистрация',
    badgeCls: 'bg-[var(--accent)] text-[var(--on-accent)]',
  },
  QUALIFICATION: {
    label: 'Квалификация',
    badgeCls: 'bg-[var(--accent)] text-[var(--on-accent)]',
  },
  PLAYOFF: {
    label: 'Плей-офф',
    badgeCls: 'bg-[var(--accent-soft)] text-[var(--accent-text)]',
  },
  FINISHED: {
    label: 'Завершён',
    badgeCls: 'bg-[var(--bg-3)] text-[var(--muted)]',
  },
};

const MODE_LABELS: Record<string, string> = {
  monster: 'Monster DYP',
  classic: 'Classic DYP',
  random_dyp: 'Random DYP',
  swiss: 'Швейцарка',
  round_robin: 'Круговой',
  last_one_standing: 'Last One Standing',
  whist: 'Whist',
  elimination: 'Плей-офф',
};

function formatTournamentDate(item: TournamentHistoryItem): string {
  const raw = item.finishedAt || item.startedAt || item.createdAt;
  if (!raw) return '';
  return formatDateRu(raw);
}

interface Props {
  item: TournamentHistoryItem;
  isCurrent?: boolean;
  loading?: boolean;
  variant?: 'card' | 'row';
  onClick: () => void;
}

/**
 * Единая карточка/строка турнира в стиле Wise iOS для Главного экрана и Профиля.
 */
export const TournamentHistoryCard: React.FC<Props> = ({
  item,
  isCurrent = false,
  loading = false,
  variant = 'card',
  onClick,
}) => {
  const meta = STATUS_META[item.status] || STATUS_META.REGISTRATION;
  const dateLabel = formatTournamentDate(item);
  const modeTitle = MODE_LABELS[item.dypMode || 'monster'] || 'DYP';

  if (variant === 'row') {
    return (
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          haptic('light');
          onClick();
        }}
        className="w-full text-left py-3 px-1 flex items-center justify-between gap-3 active:opacity-75 transition-opacity disabled:opacity-60"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[var(--card)] flex items-center justify-center text-xs font-bold text-[var(--text)] shrink-0">
            {item.myStats ? `#${item.myStats.rank}` : <Trophy size={16} className="text-[var(--muted)]" />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-[var(--text)] truncate">{item.name}</div>
            <div className="text-xs text-[var(--muted)] truncate mt-0.5">
              {[dateLabel, modeTitle].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {item.myStats ? (
            <div className="text-right">
              <div className="text-xs font-bold text-[var(--text)] tabular-nums">
                {item.myStats.wins}/{item.myStats.games} поб.
              </div>
              <div className="text-[11px] font-semibold text-[var(--accent-text)] tabular-nums">
                {item.myStats.ppm} ср.
              </div>
            </div>
          ) : (
            <span className="text-xs text-[var(--muted)]">Организатор</span>
          )}
          {loading ? (
            <Loader2 size={14} className="animate-spin text-[var(--accent-text)]" />
          ) : (
            <ChevronRight size={15} className="text-[var(--muted)]" />
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => {
        haptic('light');
        onClick();
      }}
      className={`w-full text-left bg-[var(--card)] rounded-[24px] p-4 transition-colors duration-150 ease-out active:scale-[0.985] space-y-3 disabled:opacity-75 ${
        isCurrent ? 'ring-1 ring-[var(--accent-text)]/40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-base text-[var(--text)] truncate">{item.name}</div>
          <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-xs text-[var(--muted)] mt-1">
            {dateLabel && (
              <span className="inline-flex items-center gap-1">
                <Calendar size={11} />
                {dateLabel}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Users size={11} />
              {item.participantsCount}
            </span>
            <span>
              {modeTitle}
              {item.teamFormat === 'single' ? ' 1×1' : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {item.publicPath && item.status !== 'FINISHED' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--bg)] text-[var(--accent-text)]">
              <Radio size={10} />
              LIVE
            </span>
          )}
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${meta.badgeCls}`}>
            {meta.label}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        {item.myStats ? (
          <div className="flex items-center gap-3 text-[var(--muted)]">
            <span className="inline-flex items-center gap-1 font-bold text-[var(--text)]">
              <Trophy size={12} className="text-amber-500" />#{item.myStats.rank}
            </span>
            <span>
              Поб: <strong className="text-[var(--text)]">{item.myStats.wins}</strong>/{item.myStats.games}
            </span>
            <span>
              Ср.очк: <strong className="text-[var(--accent-text)]">{item.myStats.ppm}</strong>
            </span>
          </div>
        ) : (
          <span className="text-xs text-[var(--muted)]">Вы организатор</span>
        )}
        <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent-text)]">
          {loading ? (
            <Loader2 size={14} className="animate-spin text-[var(--accent-text)]" />
          ) : (
            <>
              Открыть
              <ChevronRight size={14} />
            </>
          )}
        </span>
      </div>
    </button>
  );
};
