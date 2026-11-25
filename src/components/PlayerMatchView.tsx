import React, { useState, useEffect, useRef } from 'react';
import { Clock, AlertTriangle, Coffee, Trophy, Bell, Medal, Home } from 'lucide-react';
import type { MatchItem, TournamentSnapshot } from '../types';
import { formatDateRu, getPlayoffPodium } from '../utils/date';
import { PlayerAvatar } from './PlayerAvatar';
import { RubleCoin } from './RubleCoin';
import { ScorePickerRow } from './ScorePickerRow';
import { MatchCard, formatBracketSlotLabel } from './MatchCard';

interface Props {
  snapshot: TournamentSnapshot;
  onSubmitScore: (matchId: number, score1: number, score2: number) => Promise<void>;
  onConfirmScore: (matchId: number, action: 'confirm' | 'dispute') => Promise<void>;
  onRemindConfirm: (matchId: number) => Promise<void>;
  onOpenTable?: () => void;
  onGoHome?: () => void;
  busy: boolean;
}

const CurrentMatchesFeed: React.FC<{
  matches: MatchItem[];
  title: string;
  myPlayerId: number | null;
}> = ({ matches, title, myPlayerId }) => {
  if (matches.length === 0) return null;
  return (
    <div className="space-y-2.5 pt-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold text-[var(--muted)]">{title}</h3>
        <span className="text-[11px] font-semibold text-[var(--muted)]">
          {matches.filter((m) => m.status === 'FINISHED').length}/{matches.length} завершено
        </span>
      </div>
      <div className="space-y-2.5">
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} myPlayerId={myPlayerId} />
        ))}
      </div>
    </div>
  );
};

export const PlayerMatchView: React.FC<Props> = ({
  snapshot,
  onSubmitScore,
  onConfirmScore,
  onRemindConfirm,
  onOpenTable,
  onGoHome,
  busy,
}) => {
  const { tournament, myCurrentMatch, myPlayerId, players, currentRoundMatches, playoffMatches } =
    snapshot;
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

  if (tournament.status === 'FINISHED') {
    const podium = getPlayoffPodium(playoffMatches);
    const leader = snapshot.leaderboard[0];
    const myRow = myPlayerId
      ? snapshot.leaderboard.find((r) => r.playerId === myPlayerId) || null
      : null;

    return (
      <div className="flex flex-col h-full overflow-y-auto content-dock-pad">
        <div className="p-4 pt-6 pb-8 space-y-4">
          <div className="bg-[var(--card)] rounded-[24px] p-5 text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto">
              <Medal size={30} />
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

          {myRow && (
            <div className="bg-[var(--accent-soft)] rounded-[24px] p-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-[var(--muted)]">Ваш результат</div>
                <div className="font-bold text-base text-[var(--text)] mt-0.5">
                  {myRow.rank} место в рейтинге
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-[var(--accent-text)]">{myRow.points} очк.</div>
                <div className="text-[11px] text-[var(--muted)]">
                  {myRow.wins} поб. / {myRow.games} игр
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2.5 pt-1">
            {onOpenTable && (
              <button
                type="button"
                onClick={onOpenTable}
                className="btn btn-primary w-full py-3.5 rounded-full font-bold text-sm"
              >
                <Trophy size={16} /> Открыть таблицу и сетку
              </button>
            )}
            {onGoHome && (
              <button
                type="button"
                onClick={onGoHome}
                className="btn btn-ghost w-full py-3.5 rounded-full font-semibold text-sm"
              >
                <Home size={16} /> На главный экран
              </button>
            )}
          </div>
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

  const otherMatches = myCurrentMatch
    ? currentRoundMatches.filter((m) => m.id !== myCurrentMatch.id)
    : currentRoundMatches;

  const roundFeedTitle =
    tournament.status === 'PLAYOFF'
      ? myCurrentMatch
        ? 'Другие матчи плей-офф'
        : `Матчи плей-офф (Раунд ${tournament.currentRound})`
      : myCurrentMatch
        ? `Другие матчи раунда ${tournament.currentRound}`
        : `Матчи раунда ${tournament.currentRound}`;

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

        <div className="p-4 space-y-5">
          <div className="bg-[var(--card)] rounded-[24px] p-5 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--bg)] text-[var(--muted)] flex items-center justify-center mb-3">
              <Coffee size={24} />
            </div>
            <h3 className="text-lg font-bold text-[var(--text)] mb-1">Вы отдыхаете в этом раунде</h3>
            <p className="text-[var(--muted)] text-xs max-w-xs leading-relaxed">
              {myPlayerId
                ? 'Сейчас у вас перерыв (Bye) или ваш матч уже завершён. Следите за результатами других столов ниже.'
                : 'Вы не зарегистрированы как участник этого турнира, но можете следить за текущими матчами.'}
            </p>
          </div>

          <CurrentMatchesFeed
            matches={otherMatches}
            title={roundFeedTitle}
            myPlayerId={myPlayerId}
          />
        </div>
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

          <CurrentMatchesFeed
            matches={otherMatches}
            title={roundFeedTitle}
            myPlayerId={myPlayerId}
          />
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

          <CurrentMatchesFeed
            matches={otherMatches}
            title={roundFeedTitle}
            myPlayerId={myPlayerId}
          />
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
      <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg)] sticky top-0 z-10">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-[var(--text)] truncate max-w-[220px]">
            {tournament.name}
          </h2>
          <div className="text-xs text-[var(--muted)]">{stageText}</div>
        </div>
        <div className="bg-[var(--accent-soft)] px-3.5 py-1.5 rounded-full text-xs font-bold text-[var(--accent-text)] flex items-center shrink-0">
          Стол {myCurrentMatch.tableNumber}
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="space-y-3">
          {/* Team 1 */}
          <div
            className={`p-4 rounded-[24px] space-y-3 ${
              myCurrentMatch.myTeam === 1
                ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent-text)]/35'
                : 'bg-[var(--card)]'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex -space-x-2 shrink-0">
                  {myCurrentMatch.team1Players.map((p, idx) => (
                    <PlayerAvatar
                      key={p.id}
                      avatarUrl={p.avatarUrl}
                      initials={p.initials}
                      name={p.name}
                      isMe={p.id === myPlayerId}
                      size="md"
                      className={idx === 0 ? 'z-10' : 'z-0'}
                    />
                  ))}
                </div>
                <div className="flex flex-col min-w-0">
                  {myCurrentMatch.team1Players.map((p) => (
                    <span
                      key={p.id}
                      className={`truncate ${
                        p.id === myPlayerId
                          ? 'font-bold text-sm text-[var(--accent-text)]'
                          : 'font-semibold text-xs text-[var(--text)]'
                      }`}
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
              <div
                className={`text-4xl font-bold tabular-nums leading-none shrink-0 min-w-[36px] text-right pr-1 ${
                  score1 > 0 ? 'text-[var(--accent-text)]' : 'text-[var(--text)]'
                }`}
              >
                {score1}
              </div>
            </div>
            <div className="pt-3 border-t border-[var(--border)]">
              <ScorePickerRow score={score1} maxScore={maxPickerScore} onChange={setScore1} />
            </div>
          </div>

          <div className="text-center text-[var(--muted)] font-bold text-xs tracking-widest">
            VS
          </div>

          {/* Team 2 */}
          <div
            className={`p-4 rounded-[24px] space-y-3 ${
              myCurrentMatch.myTeam === 2
                ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent-text)]/35'
                : 'bg-[var(--card)]'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex -space-x-2 shrink-0">
                  {myCurrentMatch.team2Players.map((p, idx) => (
                    <PlayerAvatar
                      key={p.id}
                      avatarUrl={p.avatarUrl}
                      initials={p.initials}
                      name={p.name}
                      isMe={p.id === myPlayerId}
                      size="md"
                      className={idx === 0 ? 'z-10' : 'z-0'}
                    />
                  ))}
                </div>
                <div className="flex flex-col min-w-0">
                  {myCurrentMatch.team2Players.map((p) => (
                    <span
                      key={p.id}
                      className={`truncate ${
                        p.id === myPlayerId
                          ? 'font-bold text-sm text-[var(--accent-text)]'
                          : 'font-semibold text-xs text-[var(--text)]'
                      }`}
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
              <div
                className={`text-4xl font-bold tabular-nums leading-none shrink-0 min-w-[36px] text-right pr-1 ${
                  score2 > 0 ? 'text-[var(--accent-text)]' : 'text-[var(--text)]'
                }`}
              >
                {score2}
              </div>
            </div>
            <div className="pt-3 border-t border-[var(--border)]">
              <ScorePickerRow score={score2} maxScore={maxPickerScore} onChange={setScore2} />
            </div>
          </div>

          <button
            type="button"
            disabled={busy || !isScoreChanged}
            onClick={() => onSubmitScore(myCurrentMatch.id, score1, score2)}
            className="w-full py-3.5 rounded-full bg-[var(--accent)] text-[var(--on-accent)] font-bold text-[15px] active:scale-[0.98] transition-transform disabled:opacity-40"
          >
            {busy ? 'Отправка...' : `Сохранить счет: ${score1} : ${score2}`}
          </button>
        </div>

        {/* 3D Russian Ruble Coin Flip */}
        <div className="flex flex-col items-center justify-center py-2">
          {coinFlipResult ? (
            <div
              onClick={coinShowLabel ? handleCoinFlip : undefined}
              className={`flex flex-col items-center justify-center gap-2 ${
                coinShowLabel ? 'cursor-pointer' : ''
              }`}
            >
              <RubleCoin key={flipId} animate result={coinFlipResult} size={112} />
              <div className="h-8 flex items-center justify-center">
                {coinShowLabel && (
                  <div className="text-xl font-bold text-amber-500 tracking-wide animate-fade-slide-up">
                    {coinFlipResult}!
                  </div>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCoinFlip}
              className="bg-[var(--card)] border border-[var(--border)] rounded-full px-6 py-2.5 flex items-center justify-center gap-3 text-[var(--text)] active:scale-95 transition-colors duration-150 ease-out"
            >
              <div>
                <RubleCoin animate={false} result="Решка" size={36} />
              </div>
              <span className="font-bold text-sm">Бросить монетку</span>
            </button>
          )}
        </div>

        <CurrentMatchesFeed
          matches={otherMatches}
          title={roundFeedTitle}
          myPlayerId={myPlayerId}
        />
      </div>
    </div>
  );
};
