import React from 'react';
import { Calendar, ChevronRight, Loader2, Radio, Trophy, Users } from 'lucide-react';
import type { TournamentHistoryItem } from '../types';
import { formatDateRu } from '../utils/date';
import { haptic } from '../utils/telegram';

const STATUS_META: Record<string, { label: string; badgeCls: string }> = {
  REGISTRATION: { label: 'Регистрация', badgeCls: 'bg-[#2ea6ff]/15 text-[#2ea6ff]' },
  QUALIFICATION: { label: 'Квалификация', badgeCls: 'bg-amber-500/15 text-amber-500' },
  PLAYOFF: { label: 'Плей-офф', badgeCls: 'bg-purple-500/15 text-purple-500' },
  FINISHED: { label: 'Завершён', badgeCls: 'bg-emerald-500/15 text-emerald-500' },
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
  onClick: () => void;
}

/**
 * Единая карточка турнира для Главного экрана и вкладки Профиль -> История турниров.
 */
export const TournamentHistoryCard: React.FC<Props> = ({
  item,
  isCurrent = false,
  loading = false,
  onClick,
}) => {
  const meta = STATUS_META[item.status] || STATUS_META.REGISTRATION;
  const dateLabel = formatTournamentDate(item);
  const modeTitle = MODE_LABELS[item.dypMode || 'monster'] || 'DYP';

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => {
        haptic('light');
        onClick();
      }}
      className={`w-full text-left bg-[var(--card)] border rounded-3xl p-4 transition-all active:scale-[0.985] space-y-2.5 disabled:opacity-75 ${
        isCurrent
          ? 'border-[#2ea6ff]/60 shadow-[0_0_0_1px_rgba(46,166,255,0.2)]'
          : 'border-[var(--border)] hover:border-[var(--border-strong)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm text-[var(--text)] truncate">{item.name}</div>
          <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-[var(--muted)] mt-1">
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
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
              <Radio size={10} />
              LIVE
            </span>
          )}
          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${meta.badgeCls}`}>
            {meta.label}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] text-xs">
        {item.myStats ? (
          <div className="flex items-center gap-3 text-[var(--muted)]">
            <span className="inline-flex items-center gap-1 font-bold text-[var(--text)]">
              <Trophy size={12} className="text-amber-500" />#{item.myStats.rank}
            </span>
            <span>
              Поб: <strong className="text-[var(--text)]">{item.myStats.wins}</strong>/{item.myStats.games}
            </span>
            <span>
              Ср.очк: <strong className="text-[#2ea6ff]">{item.myStats.ppm}</strong>
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-[var(--muted)]">Вы организатор</span>
        )}
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2ea6ff]">
          {loading ? (
            <Loader2 size={14} className="animate-spin text-[#2ea6ff]" />
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
