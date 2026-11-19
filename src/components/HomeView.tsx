import React, { useState } from 'react';
import {
  Plus,
  Trophy,
  Users,
  ChevronDown,
  ChevronUp,
  Crown,
  Swords,
  HeartHandshake,
  TrendingUp,
} from 'lucide-react';
import type { PlayerGlobalProfile, TournamentHistoryItem } from '../types';
import { haptic } from '../utils/telegram';
import { PlayerAvatar } from './PlayerAvatar';
import { TournamentHistoryCard } from './TournamentHistoryCard';

interface Props {
  tournaments: TournamentHistoryItem[];
  currentTournamentId: number | null;
  playerProfile?: PlayerGlobalProfile | null;
  userName?: string;
  userAvatarUrl?: string | null;
  onSelectTournament: (id: number) => void;
  onCreateTournament: () => void;
}

function getInitials(name?: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'И';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
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
  userAvatarUrl,
  onSelectTournament,
  onCreateTournament,
}) => {
  const [pastOpen, setPastOpen] = useState(false);
  const [profileExpanded, setProfileExpanded] = useState(false);

  const activeTournaments = tournaments.filter((t) => t.status !== 'FINISHED');
  const finishedTournaments = tournaments.filter((t) => t.status === 'FINISHED');

  const renderCard = (t: TournamentHistoryItem) => (
    <TournamentHistoryCard
      key={t.id}
      item={t}
      isCurrent={t.id === currentTournamentId}
      onClick={() => onSelectTournament(t.id)}
    />
  );

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

      {/* Главный профиль игрока (компактный по умолчанию, раскрывается по тапу) */}
      {playerProfile && (
        <section
          role="button"
          tabIndex={0}
          aria-expanded={profileExpanded}
          data-testid="home-profile-card"
          onClick={() => {
            haptic('light');
            setProfileExpanded((v) => !v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              haptic('light');
              setProfileExpanded((v) => !v);
            }
          }}
          className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-4 cursor-pointer select-none transition-colors hover:border-[var(--border-strong)]"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <PlayerAvatar
                avatarUrl={userAvatarUrl}
                initials={getInitials(userName)}
                name={userName || 'Игрок кикера'}
                size="md"
                className="border-[#2ea6ff] bg-[#2ea6ff]/15 text-[#2ea6ff]"
              />
              <div className="min-w-0">
                <div className="text-xs font-medium text-[#2ea6ff]">
                  Мой профиль
                </div>
                <div className="text-base font-semibold text-[var(--text)] truncate">
                  {userName || 'Игрок кикера'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {playerProfile.championCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-500 text-xs font-bold">
                  <Crown size={13} />
                  {playerProfile.championCount} {playerProfile.championCount === 1 ? 'титул' : 'титула'}
                </span>
              )}
              <ChevronDown
                size={16}
                className={`text-[var(--muted)] transition-transform duration-300 ease-out ${
                  profileExpanded ? 'rotate-180' : ''
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center mt-3">
            <div className="aspect-square rounded-full bg-[var(--bg)] border border-[var(--border)] flex flex-col items-center justify-center p-1">
              <div className="text-sm font-semibold text-[var(--text)] leading-tight">
                {playerProfile.tournamentsPlayed}
              </div>
              <div className="text-[9px] text-[var(--muted)] leading-tight mt-0.5">Турниров</div>
            </div>
            <div className="aspect-square rounded-full bg-[var(--bg)] border border-[var(--border)] flex flex-col items-center justify-center p-1">
              <div className="text-sm font-semibold text-emerald-500 leading-tight">
                {playerProfile.totalWins}/{playerProfile.totalMatches}
              </div>
              <div className="text-[9px] text-[var(--muted)] leading-tight mt-0.5">Побед</div>
            </div>
            <div className="aspect-square rounded-full bg-[var(--bg)] border border-[var(--border)] flex flex-col items-center justify-center p-1">
              <div className="text-sm font-semibold text-[#2ea6ff] leading-tight">
                {playerProfile.winRate}%
              </div>
              <div className="text-[9px] text-[var(--muted)] leading-tight mt-0.5">Винрейт</div>
            </div>
            <div className="aspect-square rounded-full bg-[var(--bg)] border border-[var(--border)] flex flex-col items-center justify-center p-1">
              <div className="text-sm font-semibold text-[var(--text)] leading-tight">
                {playerProfile.avgGoalsPerMatch}
              </div>
              <div className="text-[9px] text-[var(--muted)] leading-tight mt-0.5">Гол/матч</div>
            </div>
          </div>

          <div
            data-testid="home-profile-details"
            aria-hidden={!profileExpanded}
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
              profileExpanded
                ? 'grid-rows-[1fr] opacity-100'
                : 'grid-rows-[0fr] opacity-0 pointer-events-none'
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="space-y-3 pt-3">
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
                  <div className="text-xs font-semibold text-[var(--muted)]">
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
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Текущие турниры */}
      <section className="space-y-2.5">
        <div className="text-xs font-semibold text-[var(--muted)] px-1">
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
              <span className="text-xs font-semibold text-[var(--text)]">
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
