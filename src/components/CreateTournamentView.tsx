import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, BellRing, Heart, RotateCw } from 'lucide-react';
import type { CreateTournamentForm, DypMode, PlayoffFormat, TeamFormat } from '../types';
import { haptic } from '../utils/telegram';
import { BucketsTooltip, ModeInfoTooltip, TOURNAMENT_MODE_CATALOG } from './InfoTooltip';

interface Props {
  defaultName: string;
  onSubmit: (form: CreateTournamentForm) => Promise<void>;
  onCancel?: () => void;
  busy: boolean;
}

export const CreateTournamentView: React.FC<Props> = ({
  defaultName,
  onSubmit,
  onCancel,
  busy,
}) => {
  const [name, setName] = useState(defaultName);
  const [tables, setTables] = useState(2);
  const [autoRounds, setAutoRounds] = useState(true);
  const [dypMode, setDypMode] = useState<DypMode>('monster');
  const [teamFormat, setTeamFormat] = useState<TeamFormat>('pairs');
  const [roundRobinLoops, setRoundRobinLoops] = useState(1);
  const [losLives, setLosLives] = useState(3);
  const [useBuckets, setUseBuckets] = useState(false);

  const [targetScore, setTargetScore] = useState(5);
  const [winByTwo, setWinByTwo] = useState(false);
  const [maxScore, setMaxScore] = useState(7);

  const [playoffSize, setPlayoffSize] = useState(8);
  const [thirdPlaceMatch, setThirdPlaceMatch] = useState(true);
  const [playoffFormat, setPlayoffFormat] = useState<PlayoffFormat>('best_of_3');
  const [playoffTargetScore, setPlayoffTargetScore] = useState(5);
  const [playoffWinByTwo, setPlayoffWinByTwo] = useState(false);
  const [playoffMaxScore, setPlayoffMaxScore] = useState(7);

  const [longMatchAlertMin, setLongMatchAlertMin] = useState(15);
  const [scoreReminderMin, setScoreReminderMin] = useState(3);
  const [showAdvancedRules, setShowAdvancedRules] = useState(false);

  const selectedModeMeta =
    TOURNAMENT_MODE_CATALOG.find((m) => m.key === dypMode) || TOURNAMENT_MODE_CATALOG[0];
  const isElimination = dypMode === 'elimination';
  const showBucketsOption = selectedModeMeta.supportsBuckets && teamFormat === 'pairs';
  const playoffSizesList = teamFormat === 'single' ? [2, 4, 8, 16, 32] : [4, 8, 16, 32];

  const handleSelectMode = (mode: DypMode) => {
    haptic('light');
    setDypMode(mode);
    const meta = TOURNAMENT_MODE_CATALOG.find((m) => m.key === mode);
    if (meta && !meta.supportsSingles) {
      setTeamFormat('pairs');
    }
    if (meta && !meta.supportsBuckets) {
      setUseBuckets(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    haptic('success');
    await onSubmit({
      name: name.trim() || defaultName,
      tables,
      autoRounds: isElimination ? false : autoRounds,
      dypMode,
      teamFormat: selectedModeMeta.supportsSingles ? teamFormat : 'pairs',
      roundRobinLoops: dypMode === 'round_robin' ? roundRobinLoops : 1,
      losLives: dypMode === 'last_one_standing' ? losLives : 3,
      skipQualification: isElimination,
      longMatchAlertMin,
      scoreReminderMin,
      useBuckets: showBucketsOption ? useBuckets : false,
      targetScore,
      winByTwo,
      maxScore: winByTwo ? Math.max(targetScore, maxScore) : targetScore,
      playoffSize,
      thirdPlaceMatch,
      playoffFormat,
      playoffTargetScore,
      playoffWinByTwo,
      playoffMaxScore: playoffWinByTwo ? Math.max(playoffTargetScore, playoffMaxScore) : playoffTargetScore,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-24">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            Название турнира
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={defaultName}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-3.5 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:border-[#2ea6ff]"
          />
        </div>

        {/* Режим турнира карточками как в Kickertool */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[var(--muted)]">
              Формат турнира
            </label>
            <span className="text-[11px] text-[var(--muted)]">Нажмите (?) для подробностей</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {TOURNAMENT_MODE_CATALOG.map((m) => {
              const active = dypMode === m.key;
              return (
                <div
                  key={m.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectMode(m.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectMode(m.key);
                    }
                  }}
                  className={`relative rounded-2xl border p-3 text-left transition-all cursor-pointer select-none flex flex-col justify-between gap-1.5 ${
                    active
                      ? 'bg-[#2ea6ff]/12 border-[#2ea6ff] shadow-[0_0_0_1px_rgba(46,166,255,0.3)]'
                      : 'bg-[var(--bg)] border-[var(--border)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <span className="text-lg leading-none">{m.emoji}</span>
                    <ModeInfoTooltip mode={m} />
                  </div>
                  <div>
                    <div className={`text-xs font-bold leading-tight ${active ? 'text-[#2ea6ff]' : 'text-[var(--text)]'}`}>
                      {m.title}
                    </div>
                    <p className="text-[10px] leading-snug text-[var(--muted)] mt-1 line-clamp-2">
                      {m.shortDesc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Одиночный / Парный формат (где поддерживается) */}
        {selectedModeMeta.supportsSingles && (
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3 space-y-2">
            <div className="text-xs font-medium text-[var(--text)]">Формат участников</div>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['pairs', '👥 Пары (2×2)'],
                  ['single', '👤 Одиночный (1×1)'],
                ] as Array<[TeamFormat, string]>
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    haptic('light');
                    setTeamFormat(val);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                    teamFormat === val
                      ? 'bg-[#2ea6ff] text-white border-[#2ea6ff]'
                      : 'bg-[var(--card)] text-[var(--muted)] border-[var(--border)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Круговой турнир: 1 или 2 круга */}
        {dypMode === 'round_robin' && (
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--text)]">
              <RotateCw size={14} className="text-[#2ea6ff]" />
              Количество кругов
            </div>
            <div className="flex gap-1.5">
              {[1, 2].map((loops) => (
                <button
                  key={loops}
                  type="button"
                  onClick={() => setRoundRobinLoops(loops)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                    roundRobinLoops === loops
                      ? 'bg-[#2ea6ff] text-white border-[#2ea6ff]'
                      : 'bg-[var(--card)] text-[var(--muted)] border-[var(--border)]'
                  }`}
                >
                  {loops === 1 ? '1 круг' : '2 круга'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Last One Standing: жизни на старте */}
        {dypMode === 'last_one_standing' && (
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--text)]">
              <Heart size={14} className="text-red-500" />
              Жизней на старте
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setLosLives(n)}
                  className={`w-8 h-8 rounded-xl text-xs font-bold border ${
                    losLives === n
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-[var(--card)] text-[var(--muted)] border-[var(--border)]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Количество столов */}
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            Количество столов: <span className="text-[var(--text)] font-bold">{tables}</span>
          </label>
          <div className="grid grid-cols-6 gap-1.5">
            {[1, 2, 3, 4, 6, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  haptic('light');
                  setTables(n);
                }}
                className={`py-2 rounded-2xl text-xs font-semibold border transition-all ${
                  tables === n
                    ? 'bg-[#2ea6ff] text-white border-[#2ea6ff]'
                    : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Авто-раунды (скрыты для чистого плей-офф) */}
        {!isElimination && (
          <label className="flex items-center justify-between py-1 cursor-pointer">
            <div>
              <div className="text-sm font-medium text-[var(--text)]">Автоматические раунды</div>
              <div className="text-xs text-[var(--muted)]">
                Следующий раунд создается сам после завершения всех игр
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoRounds}
              onChange={(e) => setAutoRounds(e.target.checked)}
              className="w-5 h-5 accent-[#2ea6ff] rounded"
            />
          </label>
        )}

        {/* Корзины A/B */}
        {showBucketsOption && (
          <div className="flex items-center justify-between py-1 gap-3">
            <div>
              <div className="text-sm font-medium text-[var(--text)] flex items-center gap-1.5">
                Корзины A / B (баланс по силе)
                <BucketsTooltip />
              </div>
              <div className="text-xs text-[var(--muted)]">
                Ставит сильного игрока (A) в пару к новичку (B)
              </div>
            </div>
            <input
              type="checkbox"
              checked={useBuckets}
              onChange={(e) => setUseBuckets(e.target.checked)}
              className="w-5 h-5 accent-[#2ea6ff] rounded cursor-pointer shrink-0"
            />
          </div>
        )}
      </div>

      {/* Квалификация + Доп. настройки */}
      {!isElimination && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
            Правила матчей (квалификация)
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-[var(--text)]">Голов до победы</span>
            <div className="flex gap-1.5">
              {[3, 5, 7, 10].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setTargetScore(v);
                    if (maxScore < v) setMaxScore(v + 2);
                  }}
                  className={`px-3 py-1.5 rounded-2xl text-xs font-semibold border ${
                    targetScore === v
                      ? 'bg-[#2ea6ff] text-white border-[#2ea6ff]'
                      : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="text-sm text-[var(--text)]">Баланс (+2 мяча)</div>
              <div className="text-xs text-[var(--muted)]">При ничьей игра идет до разницы в 2 гола</div>
            </div>
            <input
              type="checkbox"
              checked={winByTwo}
              onChange={(e) => setWinByTwo(e.target.checked)}
              className="w-5 h-5 accent-[#2ea6ff]"
            />
          </label>

          {winByTwo && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text)]">Максимум голов (лимит)</span>
              <input
                type="number"
                min={targetScore}
                max={25}
                value={maxScore}
                onChange={(e) => setMaxScore(Math.max(targetScore, Number(e.target.value) || targetScore))}
                className="w-20 bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-2.5 py-1.5 text-center text-sm text-[var(--text)]"
              />
            </div>
          )}
        </div>
      )}

      {/* Настройки плей-офф */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-4 space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
          Плей-офф
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-[var(--text)]">Участников в сетке</span>
          <div className="flex gap-1.5 flex-wrap justify-end">
            {playoffSizesList.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPlayoffSize(n)}
                className={`px-2.5 py-1.5 rounded-2xl text-xs font-semibold border ${
                  playoffSize === n
                    ? 'bg-[#2ea6ff] text-white border-[#2ea6ff]'
                    : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'
                }`}
              >
                Топ-{n}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm text-[var(--text)]">Матч за 3-е место</span>
          <input
            type="checkbox"
            checked={thirdPlaceMatch}
            onChange={(e) => setThirdPlaceMatch(e.target.checked)}
            className="w-5 h-5 accent-[#2ea6ff]"
          />
        </label>

        <div>
          <span className="block text-sm mb-1.5 text-[var(--text)]">Формат серии</span>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ['best_of_1', '1 сет'],
                ['best_of_3', 'До 2 побед'],
                ['best_of_5', 'До 3 побед'],
              ] as Array<[PlayoffFormat, string]>
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setPlayoffFormat(val)}
                className={`py-2 rounded-2xl text-xs font-semibold border ${
                  playoffFormat === val
                    ? 'bg-[#2ea6ff] text-white border-[#2ea6ff]'
                    : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-[var(--text)]">Голов в сете плей-офф</span>
          <div className="flex gap-1.5">
            {[3, 5, 7].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setPlayoffTargetScore(v);
                  if (playoffMaxScore < v) setPlayoffMaxScore(v + 2);
                }}
                className={`px-3 py-1.5 rounded-2xl text-xs font-semibold border ${
                  playoffTargetScore === v
                    ? 'bg-[#2ea6ff] text-white border-[#2ea6ff]'
                    : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm text-[var(--text)]">Баланс в плей-офф (+2 мяча)</span>
          <input
            type="checkbox"
            checked={playoffWinByTwo}
            onChange={(e) => setPlayoffWinByTwo(e.target.checked)}
            className="w-5 h-5 accent-[#2ea6ff]"
          />
        </label>

        {playoffWinByTwo && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--text)]">Лимит голов (плей-офф)</span>
            <input
              type="number"
              min={playoffTargetScore}
              max={25}
              value={playoffMaxScore}
              onChange={(e) =>
                setPlayoffMaxScore(Math.max(playoffTargetScore, Number(e.target.value) || playoffTargetScore))
              }
              className="w-20 bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-2.5 py-1.5 text-center text-sm text-[var(--text)]"
            />
          </div>
        )}
      </div>

      {/* Уведомления о долгих матчах */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-4 space-y-2.5">
        <button
          type="button"
          onClick={() => setShowAdvancedRules((v) => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
            <BellRing size={13} className="text-amber-500" />
            Таймер долгого матча
          </span>
          {showAdvancedRules ? (
            <ChevronUp size={16} className="text-[var(--muted)]" />
          ) : (
            <ChevronDown size={16} className="text-[var(--muted)]" />
          )}
        </button>

        {showAdvancedRules && (
          <div className="space-y-2.5 pt-1 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--muted)]">Сигнал, если матч дольше (мин)</span>
              <input
                type="number"
                min={3}
                max={120}
                value={longMatchAlertMin}
                onChange={(e) => setLongMatchAlertMin(Math.max(3, Number(e.target.value) || 15))}
                className="w-16 bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-2 py-1 text-center font-bold text-[var(--text)]"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[var(--muted)]">Повторное напоминание о счёте (мин)</span>
              <input
                type="number"
                min={1}
                max={30}
                value={scoreReminderMin}
                onChange={(e) => setScoreReminderMin(Math.max(1, Number(e.target.value) || 3))}
                className="w-16 bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-2 py-1 text-center font-bold text-[var(--text)]"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2.5 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-3xl border border-[var(--border)] text-sm font-semibold text-[var(--muted)]"
          >
            Назад
          </button>
        )}
        <button
          type="submit"
          disabled={busy}
          className="flex-[2] py-3.5 rounded-3xl bg-[#2ea6ff] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#2ea6ff]/20 active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          Создать турнир
        </button>
      </div>
    </form>
  );
};
