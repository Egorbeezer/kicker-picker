import React, { useState } from 'react';
import { Trophy, Clock, CheckCircle2, GitBranch, List, ZoomIn } from 'lucide-react';
import type { MatchItem } from '../types';
import { PlayerAvatar } from './PlayerAvatar';
import { haptic } from '../utils/telegram';

interface Props {
  matches: MatchItem[];
  playoffSize: number;
  thirdPlaceMatch: boolean;
  myPlayerId: number | null;
}

interface RoundSpec {
  prefix: 'R32_' | 'EF' | 'QF' | 'SF' | 'FINAL';
  title: string;
  matchCount: number;
}

function getBracketRounds(matches: MatchItem[], playoffSize: number): RoundSpec[] {
  const slots = matches.map((m) => m.bracketSlot || '');
  const hasR32 = slots.some((s) => s.startsWith('R32_'));
  const hasEF = slots.some((s) => s.startsWith('EF'));
  const hasQF = slots.some((s) => s.startsWith('QF'));
  const hasSF = slots.some((s) => s.startsWith('SF'));

  let startDepth: RoundSpec['prefix'] = 'FINAL';
  if (hasR32) startDepth = 'R32_';
  else if (hasEF || (!matches.length && playoffSize >= 32)) startDepth = 'EF';
  else if (hasQF || (!matches.length && playoffSize >= 16)) startDepth = 'QF';
  else if (hasSF || (!matches.length && playoffSize >= 8)) startDepth = 'SF';

  const all: RoundSpec[] = [
    { prefix: 'R32_', title: '1/16 финала', matchCount: 16 },
    { prefix: 'EF', title: '1/8 финала', matchCount: 8 },
    { prefix: 'QF', title: 'Четвертьфинал', matchCount: 4 },
    { prefix: 'SF', title: 'Полуфинал', matchCount: 2 },
    { prefix: 'FINAL', title: 'Финал', matchCount: 1 },
  ];

  const startIndex = all.findIndex((r) => r.prefix === startDepth);
  return all.slice(startIndex === -1 ? all.length - 1 : startIndex);
}

function isTeamWinner(match: MatchItem, team: 1 | 2): boolean {
  if (match.status !== 'FINISHED') return false;
  const t1Won =
    match.setsWon1 > match.setsWon2 ||
    (match.setsWon1 === match.setsWon2 && match.score1 > match.score2);
  return team === 1 ? t1Won : !t1Won;
}

function formatScoreChip(match: MatchItem, team: 1 | 2): string {
  if (match.status === 'PLAYING' && match.setsWon1 === 0 && match.setsWon2 === 0) {
    return '—';
  }
  const hasSeries =
    (match.setsWon1 > 0 || match.setsWon2 > 0) &&
    (match.setsWon1 + match.setsWon2 > 1 || (match.setsHistory && match.setsHistory.length > 1));
  if (hasSeries) {
    return String(team === 1 ? match.setsWon1 : match.setsWon2);
  }
  return String(team === 1 ? match.score1 : match.score2);
}

const BracketNodeCard: React.FC<{
  match: MatchItem | null;
  slotLabel: string;
  myPlayerId: number | null;
  isFinal?: boolean;
}> = ({ match, slotLabel, myPlayerId, isFinal = false }) => {
  if (!match) {
    return (
      <div className="h-full w-full rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-2)]/50 px-3 py-2 flex flex-col justify-between">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase text-gray-500">
          <span>{slotLabel}</span>
          <span>Ожидание</span>
        </div>
        <div className="space-y-1.5 text-[11px] text-gray-500">
          <div className="truncate">Победитель пары 1</div>
          <div className="border-t border-[var(--border)] pt-1 truncate">Победитель пары 2</div>
        </div>
      </div>
    );
  }

  const t1Win = isTeamWinner(match, 1);
  const t2Win = isTeamWinner(match, 2);
  const t1HasMe = myPlayerId != null && match.team1Players.some((p) => p.id === myPlayerId);
  const t2HasMe = myPlayerId != null && match.team2Players.some((p) => p.id === myPlayerId);
  const statusBorder =
    match.status === 'FINISHED'
      ? isFinal
        ? 'border-yellow-500/60'
        : 'border-green-500/40'
      : match.status === 'WAITING_CONFIRM'
        ? 'border-[#2ea6ff]/60'
        : 'border-[var(--border-strong)]';

  return (
    <div
      className={`h-full w-full rounded-xl border ${statusBorder} bg-[#2c2c2e] px-2.5 py-2 flex flex-col justify-between shadow-sm overflow-hidden`}
    >
      <div className="flex items-center justify-between gap-1.5 text-[10px] h-4 leading-none shrink-0">
        <span className={`font-bold truncate ${isFinal ? 'text-yellow-500' : 'text-gray-400'}`}>
          {slotLabel} • Ст. {match.tableNumber}
        </span>
        {match.status === 'FINISHED' ? (
          <CheckCircle2 size={12} className="text-green-500 shrink-0" />
        ) : match.status === 'WAITING_CONFIRM' ? (
          <Clock size={12} className="text-[#2ea6ff] shrink-0" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />
        )}
      </div>

      <div className="space-y-1.5">
        {/* Team 1 */}
        <div
          className={`h-[34px] flex items-center justify-between gap-2 rounded-lg px-2 ${
            t1Win ? 'bg-green-500/15' : t1HasMe ? 'bg-[#2ea6ff]/10' : 'bg-[#1c1c1d]/40'
          }`}
        >
          <div className="flex-1 flex items-center gap-1.5 min-w-0 overflow-hidden">
            <div className="flex -space-x-1.5 shrink-0">
              {match.team1Players.map((p) => (
                <PlayerAvatar
                  key={p.id}
                  avatarUrl={p.avatarUrl}
                  initials={p.initials}
                  name={p.name}
                  isMe={p.id === myPlayerId}
                  size="xs"
                />
              ))}
            </div>
            <span
              className={`text-[11px] leading-tight truncate ${
                t1Win
                  ? 'font-bold text-white'
                  : match.status === 'FINISHED'
                    ? 'text-gray-400 line-through'
                    : t1HasMe
                      ? 'font-bold text-[#2ea6ff]'
                      : 'text-gray-200'
              }`}
            >
              {match.team1Label}
            </span>
          </div>
          <span
            className={`text-xs font-black shrink-0 min-w-[16px] text-right ${
              t1Win ? 'text-green-400' : 'text-gray-300'
            }`}
          >
            {formatScoreChip(match, 1)}
          </span>
        </div>

        {/* Team 2 */}
        <div
          className={`h-[34px] flex items-center justify-between gap-2 rounded-lg px-2 ${
            t2Win ? 'bg-green-500/15' : t2HasMe ? 'bg-[#2ea6ff]/10' : 'bg-[#1c1c1d]/40'
          }`}
        >
          <div className="flex-1 flex items-center gap-1.5 min-w-0 overflow-hidden">
            <div className="flex -space-x-1.5 shrink-0">
              {match.team2Players.map((p) => (
                <PlayerAvatar
                  key={p.id}
                  avatarUrl={p.avatarUrl}
                  initials={p.initials}
                  name={p.name}
                  isMe={p.id === myPlayerId}
                  size="xs"
                />
              ))}
            </div>
            <span
              className={`text-[11px] leading-tight truncate ${
                t2Win
                  ? 'font-bold text-white'
                  : match.status === 'FINISHED'
                    ? 'text-gray-400 line-through'
                    : t2HasMe
                      ? 'font-bold text-[#2ea6ff]'
                      : 'text-gray-200'
              }`}
            >
              {match.team2Label}
            </span>
          </div>
          <span
            className={`text-xs font-black shrink-0 min-w-[16px] text-right ${
              t2Win ? 'text-green-400' : 'text-gray-300'
            }`}
          >
            {formatScoreChip(match, 2)}
          </span>
        </div>
      </div>
    </div>
  );
};

export const PlayoffBracketView: React.FC<Props> = ({
  matches,
  playoffSize,
  thirdPlaceMatch,
  myPlayerId,
}) => {
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');
  const [zoomPercent, setZoomPercent] = useState<number>(100);

  const bySlot = new Map<string, MatchItem>();
  for (const m of matches) {
    if (m.bracketSlot) bySlot.set(m.bracketSlot, m);
  }

  const rounds = getBracketRounds(matches, playoffSize);
  const thirdMatch = bySlot.get('THIRD_PLACE') || null;
  const finalMatch = bySlot.get('FINAL') || null;
  const championLabel = finalMatch && finalMatch.status === 'FINISHED'
    ? isTeamWinner(finalMatch, 1)
      ? finalMatch.team1Label
      : finalMatch.team2Label
    : null;

  const COL_W = 236;
  const GAP_W = 28;
  const CARD_H = 110;
  const BASE_ROW_H = 128;

  const firstCount = rounds[0]?.matchCount || 1;
  const totalHeight = firstCount * BASE_ROW_H;
  const totalWidth = rounds.length * COL_W + Math.max(0, rounds.length - 1) * GAP_W;
  const scale = Math.max(0.5, Math.min(1, zoomPercent / 100));

  const getCenterY = (roundIdx: number, matchIdx: number) =>
    (matchIdx + 0.5) * Math.pow(2, roundIdx) * BASE_ROW_H;

  const getSlotKey = (prefix: RoundSpec['prefix'], idx: number) =>
    prefix === 'FINAL' ? 'FINAL' : `${prefix}${idx + 1}`;

  const getSlotTitle = (prefix: RoundSpec['prefix'], idx: number) =>
    prefix === 'FINAL'
      ? 'Финал'
      : prefix === 'SF'
        ? `Полуфинал ${idx + 1}`
        : prefix === 'QF'
          ? `Четвертьфинал ${idx + 1}`
          : prefix === 'EF'
            ? `1/8 финала ${idx + 1}`
            : `1/16 финала ${idx + 1}`;

  return (
    <div className="p-3 space-y-4">
      {championLabel && (
        <div className="bg-amber-500/12 border border-amber-500/35 rounded-2xl p-3.5 flex items-center gap-3">
          <Trophy size={24} className="text-amber-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase text-amber-500 tracking-wider">
              Победители турнира
            </div>
            <div className="text-sm font-black text-[var(--text)] truncate">{championLabel}</div>
          </div>
        </div>
      )}

      {/* Switcher: Сетка / Список + Zoom slider */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex bg-[var(--bg)] border border-[var(--border)] rounded-full p-0.5">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              setViewMode('tree');
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
              viewMode === 'tree' ? 'bg-[#2ea6ff] text-white' : 'text-[var(--muted)]'
            }`}
          >
            <GitBranch size={13} />
            Сетка
          </button>
          <button
            type="button"
            onClick={() => {
              haptic('light');
              setViewMode('list');
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
              viewMode === 'list' ? 'bg-[#2ea6ff] text-white' : 'text-[var(--muted)]'
            }`}
          >
            <List size={13} />
            Список
          </button>
        </div>

        {viewMode === 'tree' && (
          <label className="inline-flex items-center gap-2 text-xs text-[var(--muted)] bg-[var(--bg)] border border-[var(--border)] rounded-full px-3 py-1">
            <ZoomIn size={13} className="text-[#2ea6ff]" />
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={zoomPercent}
              aria-label="Масштаб сетки"
              onChange={(e) => setZoomPercent(Number(e.target.value))}
              className="w-20 accent-[#2ea6ff] cursor-pointer"
            />
            <span className="font-bold text-[var(--text)] min-w-[34px] text-right">{zoomPercent}%</span>
          </label>
        )}
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-4">
          {rounds.map((round) => (
            <div key={round.prefix} className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] px-1 flex items-center gap-1.5">
                {round.prefix === 'FINAL' && <Trophy size={12} className="text-amber-500" />}
                <span>{round.title}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {Array.from({ length: round.matchCount }, (_, mIdx) => {
                  const slotKey = getSlotKey(round.prefix, mIdx);
                  const match = bySlot.get(slotKey) || null;
                  return (
                    <div key={slotKey} className="h-[110px]">
                      <BracketNodeCard
                        match={match}
                        slotLabel={getSlotTitle(round.prefix, mIdx)}
                        myPlayerId={myPlayerId}
                        isFinal={round.prefix === 'FINAL'}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Horizontal scroll wrapper for bracket tree */
        <div className="overflow-x-auto pb-2 -mx-1 px-1">
          <div style={{ width: totalWidth * scale, height: (totalHeight + 30) * scale }}>
            <div
              style={{
                width: totalWidth,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
          {/* Round headers */}
          <div className="flex mb-2" style={{ gap: GAP_W }}>
            {rounds.map((r) => (
              <div
                key={r.prefix}
                style={{ width: COL_W }}
                className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-gray-400 px-1 flex items-center justify-between"
              >
                <span className="truncate">{r.title}</span>
                {r.prefix === 'FINAL' && <Trophy size={12} className="text-yellow-500 shrink-0" />}
              </div>
            ))}
          </div>

          {/* Graph canvas: SVG lines + positioned match cards */}
          <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
            <svg
              width={totalWidth}
              height={totalHeight}
              className="absolute inset-0 pointer-events-none"
            >
              {rounds.slice(0, -1).map((round, rIdx) => {
                const nextRound = rounds[rIdx + 1];
                const x1 = rIdx * (COL_W + GAP_W) + COL_W;
                const x2 = (rIdx + 1) * (COL_W + GAP_W);
                const midX = x1 + GAP_W / 2;

                return Array.from({ length: nextRound.matchCount }, (_, nextIdx) => {
                  const topIdx = nextIdx * 2;
                  const botIdx = nextIdx * 2 + 1;
                  const yTop = getCenterY(rIdx, topIdx);
                  const yBot = getCenterY(rIdx, botIdx);
                  const yNext = getCenterY(rIdx + 1, nextIdx);

                  const topMatch = bySlot.get(getSlotKey(round.prefix, topIdx));
                  const botMatch = bySlot.get(getSlotKey(round.prefix, botIdx));
                  const topDone = topMatch?.status === 'FINISHED';
                  const botDone = botMatch?.status === 'FINISHED';

                  return (
                    <g key={`${round.prefix}-${nextIdx}`}>
                      {/* Top branch */}
                      <path
                        d={`M ${x1} ${yTop} H ${midX} V ${yNext}`}
                        fill="none"
                        stroke={topDone ? '#2ea6ff' : 'rgba(148,163,184,0.35)'}
                        strokeWidth={topDone ? 2 : 1.5}
                      />
                      {/* Bottom branch */}
                      <path
                        d={`M ${x1} ${yBot} H ${midX} V ${yNext}`}
                        fill="none"
                        stroke={botDone ? '#2ea6ff' : 'rgba(148,163,184,0.35)'}
                        strokeWidth={botDone ? 2 : 1.5}
                      />
                      {/* Stem to next round */}
                      <line
                        x1={midX}
                        y1={yNext}
                        x2={x2}
                        y2={yNext}
                        stroke={topDone && botDone ? '#2ea6ff' : 'rgba(148,163,184,0.35)'}
                        strokeWidth={topDone && botDone ? 2 : 1.5}
                      />
                      {/* Intersection node */}
                      <circle
                        cx={midX}
                        cy={yNext}
                        r={3}
                        fill={topDone && botDone ? '#2ea6ff' : 'rgba(148,163,184,0.5)'}
                      />
                    </g>
                  );
                });
              })}
            </svg>

            {rounds.map((round, rIdx) => {
              const left = rIdx * (COL_W + GAP_W);
              return Array.from({ length: round.matchCount }, (_, mIdx) => {
                const slotKey = getSlotKey(round.prefix, mIdx);
                const match = bySlot.get(slotKey) || null;
                const top = getCenterY(rIdx, mIdx) - CARD_H / 2;

                return (
                  <div
                    key={slotKey}
                    className="absolute"
                    style={{ left, top, width: COL_W, height: CARD_H }}
                  >
                    <BracketNodeCard
                      match={match}
                      slotLabel={getSlotTitle(round.prefix, mIdx)}
                      myPlayerId={myPlayerId}
                      isFinal={round.prefix === 'FINAL'}
                    />
                  </div>
                );
              });
            })}
            </div>
          </div>
        </div>
        </div>
      )}

      {/* 3rd place match card */}
      {(thirdPlaceMatch || thirdMatch) && rounds.length >= 2 && (
        <div className="pt-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2 px-1">
            Матч за 3-е место
          </div>
          <div className="w-[236px] h-[110px]">
            <BracketNodeCard
              match={thirdMatch}
              slotLabel="За 3-е место"
              myPlayerId={myPlayerId}
            />
          </div>
        </div>
      )}
    </div>
  );
};
