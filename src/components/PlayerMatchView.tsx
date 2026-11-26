import React, { useState, useEffect, useRef } from 'react';
import { Clock, AlertTriangle, Coffee, Bell, CheckCircle2, ChevronDown } from 'lucide-react';
import type { MatchItem, TournamentSnapshot } from '../types';
import { formatDateRu, getPlayoffPodium, getPlayerPlayoffResult } from '../utils/date';
import { PlayerAvatar } from './PlayerAvatar';
import { RubleCoin } from './RubleCoin';
import { ScorePickerRow } from './ScorePickerRow';
import { formatBracketSlotLabel, formatMatchDisplayScore } from './MatchCard';

interface Props {
  snapshot: TournamentSnapshot;
  onSubmitScore: (matchId: number, score1: number, score2: number) => Promise<void>;
  onConfirmScore: (matchId: number, action: 'confirm' | 'dispute') => Promise<void>;
  onRemindConfirm: (matchId: number) => Promise<void>;
  busy: boolean;
}

function getUnifiedTournamentMatches(snapshot: TournamentSnapshot): MatchItem[] {
  const source =
    Array.isArray(snapshot.allMatches) && snapshot.allMatches.length > 0
      ? snapshot.allMatches
      : [
          ...snapshot.currentRoundMatches,
          ...snapshot.playoffMatches,
          ...(snapshot.myHistory || []),
        ];

  const seen = new Set<number>();
  const excludeId = snapshot.myCurrentMatch?.id ?? null;
  const list: MatchItem[] = [];

  for (const m of source) {
    if (!m || m.status === 'CANCELLED' || m.id === excludeId || seen.has(m.id)) continue;
    seen.add(m.id);
    list.push(m);
  }

  return list.sort((a, b) => {
    const aActive = a.status !== 'FINISHED' ? 0 : 1;
    const bActive = b.status !== 'FINISHED' ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    const aPlayoff = a.stage === 'PLAYOFF' ? 1 : 0;
    const bPlayoff = b.stage === 'PLAYOFF' ? 1 : 0;
    if (aPlayoff !== bPlayoff) return bPlayoff - aPlayoff;
    if (a.roundNumber !== b.roundNumber) return b.roundNumber - a.roundNumber;
    return b.id - a.id;
  });
}

function isPlayerMatch(match: MatchItem, myPlayerId: number | null): boolean {
  if (match.myTeam === 1 || match.myTeam === 2) return true;
  if (myPlayerId == null) return false;
  return (
    match.team1Players.some((p) => p.id === myPlayerId) ||
    match.team2Players.some((p) => p.id === myPlayerId)
  );
}

function didPlayerWin(match: MatchItem, myPlayerId: number | null): boolean | null {
  if (match.status !== 'FINISHED') return null;
  let team: 1 | 2 | null = match.myTeam ?? null;
  if (!team && myPlayerId != null) {
    if (match.team1Players.some((p) => p.id === myPlayerId)) team = 1;
    else if (match.team2Players.some((p) => p.id === myPlayerId)) team = 2;
  }
  if (!team) return null;
  const t1Won =
    match.stage === 'PLAYOFF'
      ? match.setsWon1 > match.setsWon2 ||
        (match.setsWon1 === match.setsWon2 && match.score1 > match.score2)
      : match.score1 > match.score2;
  return team === 1 ? t1Won : !t1Won;
}

const UnifiedTournamentMatchesFeed: React.FC<{
  matches: MatchItem[];
  myPlayerId: number | null;
}> = ({ matches, myPlayerId }) => {
  const [expanded, setExpanded] = useState(false);
  if (matches.length === 0) return null;

  return (
    <div className="space-y-2.5 pt-2" data-testid="tournament-matches-history">
      <button
        type="button"
        data-testid="tournament-matches-history-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-1 py-1 text-left active:opacity-75 transition-opacity"
      >
        <h3 className="text-xs font-bold text-[var(--muted)]">
          История матчей в текущем турнире
        </h3>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--muted)]">
          <span>{matches.length}</span>
          <ChevronDown
            size={15}
            className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {expanded && (
        <div className="space-y-2">
          {matches.map((match) => {
          const isMine = isPlayerMatch(match, myPlayerId);
          const won = isMine ? didPlayerWin(match, myPlayerId) : null;
          const isWaiting = match.status === 'WAITING_CONFIRM';
          const isPlaying = match.status === 'PLAYING';
          const stageLabel =
            match.stage === 'PLAYOFF'
              ? formatBracketSlotLabel(match.bracketSlot) || 'Плей-офф'
              : `Раунд ${match.roundNumber}`;

          const cardCls = isMine
            ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent-text)]/35'
            : 'bg-[var(--card)]';

          const scoreCls =
            won === true
              ? 'bg-[var(--ok-soft)] text-[var(--ok)]'
              : won === false
                ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
                : isWaiting
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                  : isPlaying
                    ? 'bg-[var(--bg)] text-[var(--text)]'
                    : 'bg-[var(--bg)] text-[var(--muted)]';

          return (
            <div
              key={match.id}
              data-testid={isMine ? 'my-tournament-match' : 'tournament-match'}
              className={`${cardCls} rounded-[20px] px-3.5 py-2.5 flex items-center justify-between gap-2.5`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center flex-wrap gap-1.5 text-[11px] text-[var(--muted)]">
                  <span>
                    {stageLabel} · Стол {match.tableNumber}
                  </span>
                  {isMine && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-[10px] font-bold">
                      Ваш матч
                    </span>
                  )}
                  {isPlaying && (
                    <span className="text-[10px] font-bold text-amber-500">· Идёт</span>
                  )}
                  {isWaiting && (
                    <span className="text-[10px] font-bold text-[var(--accent-text)]">· Подтверждение</span>
                  )}
                </div>
                <div className="text-xs font-semibold text-[var(--text)] truncate mt-0.5">
                  {match.team1Label} <span className="text-[var(--muted)]">vs</span> {match.team2Label}
                </div>
              </div>
              <div
                className={`px-3 py-1 rounded-full font-bold text-xs tabular-nums shrink-0 ${scoreCls}`}
              >
                {formatMatchDisplayScore(match)}
              </div>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
};

export const PlayerMatchView: React.FC<Props> = ({
  snapshot,
  onSubmitScore,
  onConfirmScore,
  onRemindConfirm,
  busy,
}) => {
  const { tournament, myCurrentMatch, myPlayerId, players, playoffMatches } = snapshot;
  const unifiedMatches = getUnifiedTournamentMatches(snapshot);
  const [score1, setScore1] = useState(0);
  const [score2, setScore2] = useState(0);
  const [coinFlipResult, setCoinFlipResult] = useState<'Орёл' | 'Решка' | null>(null);
  const [coinShowLabel, setCoinShowLabel] = useState(false);
  const [flipId, setFlipId] = useState(0);
  const coinTimersRef = useRef<number[]>([]);

  useEffect(() => {
    setScore1(0);
    setScore2(0);
  }, [myCurrentMatch?.id, myCurrentMatch?.setsWon1, myCurrentMatch?.setsWon2]);

  useEffect(() => {
    return () => {
      coinTimersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const closeCoinOverlay = () => {
    coinTimersRef.current.forEach((id) => window.clearTimeout(id));
    coinTimersRef.current = [];
    setCoinFlipResult(null);
    setCoinShowLabel(false);
  };

  const handleCoinFlip = () => {
    coinTimersRef.current.forEach((id) => window.clearTimeout(id));
    coinTimersRef.current = [];
    const outcome: 'Орёл' | 'Решка' = Math.random() > 0.5 ? 'Орёл' : 'Решка';
    setFlipId((prev) => prev + 1);
    setCoinFlipResult(outcome);
    setCoinShowLabel(false);

    const t1 = window.setTimeout(() => {
      setCoinShowLabel(true);
      const t2 = window.setTimeout(() => {
        setCoinFlipResult(null);
        setCoinShowLabel(false);
      }, 4000);
      coinTimersRef.current.push(t2);
    }, 4000);
    coinTimersRef.current.push(t1);
  };

  const coinOverlay = coinFlipResult ? (
    <div
      data-testid="coin-flip-overlay"
      onClick={closeCoinOverlay}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-6"
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          if (coinShowLabel) handleCoinFlip();
        }}
        className={`flex flex-col items-center justify-center ${
          coinShowLabel ? 'cursor-pointer' : ''
        }`}
      >
        <RubleCoin
          key={flipId}
          animate
          result={coinFlipResult}
          size={168}
          label={coinShowLabel ? `${coinFlipResult}!` : null}
        />
      </div>
    </div>
  ) : null;

  const coinPillButton = (
    <button
      type="button"
      onClick={handleCoinFlip}
      className="w-full bg-[var(--card)] border border-[var(--border)] rounded-full px-4 py-2.5 flex items-center justify-center gap-2.5 text-[var(--text)] active:scale-[0.98] transition-transform"
    >
      <RubleCoin animate={false} result="Решка" size={26} showShadow={false} />
      <span className="font-bold text-sm">Бросить монетку</span>
    </button>
  );

  if (tournament.status === 'FINISHED') {
    const podium = getPlayoffPodium(playoffMatches);
    const playoffResult = getPlayerPlayoffResult(playoffMatches, myPlayerId);
    const leader = snapshot.leaderboard[0];
    const myRow = myPlayerId
      ? snapshot.leaderboard.find((r) => r.playerId === myPlayerId) || null
      : null;
    const showGroupResult = Boolean(myRow && !(tournament.skipQualification && myRow.games === 0));
    const playoffMedal =
      playoffResult?.place === 1
        ? '🥇'
        : playoffResult?.place === 2
          ? '🥈'
          : playoffResult?.place === 3
            ? '🥉'
            : null;

    return (
      <div className="flex flex-col h-full overflow-y-auto content-dock-pad">
        <div className="p-4 pt-6 pb-8 space-y-4">
          <div className="bg-[var(--card)] rounded-[24px] p-5 text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center mx-auto">
              <CheckCircle2 size={30} />
            </div>
            <h2 className="text-xl font-bold text-[var(--text)]">Турнир завершён!</h2>
            <div className="text-sm font-semibold text-[var(--muted)] truncate">{tournament.name}</div>
            <div className="text-xs text-[var(--muted)]">
              {formatDateRu(tournament.finishedAt ?? tournament.startedAt ?? tournament.createdAt)}
            </div>
          </div>

          {(podium.first || podium.second || podium.third) ? (
            <div className="bg-[var(--card)] rounded-[24px] p-4 space-y-2">
              <div className="text-xs font-bold text-[var(--muted)] px-1">
                Призёры турнира
              </div>
              {podium.first && (
                <div className="bg-[var(--bg)] rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <span className="text-amber-500 font-bold shrink-0">🥇 1 место</span>
                  <span className="font-bold text-[var(--text)] truncate">{podium.first}</span>
                </div>
              )}
              {podium.second && (
                <div className="bg-[var(--bg)] rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--muted)] font-bold shrink-0">🥈 2 место</span>
                  <span className="font-semibold text-[var(--text)] truncate">{podium.second}</span>
                </div>
              )}
              {podium.third && (
                <div className="bg-[var(--bg)] rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <span className="text-amber-500 font-bold shrink-0">🥉 3 место</span>
                  <span className="font-semibold text-[var(--text)] truncate">{podium.third}</span>
                </div>
              )}
            </div>
          ) : leader ? (
            <div className="bg-[var(--card)] rounded-[24px] p-4 text-center text-sm text-[var(--text)]">
              Лидер таблицы: <span className="text-[var(--accent-text)] font-bold">{leader.name}</span> (
              {leader.points} очк.)
            </div>
          ) : null}

          {playoffResult && (
            <div
              data-testid="my-playoff-result-card"
              className={`${
                playoffResult.isPodium ? 'bg-[var(--accent-soft)]' : 'bg-[var(--card)]'
              } rounded-[24px] p-4 space-y-2`}
            >
              <div className="text-xs font-semibold text-[var(--muted)]">Ваш результат в плей-офф</div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {playoffMedal && <span className="text-lg leading-none shrink-0">{playoffMedal}</span>}
                  <span
                    className={`text-sm font-bold truncate ${
                      playoffResult.isPodium ? 'text-[var(--accent-text)]' : 'text-[var(--text)]'
                    }`}
                  >
                    {playoffResult.headline}
                  </span>
                </div>
                {playoffResult.participated && playoffResult.wins + playoffResult.losses > 0 && (
                  <span className="text-xs font-semibold text-[var(--muted)] tabular-nums shrink-0">
                    {playoffResult.wins}–{playoffResult.losses}
                  </span>
                )}
              </div>
            </div>
          )}

          {showGroupResult && myRow && (
            <div
              data-testid="my-group-result-card"
              className="bg-[var(--card)] rounded-[24px] p-4 space-y-2"
            >
              <div className="text-xs font-semibold text-[var(--muted)]">Ваш результат на групповом этапе</div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-base font-bold text-[var(--text)] tabular-nums">#{myRow.rank}</div>
                  <div className="text-[10px] text-[var(--muted)]">Место</div>
                </div>
                <div>
                  <div className="text-base font-bold text-[var(--text)] tabular-nums">{myRow.points}</div>
                  <div className="text-[10px] text-[var(--muted)]">Очки</div>
                </div>
                <div>
                  <div className="text-base font-bold text-[var(--text)] tabular-nums">
                    {myRow.wins}–{myRow.losses ?? Math.max(0, myRow.games - myRow.wins)}
                  </div>
                  <div className="text-[10px] text-[var(--muted)]">Поб–Пор</div>
                </div>
                <div>
                  <div className="text-base font-bold text-[var(--text)] tabular-nums">
                    {myRow.diff > 0 ? `+${myRow.diff}` : myRow.diff}
                  </div>
                  <div className="text-[10px] text-[var(--muted)]">+/-</div>
                </div>
              </div>
            </div>
          )}

          <UnifiedTournamentMatchesFeed matches={unifiedMatches} myPlayerId={myPlayerId} />
        </div>
      </div>
    );
  }

  if (tournament.status === 'REGISTRATION') {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center content-dock-pad">
        <div className="w-14 h-14 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center mb-4">
          <Clock size={28} />
        </div>
        <h2 className="text-xl font-bold text-[var(--text)] mb-2">{tournament.name}</h2>
        <p className="text-[var(--muted)] text-sm max-w-xs">
          Идет регистрация участников ({players.filter((p) => p.isActive).length}).
          Ожидайте старта первого раунда от организатора.
        </p>
      </div>
    );
  }

  if (!myCurrentMatch) {
    return (
      <div className="flex flex-col h-full overflow-y-auto content-dock-pad">
        <div className="p-4 border-b border-[var(--border)] bg-[var(--bg)] flex justify-between items-center sticky top-0 z-10">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[var(--text)] truncate max-w-[230px]">
              {tournament.name}
            </h2>
            <div className="text-xs text-[var(--muted)]">
              {tournament.status === 'PLAYOFF'
                ? `Плей-офф • Раунд ${tournament.currentRound}`
                : `Раунд ${tournament.currentRound}`}
            </div>
          </div>
        </div>

        <div className="px-3.5 py-3 space-y-3">
          <div className="bg-[var(--card)] rounded-[24px] p-5 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--bg)] text-[var(--muted)] flex items-center justify-center mb-3">
              <Coffee size={24} />
            </div>
            <h3 className="text-lg font-bold text-[var(--text)] mb-1">Вы отдыхаете в этом раунде</h3>
            <p className="text-[var(--muted)] text-xs max-w-xs leading-relaxed">
              {myPlayerId
                ? 'Сейчас у вас перерыв или ваш матч уже завершён. Следите за результатами других столов ниже.'
                : 'Вы не зарегистрированы как участник этого турнира, но можете следить за текущими матчами.'}
            </p>
          </div>

          {coinPillButton}

          <UnifiedTournamentMatchesFeed matches={unifiedMatches} myPlayerId={myPlayerId} />
        </div>

        {coinOverlay}
      </div>
    );
  }

  const isWaiting = myCurrentMatch.status === 'WAITING_CONFIRM';
  const iSubmitted = isWaiting && myCurrentMatch.submittedByTeam === myCurrentMatch.myTeam;
  const waitingFromLabel =
    myCurrentMatch.submittedByTeam === 1
      ? myCurrentMatch.team2Label
      : myCurrentMatch.team1Label;

  if (isWaiting && iSubmitted) {
    return (
      <div className="flex flex-col h-full overflow-y-auto content-dock-pad">
        <div className="p-4 space-y-5">
          <div className="bg-[var(--card)] rounded-[24px] p-5 flex flex-col items-center text-center">
            <Clock size={36} className="text-amber-500 mb-3" />
            <h2 className="text-xl font-bold text-[var(--text)] mb-1.5">Ожидаем подтверждения</h2>
            <p className="text-[var(--muted)] text-xs max-w-xs mb-4">
              Отправлено соперникам для подтверждения результата:
            </p>

            <div className="w-full space-y-2 mb-4 text-left">
              <div
                className={`flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 ${
                  myCurrentMatch.myTeam === 1
                    ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent-text)]/35'
                    : 'bg-[var(--bg)]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex -space-x-1.5 shrink-0">
                    {myCurrentMatch.team1Players.map((p) => (
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
                  <div className="min-w-0">
                    <div
                      className={`text-sm truncate ${
                        myCurrentMatch.myTeam === 1 ? 'font-bold text-[var(--accent-text)]' : 'font-semibold text-[var(--text)]'
                      }`}
                    >
                      {myCurrentMatch.team1Label}
                    </div>
                    {myCurrentMatch.myTeam === 1 && (
                      <div className="text-[10px] text-[var(--accent-text)] font-semibold">Ваша команда</div>
                    )}
                  </div>
                </div>
                <div className="text-2xl font-bold text-[var(--text)] shrink-0 min-w-[28px] text-right tabular-nums">
                  {myCurrentMatch.score1}
                </div>
              </div>

              <div
                className={`flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 ${
                  myCurrentMatch.myTeam === 2
                    ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent-text)]/35'
                    : 'bg-[var(--bg)]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex -space-x-1.5 shrink-0">
                    {myCurrentMatch.team2Players.map((p) => (
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
                  <div className="min-w-0">
                    <div
                      className={`text-sm truncate ${
                        myCurrentMatch.myTeam === 2 ? 'font-bold text-[var(--accent-text)]' : 'font-semibold text-[var(--text)]'
                      }`}
                    >
                      {myCurrentMatch.team2Label}
                    </div>
                    {myCurrentMatch.myTeam === 2 && (
                      <div className="text-[10px] text-[var(--accent-text)] font-semibold">Ваша команда</div>
                    )}
                  </div>
                </div>
                <div className="text-2xl font-bold text-[var(--text)] shrink-0 min-w-[28px] text-right tabular-nums">
                  {myCurrentMatch.score2}
                </div>
              </div>
            </div>

            <div className="bg-[var(--accent-soft)] rounded-2xl px-3.5 py-2 text-xs text-[var(--accent-text)] mb-5">
              Ожидается подтверждение от: <span className="font-bold">{waitingFromLabel}</span>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRemindConfirm(myCurrentMatch.id)}
              className="flex items-center gap-2 bg-[var(--bg-3)] text-[var(--text)] px-6 py-3 rounded-full text-sm font-bold active:scale-95 disabled:opacity-50"
            >
              <Bell size={16} className="text-amber-500" />
              {busy ? 'Отправка...' : 'Напомнить еще раз'}
            </button>
          </div>

          <UnifiedTournamentMatchesFeed matches={unifiedMatches} myPlayerId={myPlayerId} />
        </div>
      </div>
    );
  }

  if (isWaiting && !iSubmitted) {
    return (
      <div className="flex flex-col h-full overflow-y-auto content-dock-pad">
        <div className="p-4 space-y-5">
          <div className="bg-[var(--card)] rounded-[24px] p-5 flex flex-col items-center text-center">
            <AlertTriangle size={36} className="text-[var(--accent-text)] mb-3" />
            <h2 className="text-xl font-bold text-[var(--text)] mb-1.5">Подтвердите счет</h2>
            <p className="text-[var(--muted)] text-xs mb-4">
              Соперники указали результат ({myCurrentMatch.stage === 'PLAYOFF' ? 'сет' : 'матч'}):
            </p>

            <div className="w-full space-y-2 mb-5 text-left">
              <div
                className={`flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3 ${
                  myCurrentMatch.myTeam === 1
                    ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent-text)]/35'
                    : 'bg-[var(--bg)]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex -space-x-1.5 shrink-0">
                    {myCurrentMatch.team1Players.map((p) => (
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
                  <div className="min-w-0">
                    <div
                      className={`text-sm truncate ${
                        myCurrentMatch.myTeam === 1 ? 'font-bold text-[var(--accent-text)]' : 'font-semibold text-[var(--text)]'
                      }`}
                    >
                      {myCurrentMatch.team1Label}
                    </div>
                    {myCurrentMatch.myTeam === 1 && (
                      <div className="text-[10px] text-[var(--accent-text)] font-semibold">Ваша команда</div>
                    )}
                  </div>
                </div>
                <div className="text-3xl font-bold text-[var(--text)] shrink-0 min-w-[32px] text-right tabular-nums">
                  {myCurrentMatch.score1}
                </div>
              </div>

              <div
                className={`flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3 ${
                  myCurrentMatch.myTeam === 2
                    ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent-text)]/35'
                    : 'bg-[var(--bg)]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex -space-x-1.5 shrink-0">
                    {myCurrentMatch.team2Players.map((p) => (
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
                  <div className="min-w-0">
                    <div
                      className={`text-sm truncate ${
                        myCurrentMatch.myTeam === 2 ? 'font-bold text-[var(--accent-text)]' : 'font-semibold text-[var(--text)]'
                      }`}
                    >
                      {myCurrentMatch.team2Label}
                    </div>
                    {myCurrentMatch.myTeam === 2 && (
                      <div className="text-[10px] text-[var(--accent-text)] font-semibold">Ваша команда</div>
                    )}
                  </div>
                </div>
                <div className="text-3xl font-bold text-[var(--text)] shrink-0 min-w-[32px] text-right tabular-nums">
                  {myCurrentMatch.score2}
                </div>
              </div>
            </div>

            <div className="flex gap-3 w-full">
              <button
                type="button"
                disabled={busy}
                onClick={() => onConfirmScore(myCurrentMatch.id, 'dispute')}
                className="flex-1 bg-[var(--bg-3)] text-[var(--text)] py-3.5 rounded-full font-bold active:scale-95 disabled:opacity-50"
              >
                {busy ? 'Обработка...' : 'Оспорить'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onConfirmScore(myCurrentMatch.id, 'confirm')}
                className="flex-1 bg-[var(--accent)] text-[var(--on-accent)] py-3.5 rounded-full font-bold active:scale-95 disabled:opacity-50"
              >
                {busy ? 'Обработка...' : 'Подтвердить'}
              </button>
            </div>
          </div>

          <UnifiedTournamentMatchesFeed matches={unifiedMatches} myPlayerId={myPlayerId} />
        </div>
      </div>
    );
  }

  const maxPickerScore =
    myCurrentMatch.stage === 'PLAYOFF'
      ? tournament.playoffWinByTwo
        ? tournament.playoffMaxScore
        : tournament.playoffTargetScore
      : tournament.winByTwo
        ? tournament.maxScore
        : tournament.targetScore;

  const isScoreChanged = score1 > 0 || score2 > 0;
  const stageText =
    myCurrentMatch.stage === 'PLAYOFF'
      ? `Плей-офф • ${formatBracketSlotLabel(myCurrentMatch.bracketSlot)} (Сеты: ${myCurrentMatch.setsWon1}:${myCurrentMatch.setsWon2})`
      : `Раунд ${tournament.currentRound}`;

  return (
    <div className="flex flex-col h-full overflow-y-auto content-dock-pad">
      <div className="px-3.5 py-2.5 border-b border-[var(--border)] flex justify-between items-center gap-2 bg-[var(--bg)] sticky top-0 z-10">
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight text-[var(--text)] truncate">
            {tournament.name}
          </h2>
          <div className="text-xs text-[var(--muted)] truncate">{stageText}</div>
        </div>
        <div className="bg-[var(--accent-soft)] px-3 py-1 rounded-full text-xs font-bold text-[var(--accent-text)] flex items-center shrink-0">
          Стол {myCurrentMatch.tableNumber}
        </div>
      </div>

      <div className="px-3.5 py-3 space-y-2.5">
        <div className="space-y-2">
          {[
            {
              teamNum: 1 as const,
              playersList: myCurrentMatch.team1Players,
              score: score1,
              setScore: setScore1,
            },
            {
              teamNum: 2 as const,
              playersList: myCurrentMatch.team2Players,
              score: score2,
              setScore: setScore2,
            },
          ].map((team, teamIdx) => (
            <React.Fragment key={team.teamNum}>
              {teamIdx === 1 && (
                <div className="text-center text-[var(--muted)] font-bold text-[11px] leading-none tracking-widest">
                  VS
                </div>
              )}
              <div
                className={`px-3.5 py-2.5 rounded-[20px] space-y-2 ${
                  myCurrentMatch.myTeam === team.teamNum
                    ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent-text)]/35'
                    : 'bg-[var(--card)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="flex -space-x-1.5 shrink-0">
                      {team.playersList.map((p, idx) => (
                        <PlayerAvatar
                          key={p.id}
                          avatarUrl={p.avatarUrl}
                          initials={p.initials}
                          name={p.name}
                          isMe={p.id === myPlayerId}
                          size="sm"
                          className={idx === 0 ? 'z-10' : 'z-0'}
                        />
                      ))}
                    </div>
                    <div
                      className="min-w-0 flex-1 truncate text-sm leading-tight"
                      data-testid="team-players-line"
                    >
                      {team.playersList.map((p, idx) => (
                        <React.Fragment key={p.id}>
                          {idx > 0 && (
                            <span className="text-[var(--muted)] font-normal mx-1">·</span>
                          )}
                          <span
                            className={
                              p.id === myPlayerId
                                ? 'font-bold text-[var(--accent-text)]'
                                : 'font-semibold text-[var(--text)]'
                            }
                          >
                            {p.name}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <div
                    className={`text-4xl font-bold tabular-nums leading-none shrink-0 min-w-[36px] text-right pr-1 ${
                      team.score > 0 ? 'text-[var(--accent-text)]' : 'text-[var(--text)]'
                    }`}
                  >
                    {team.score}
                  </div>
                </div>
                <div className="pt-2 border-t border-[var(--border)]">
                  <ScorePickerRow
                    score={team.score}
                    maxScore={maxPickerScore}
                    onChange={team.setScore}
                  />
                </div>
              </div>
            </React.Fragment>
          ))}

          <button
            type="button"
            disabled={busy || !isScoreChanged}
            onClick={() => onSubmitScore(myCurrentMatch.id, score1, score2)}
            className="w-full py-3 rounded-full bg-[var(--accent)] text-[var(--on-accent)] font-bold text-[15px] active:scale-[0.98] transition-transform disabled:opacity-40"
          >
            {busy ? 'Отправка...' : `Сохранить счет: ${score1} : ${score2}`}
          </button>
        </div>

        {coinPillButton}

        <UnifiedTournamentMatchesFeed matches={unifiedMatches} myPlayerId={myPlayerId} />
      </div>

      {coinOverlay}
    </div>
  );
};
