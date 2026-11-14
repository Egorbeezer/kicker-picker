import React, { useState } from 'react';
import {
  Plus,
  Trophy,
  Users,
  Calendar,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Radio,
  Crown,
  Swords,
  HeartHandshake,
  TrendingUp,
} from 'lucide-react';
import type { PlayerGlobalProfile, TournamentHistoryItem } from '../types';
import { formatDateRu } from '../utils/date';
import { haptic } from '../utils/telegram';

interface Props {
  tournaments: TournamentHistoryItem[];
  currentTournamentId: number | null;
  playerProfile?: PlayerGlobalProfile | null;
  userName?: string;
  onSelectTournament: (id: number) => void;
  onCreateTournament: () => void;
}

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

const AvgPointsSparkline: React.FC<{
  timeline: PlayerGlobalProfile['timeline'];
}> = ({ timeline }) => {
  if (!timeline || timeline.length === 0) return null;

  const width = 300;
  const height = 84;
  const padX = 16;
  const padY = 14;
  const values = timeline.map((p) => p.avgPoints);
  const maxVal = Math.max(2, ...values);
  const minVal = 0;

  const points = timeline.map((item, idx) => {
    const x =
      timeline.length === 1
        ? width / 2
        : padX + (idx / (timeline.length - 1)) * (width - padX * 2);
    const ratio = (item.avgPoints - minVal) / (maxVal - minVal || 1);
    const y = height - padY - ratio * (height - padY * 2);
    return { x, y, ...item };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height - padY} L ${points[0].x.toFixed(1)} ${height - padY} Z`
      : '';

  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3 space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold text-[var(--text)] flex items-center gap-1.5">
          <TrendingUp size={13} className="text-[#2ea6ff]" />
          Динамика среднего балла
        </span>
        <span className="text-[var(--muted)]">
          макс: {maxVal.toFixed(2)}
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20 overflow-visible">
        <defs>
          <linearGradient id="kpSparkArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2ea6ff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#2ea6ff" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill="url(#kpSparkArea)" />}
        {points.length > 1 && (
          <path d={linePath} fill="none" stroke="#2ea6ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {points.map((pt) => (
          <g key={pt.tournamentId}>
            <circle cx={pt.x} cy={pt.y} r="4" fill="#2ea6ff" stroke="var(--card)" strokeWidth="2" />
            <text
              x={pt.x}
              y={Math.max(10, pt.y - 7)}
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill="var(--text)"
            >
              {pt.avgPoints.toFixed(1)}
            </text>
          </g>
        ))}
      </svg>

      <div className="flex items-center justify-between text-[10px] text-[var(--muted)] px-1">
        <span>{timeline[0].dateLabel}</span>
        {timeline.length > 2 && <span>{timeline[Math.floor(timeline.length / 2)].dateLabel}</span>}
        {timeline.length > 1 && <span>{timeline[timeline.length - 1].dateLabel}</span>}
      </div>
    </div>
  );
};

export const HomeView: React.FC<Props> = ({
  tournaments,
  currentTournamentId,
  playerProfile,
  userName,
  onSelectTournament,
  onCreateTournament,
}) => {
  const [pastOpen, setPastOpen] = useState(false);

  const activeTournaments = tournaments.filter((t) => t.status !== 'FINISHED');
  const finishedTournaments = tournaments.filter((t) => t.status === 'FINISHED');

  const renderCard = (t: TournamentHistoryItem) => {
    const meta = STATUS_META[t.status] || STATUS_META.REGISTRATION;
    const isCurrent = t.id === currentTournamentId;
    const dateLabel = formatTournamentDate(t);
    const modeTitle = MODE_LABELS[t.dypMode || 'monster'] || 'DYP';

    return (
      <button
        key={t.id}
        type="button"
        onClick={() => {
          haptic('light');
          onSelectTournament(t.id);
        }}
        className={`w-full text-left bg-[var(--card)] border rounded-3xl p-4 transition-all active:scale-[0.985] space-y-2.5 ${
          isCurrent
            ? 'border-[#2ea6ff]/60 shadow-[0_0_0_1px_rgba(46,166,255,0.2)]'
            : 'border-[var(--border)] hover:border-[var(--border-strong)]'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-[var(--text)] truncate">{t.name}</div>
            <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-[var(--muted)] mt-1">
              {dateLabel && (
                <span className="inline-flex items-center gap-1">
                  <Calendar size={11} />
                  {dateLabel}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Users size={11} />
                {t.participantsCount}
              </span>
              <span>
                {modeTitle}
                {t.teamFormat === 'single' ? ' 1×1' : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {t.publicPath && t.status !== 'FINISHED' && (
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
          {t.myStats ? (
            <div className="flex items-center gap-3 text-[var(--muted)]">
              <span className="inline-flex items-center gap-1 font-bold text-[var(--text)]">
                <Trophy size={12} className="text-amber-500" />
                #{t.myStats.rank}
              </span>
              <span>
                Поб: <strong className="text-[var(--text)]">{t.myStats.wins}</strong>/{t.myStats.games}
              </span>
              <span>
                Ср.очк: <strong className="text-[#2ea6ff]">{t.myStats.ppm}</strong>
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-[var(--muted)]">Вы организатор</span>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2ea6ff]">
            Открыть
            <ChevronRight size={14} />
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4 pb-8">
      <button
        type="button"
        onClick={() => {
          haptic('light');
          onCreateTournament();
        }}
        className="w-full py-3.5 px-4 rounded-3xl bg-[#2ea6ff] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#2ea6ff]/20 active:scale-[0.98] transition-transform"
      >
        <Plus size={18} />
        Создать новый турнир
      </button>

      {/* Главный профиль игрока */}
      {playerProfile && (
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#2ea6ff]">
                Мой профиль
              </div>
              <div className="text-base font-extrabold text-[var(--text)]">
                {userName || 'Игрок кикера'}
              </div>
            </div>
            {playerProfile.championCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-500 text-xs font-bold">
                <Crown size={13} />
                {playerProfile.championCount} {playerProfile.championCount === 1 ? 'титул' : 'титула'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl py-2 px-1">
              <div className="text-base font-extrabold text-[var(--text)]">{playerProfile.tournamentsPlayed}</div>
              <div className="text-[10px] text-[var(--muted)]">Турниров</div>
            </div>
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl py-2 px-1">
              <div className="text-base font-extrabold text-emerald-500">
                {playerProfile.totalWins}/{playerProfile.totalMatches}
              </div>
              <div className="text-[10px] text-[var(--muted)]">Побед</div>
            </div>
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl py-2 px-1">
              <div className="text-base font-extrabold text-[#2ea6ff]">{playerProfile.winRate}%</div>
              <div className="text-[10px] text-[var(--muted)]">Винрейт</div>
            </div>
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl py-2 px-1">
              <div className="text-base font-extrabold text-[var(--text)]">{playerProfile.avgGoalsPerMatch}</div>
              <div className="text-[10px] text-[var(--muted)]">Гол/матч</div>
            </div>
          </div>

          {/* Напарники и неудобный соперник */}
          {(playerProfile.mostFrequentPartner || playerProfile.bestPartner || playerProfile.toughestOpponent) && (
            <div className="grid grid-cols-1 gap-2">
              {playerProfile.mostFrequentPartner && (
                <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-3 py-2 flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--muted)] flex items-center gap-1.5">
                    <Users size={13} className="text-[#2ea6ff]" />
                    Частый напарник
                  </span>
                  <span className="font-bold text-[var(--text)] truncate">
                    {playerProfile.mostFrequentPartner.name}{' '}
                    <span className="font-normal text-[var(--muted)]">
                      ({playerProfile.mostFrequentPartner.games} игр, {playerProfile.mostFrequentPartner.winRate}%)
                    </span>
                  </span>
                </div>
              )}

              {playerProfile.bestPartner && (
                <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-3 py-2 flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--muted)] flex items-center gap-1.5">
                    <HeartHandshake size={13} className="text-emerald-500" />
                    Лучший напарник
                  </span>
                  <span className="font-bold text-emerald-500 truncate">
                    {playerProfile.bestPartner.name}{' '}
                    <span className="font-normal text-[var(--muted)]">
                      ({playerProfile.bestPartner.winRate}% • {playerProfile.bestPartner.wins}/{playerProfile.bestPartner.games})
                    </span>
                  </span>
                </div>
              )}

              {playerProfile.toughestOpponent && (
                <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-3 py-2 flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--muted)] flex items-center gap-1.5">
                    <Swords size={13} className="text-red-500" />
                    Неудобный соперник (H2H)
                  </span>
                  <span className="font-bold text-red-500 truncate">
                    {playerProfile.toughestOpponent.name}{' '}
                    <span className="font-normal text-[var(--muted)]">
                      ({playerProfile.toughestOpponent.losses} пор. из {playerProfile.toughestOpponent.games})
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* График среднего балла */}
          <AvgPointsSparkline timeline={playerProfile.timeline} />

          {/* Клубные бейджи */}
          {playerProfile.badges.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Достижения клуба
              </div>
              <div className="flex flex-wrap gap-1.5">
                {playerProfile.badges.map((b) => (
                  <div
                    key={b.id}
                    title={b.description}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg)] border border-[var(--border)] text-xs font-semibold text-[var(--text)]"
                  >
                    <span>{b.emoji}</span>
                    <span>{b.title}</span>
                    {b.count > 1 && (
                      <span className="text-[10px] font-bold text-[#2ea6ff]">×{b.count}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Текущие турниры */}
      <section className="space-y-2.5">
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] px-1">
          Текущие турниры ({activeTournaments.length})
        </div>
        {activeTournaments.length === 0 ? (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-5 text-center text-xs text-[var(--muted)]">
            Сейчас нет активных турниров. Создайте новый или откройте ссылку от организатора!
          </div>
        ) : (
          <div className="space-y-2.5">{activeTournaments.map(renderCard)}</div>
        )}
      </section>

      {/* Прошедшие турниры */}
      {finishedTournaments.length > 0 && (
        <section className="space-y-2.5">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              setPastOpen((v) => !v);
            }}
            className="w-full flex items-center justify-between bg-[var(--card)] border border-[var(--border)] rounded-3xl px-4 py-3 text-left transition-colors hover:border-[var(--border-strong)]"
          >
            <div className="flex items-center gap-2">
              <Trophy size={15} className="text-emerald-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">
                Прошедшие турниры ({finishedTournaments.length})
              </span>
            </div>
            {pastOpen ? (
              <ChevronUp size={16} className="text-[var(--muted)]" />
            ) : (
              <ChevronDown size={16} className="text-[var(--muted)]" />
            )}
          </button>

          {pastOpen && <div className="space-y-2.5">{finishedTournaments.map(renderCard)}</div>}
        </section>
      )}
    </div>
  );
};
