import React, { useState } from 'react';
import {
  Plus,
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
            <stop offset="0%" stopColor="#9FE870" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#9FE870" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill="url(#kpSparkArea)" />}
        {points.length > 1 && (
          <path d={linePath} fill="none" stroke="var(--accent-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {points.map((pt) => (
          <g key={pt.tournamentId}>
            <circle cx={pt.x} cy={pt.y} r="4" fill="#9FE870" stroke="var(--accent-text)" strokeWidth="2" />
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
    <div className="space-y-5 pb-8">
      {/* Hero статистика игрока на чистом фоне в стиле Wise iOS */}
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
          className="bg-[var(--card)] rounded-[24px] p-4 cursor-pointer select-none"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <PlayerAvatar
                avatarUrl={userAvatarUrl}
                initials={getInitials(userName)}
                name={userName || 'Игрок кикера'}
                size="sm"
                className="bg-[var(--bg)] text-[var(--text)] border-transparent"
              />
              <span className="text-sm font-bold text-[var(--text)] truncate">
                {userName || 'Игрок кикера'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {playerProfile.championCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] text-xs font-bold">
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

          <div className="mt-3 space-y-1">
            <div className="text-xs font-semibold text-[var(--muted)]">Твой винрейт по всем турнирам</div>
            <div className="text-[36px] leading-none font-bold tracking-tight tabular-nums text-[var(--text)]">
              {playerProfile.winRate}%
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-3 mt-3 border-t border-[var(--border)] text-center">
            <div>
              <div className="text-sm font-bold tabular-nums text-[var(--ok)]">
                {playerProfile.totalWins}
              </div>
              <div className="text-[10px] font-medium text-[var(--muted)]">Победы</div>
            </div>
            <div>
              <div className="text-sm font-bold tabular-nums text-[var(--danger)]">
                {Math.max(0, playerProfile.totalMatches - playerProfile.totalWins)}
              </div>
              <div className="text-[10px] font-medium text-[var(--muted)]">Поражения</div>
            </div>
            <div>
              <div className="text-sm font-bold tabular-nums text-[var(--text)]">
                {playerProfile.avgGoalsPerMatch}
              </div>
              <div className="text-[10px] font-medium text-[var(--muted)]">Ср. гол</div>
            </div>
            <div>
              <div className="text-sm font-bold tabular-nums text-[var(--text)]">
                {playerProfile.tournamentsPlayed}
              </div>
              <div className="text-[10px] font-medium text-[var(--muted)]">Турниры</div>
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
              <div className="space-y-2.5 pt-3.5">
                {(playerProfile.mostFrequentPartner || playerProfile.bestPartner || playerProfile.toughestOpponent) && (
                  <div className="grid grid-cols-1 gap-2">
                    {playerProfile.mostFrequentPartner && (
                      <div className="bg-[var(--card)] rounded-[20px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                        <span className="text-[var(--muted)] flex items-center gap-1.5">
                          <Users size={13} className="text-[var(--accent-text)]" />
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
                      <div className="bg-[var(--card)] rounded-[20px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                        <span className="text-[var(--muted)] flex items-center gap-1.5">
                          <HeartHandshake size={13} className="text-[var(--ok)]" />
                          Лучший напарник
                        </span>
                        <span className="font-bold text-[var(--ok)] truncate">
                          {playerProfile.bestPartner.name}{' '}
                          <span className="font-normal text-[var(--muted)]">
                            ({playerProfile.bestPartner.winRate}% • {playerProfile.bestPartner.wins}/{playerProfile.bestPartner.games})
                          </span>
                        </span>
                      </div>
                    )}

                    {playerProfile.toughestOpponent && (
                      <div className="bg-[var(--card)] rounded-[20px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                        <span className="text-[var(--muted)] flex items-center gap-1.5">
                          <Swords size={13} className="text-[var(--danger)]" />
                          Неудобный соперник (H2H)
                        </span>
                        <span className="font-bold text-[var(--danger)] truncate">
                          {playerProfile.toughestOpponent.name}{' '}
                          <span className="font-normal text-[var(--muted)]">
                            ({playerProfile.toughestOpponent.losses} пор. из {playerProfile.toughestOpponent.games})
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <AvgPointsSparkline timeline={playerProfile.timeline} />

                {playerProfile.badges.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-[var(--muted)]">
                      Достижения
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {playerProfile.badges.map((b) => (
                        <div
                          key={b.id}
                          title={b.description}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--card)] text-xs font-semibold text-[var(--text)]"
                        >
                          <span>{b.emoji}</span>
                          <span>{b.title}</span>
                          {b.count > 1 && (
                            <span className="text-[10px] font-bold text-[var(--accent-text)]">×{b.count}</span>
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

      {/* Основное действие — создание турнира */}
      <button
        type="button"
        onClick={() => {
          haptic('light');
          onCreateTournament();
        }}
        className="w-full py-3.5 px-4 rounded-full bg-[var(--accent)] text-[var(--on-accent)] font-bold text-sm inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        <Plus size={18} strokeWidth={2.4} />
        Создать турнир
      </button>

      {/* Текущие турниры */}
      <section className="space-y-2.5">
        <div className="text-sm font-bold text-[var(--text)]">
          Текущие турниры ({activeTournaments.length})
        </div>
        {activeTournaments.length === 0 ? (
          <div className="bg-[var(--card)] rounded-[24px] p-5 text-center text-xs text-[var(--muted)]">
            Сейчас нет активных турниров. Нажмите «Создать турнир» выше, чтобы начать новый!
          </div>
        ) : (
          <div className="space-y-2.5">{activeTournaments.map(renderCard)}</div>
        )}
      </section>

      {/* Прошедшие турниры (лента транзакций Wise) */}
      {finishedTournaments.length > 0 && (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              setPastOpen((v) => !v);
            }}
            className="w-full flex items-center justify-between py-2 text-left"
          >
            <span className="text-sm font-bold text-[var(--text)]">
              Прошедшие турниры ({finishedTournaments.length})
            </span>
            {pastOpen ? (
              <ChevronUp size={16} className="text-[var(--muted)]" />
            ) : (
              <ChevronDown size={16} className="text-[var(--muted)]" />
            )}
          </button>

          {pastOpen && (
            <div className="divide-y divide-[var(--border)]">
              {finishedTournaments.map((t) => (
                <TournamentHistoryCard
                  key={t.id}
                  item={t}
                  isCurrent={t.id === currentTournamentId}
                  variant="row"
                  onClick={() => onSelectTournament(t.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
