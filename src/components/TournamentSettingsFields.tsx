import React, { useEffect, useState } from 'react';
import { BellRing, ChevronDown, ChevronUp, Heart, Minus, Plus, RotateCw } from 'lucide-react';
import type { DypMode, PlayoffFormat, TeamFormat } from '../types';
import { haptic } from '../utils/telegram';
import { BucketsTooltip, ModeInfoTooltip, TOURNAMENT_MODE_CATALOG } from './InfoTooltip';

export interface TournamentSettingsState {
  name: string;
  tablesCount: number;
  disabledTables: number[];
  autoRounds: boolean;
  dypMode: DypMode;
  teamFormat: TeamFormat;
  roundRobinLoops: number;
  losLives: number;
  useBuckets: boolean;
  targetScore: number;
  winByTwo: boolean;
  maxScore: number;
  playoffSize: number;
  thirdPlaceMatch: boolean;
  playoffFormat: PlayoffFormat;
  playoffTargetScore: number;
  playoffWinByTwo: boolean;
  playoffMaxScore: number;
  longMatchAlertMin: number;
  scoreReminderMin: number;
}

interface RadioCircleProps {
  selected: boolean;
  accent?: 'blue' | 'red' | 'green';
}

/** Визуальный индикатор радиокнопки. */
export const RadioCircle: React.FC<RadioCircleProps> = ({ selected, accent = 'blue' }) => {
  const borderClass = selected
    ? accent === 'red'
      ? 'border-red-500'
      : accent === 'green'
        ? 'border-emerald-500'
        : 'border-[#2ea6ff]'
    : 'border-[var(--border-strong)]';
  const dotClass =
    accent === 'red' ? 'bg-red-500' : accent === 'green' ? 'bg-emerald-500' : 'bg-[#2ea6ff]';

  return (
    <span
      aria-hidden="true"
      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${borderClass}`}
    >
      {selected && <span className={`w-2 h-2 rounded-full ${dotClass}`} />}
    </span>
  );
};

interface NumericStepperInputProps {
  id: string;
  value: number;
  min: number;
  max: number;
  fallback: number;
  disabled?: boolean;
  ariaLabel: string;
  onCommit: (next: number) => void;
}

/** Числовое поле с кнопками -/+ и свободным вводом цифр без сброса при наборе. */
const NumericStepperInput: React.FC<NumericStepperInputProps> = ({
  id,
  value,
  min,
  max,
  fallback,
  disabled = false,
  ariaLabel,
  onCommit,
}) => {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const clampValue = (num: number) => Math.max(min, Math.min(max, num));

  const stepBy = (delta: number) => {
    if (disabled) return;
    haptic('light');
    const next = clampValue(value + delta);
    setDraft(String(next));
    onCommit(next);
  };

  return (
    <div className="inline-flex items-center gap-1 bg-[var(--bg)] border border-[var(--border)] rounded-full p-1">
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => stepBy(-1)}
        aria-label={`Уменьшить ${ariaLabel}`}
        className="w-7 h-7 rounded-full bg-[var(--bg-3)] text-[var(--text)] flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40"
      >
        <Minus size={13} />
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={ariaLabel}
        disabled={disabled}
        value={draft}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const digitsOnly = e.target.value.replace(/\D+/g, '');
          setDraft(digitsOnly);
          if (digitsOnly !== '') {
            const parsed = Number(digitsOnly);
            if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
              onCommit(parsed);
            }
          }
        }}
        onBlur={() => {
          const parsed = draft === '' ? fallback : Number(draft);
          const clamped = clampValue(Number.isFinite(parsed) ? parsed : fallback);
          setDraft(String(clamped));
          onCommit(clamped);
        }}
        className="w-11 bg-transparent text-center text-sm font-bold text-[var(--text)] focus:outline-none disabled:opacity-60 tabular-nums"
      />
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => stepBy(1)}
        aria-label={`Увеличить ${ariaLabel}`}
        className="w-7 h-7 rounded-full bg-[var(--bg-3)] text-[var(--text)] flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40"
      >
        <Plus size={13} />
      </button>
    </div>
  );
};

interface BooleanToggleProps {
  label: React.ReactNode;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Классический зелёный тумблер переключения (вкл / выкл) для настроек турнира. */
export const BooleanToggleRow: React.FC<BooleanToggleProps> = ({
  label,
  description,
  value,
  onChange,
  disabled = false,
  ariaLabel,
}) => {
  const computedLabel = ariaLabel || (typeof label === 'string' ? label : 'Переключатель режима');

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--text)] flex items-center gap-1.5">
          {label}
        </div>
        {description && <div className="text-xs text-[var(--muted)] mt-0.5">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={computedLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          haptic('light');
          onChange(!value);
        }}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors duration-200 active:scale-95 disabled:opacity-50 ${
          value
            ? 'bg-emerald-500'
            : 'bg-[var(--bg-3)] ring-1 ring-inset ring-[var(--border-strong)]'
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            value ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};

export interface TournamentCardProps {
  value: TournamentSettingsState;
  onChange: (patch: Partial<TournamentSettingsState>) => void;
  namePlaceholder?: string;
  disabled?: boolean;
  canEditFormat?: boolean;
  canEditPlayoff?: boolean;
  showDisabledTables?: boolean;
}

/** Карточка названия и формата турнира (режим, 1×1/2×2, круги, жизни). */
export const TournamentFormatCard: React.FC<TournamentCardProps> = ({
  value,
  onChange,
  namePlaceholder = 'Название турнира',
  disabled = false,
  canEditFormat = true,
}) => {
  const selectedModeMeta =
    TOURNAMENT_MODE_CATALOG.find((m) => m.key === value.dypMode) || TOURNAMENT_MODE_CATALOG[0];

  const handleSelectMode = (mode: DypMode) => {
    if (!canEditFormat || disabled) return;
    haptic('light');
    const meta = TOURNAMENT_MODE_CATALOG.find((m) => m.key === mode);
    const nextPatch: Partial<TournamentSettingsState> = { dypMode: mode };
    if (meta && !meta.supportsSingles) {
      nextPatch.teamFormat = 'pairs';
      if (value.playoffSize === 2) {
        nextPatch.playoffSize = 4;
      }
    }
    if (meta && !meta.supportsBuckets) {
      nextPatch.useBuckets = false;
    }
    onChange(nextPatch);
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-4 space-y-4">
      <div>
        <label
          htmlFor="tournament-name-input"
          className="block text-xs font-medium text-[var(--muted)] mb-1.5"
        >
          Название турнира
        </label>
        <input
          id="tournament-name-input"
          type="text"
          disabled={disabled}
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={namePlaceholder}
          className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-3.5 py-2.5 text-sm text-[var(--text)] caret-[var(--accent-text)] focus:outline-none focus:border-[#2ea6ff] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-60"
        />
      </div>

      {/* Режим турнира карточками с радиоиндикатором */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-[var(--muted)]">Формат турнира</span>
          <span className="text-[11px] text-[var(--muted)]">Нажмите (?) для подробностей</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {TOURNAMENT_MODE_CATALOG.map((m) => {
            const active = value.dypMode === m.key;
            return (
              <div
                key={m.key}
                role="button"
                aria-pressed={active}
                aria-disabled={!canEditFormat || disabled}
                tabIndex={canEditFormat && !disabled ? 0 : -1}
                onClick={() => handleSelectMode(m.key)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && canEditFormat && !disabled) {
                    e.preventDefault();
                    handleSelectMode(m.key);
                  }
                }}
                className={`relative rounded-2xl border p-3 text-left transition-colors duration-150 ease-out select-none flex flex-col justify-between gap-1.5 ${
                  canEditFormat && !disabled ? 'cursor-pointer' : 'opacity-75 cursor-not-allowed'
                } ${
                  active
                    ? 'bg-[#2ea6ff]/12 border-[#2ea6ff] ring-1 ring-[#2ea6ff]/30'
                    : 'bg-[var(--bg)] border-[var(--border)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <RadioCircle selected={active} />
                    <span className="text-lg leading-none">{m.emoji}</span>
                  </div>
                  <ModeInfoTooltip mode={m} />
                </div>
                <div>
                  <div
                    className={`text-xs font-bold leading-tight ${
                      active ? 'text-[#2ea6ff]' : 'text-[var(--text)]'
                    }`}
                  >
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

      {/* Одиночный / Парный формат */}
      {selectedModeMeta.supportsSingles && (
        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3 space-y-2">
          <div className="text-xs font-medium text-[var(--text)]">Формат участников</div>
          <div role="radiogroup" aria-label="Формат участников" className="grid grid-cols-2 gap-2">
            {(
              [
                ['pairs', 'Пары (2×2)'],
                ['single', 'Одиночный (1×1)'],
              ] as Array<[TeamFormat, string]>
            ).map(([val, label]) => {
              const selected = value.teamFormat === val;
              return (
                <button
                  key={val}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled || !canEditFormat}
                  onClick={() => {
                    haptic('light');
                    const patch: Partial<TournamentSettingsState> = { teamFormat: val };
                    if (val === 'pairs' && value.playoffSize === 2) {
                      patch.playoffSize = 4;
                    }
                    onChange(patch);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors duration-150 ease-out inline-flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                    selected
                      ? 'bg-[#2ea6ff]/12 text-[#2ea6ff] border-[#2ea6ff]'
                      : 'bg-[var(--card)] text-[var(--muted)] border-[var(--border)]'
                  }`}
                >
                  <RadioCircle selected={selected} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Круговой турнир: 1 или 2 круга */}
      {value.dypMode === 'round_robin' && (
        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--text)]">
            <RotateCw size={14} className="text-[#2ea6ff]" />
            Количество кругов
          </div>
          <div role="radiogroup" aria-label="Количество кругов" className="flex gap-1.5">
            {[1, 2].map((loops) => {
              const selected = value.roundRobinLoops === loops;
              return (
                <button
                  key={loops}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => {
                    haptic('light');
                    onChange({ roundRobinLoops: loops });
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border inline-flex items-center gap-1.5 disabled:opacity-50 ${
                    selected
                      ? 'bg-[#2ea6ff]/12 text-[#2ea6ff] border-[#2ea6ff]'
                      : 'bg-[var(--card)] text-[var(--muted)] border-[var(--border)]'
                  }`}
                >
                  <RadioCircle selected={selected} />
                  <span>{loops === 1 ? '1 круг' : '2 круга'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Last One Standing: жизни на старте */}
      {value.dypMode === 'last_one_standing' && (
        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--text)]">
            <Heart size={14} className="text-red-500" />
            Жизней на старте
          </div>
          <div role="radiogroup" aria-label="Жизней на старте" className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => {
              const selected = value.losLives === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => {
                    haptic('light');
                    onChange({ losLives: n });
                  }}
                  className={`w-8 h-8 rounded-xl text-xs font-bold border disabled:opacity-50 ${
                    selected
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-[var(--card)] text-[var(--muted)] border-[var(--border)]'
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/** Карточка количества столов и временного отключения столов. */
export const TournamentTablesCard: React.FC<TournamentCardProps> = ({
  value,
  onChange,
  disabled = false,
  showDisabledTables = false,
}) => {
  const handleTablesCountChange = (next: number) => {
    const clamped = Math.max(1, Math.min(20, next));
    const filteredDisabled = value.disabledTables.filter((n) => n >= 1 && n <= clamped);
    onChange({
      tablesCount: clamped,
      disabledTables: filteredDisabled.length >= clamped ? [] : filteredDisabled,
    });
  };

  const toggleDisabledTable = (tableNum: number) => {
    haptic('light');
    const isOff = value.disabledTables.includes(tableNum);
    if (isOff) {
      onChange({ disabledTables: value.disabledTables.filter((n) => n !== tableNum) });
      return;
    }
    const nextDisabled = [...value.disabledTables, tableNum];
    if (nextDisabled.length >= value.tablesCount) {
      return;
    }
    onChange({ disabledTables: nextDisabled });
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--muted)]">Количество столов</span>
        <span className="text-sm font-bold text-[var(--text)]">{value.tablesCount}</span>
      </div>
      <div role="radiogroup" aria-label="Количество столов" className="grid grid-cols-6 gap-1.5">
        {[1, 2, 3, 4, 6, 8].map((n) => {
          const selected = value.tablesCount === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => {
                haptic('light');
                handleTablesCountChange(n);
              }}
              className={`py-2 rounded-2xl text-xs font-semibold border transition-colors duration-150 ease-out disabled:opacity-50 ${
                selected
                  ? 'bg-[#2ea6ff] text-white border-[#2ea6ff]'
                  : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>

      {showDisabledTables && value.tablesCount > 1 && (
        <div className="pt-1">
          <div className="text-[11px] text-[var(--muted)] mb-1.5">
            Активные столы (нажмите, чтобы временно отключить стол)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: value.tablesCount }, (_, i) => i + 1).map((tNum) => {
              const isOff = value.disabledTables.includes(tNum);
              return (
                <button
                  key={tNum}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleDisabledTable(tNum)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors active:scale-95 disabled:opacity-50 ${
                    isOff
                      ? 'bg-red-500/10 border-red-500/30 text-red-500 line-through'
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  Стол {tNum}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/** Карточка правил квалификации, авто-раундов и корзин A/B. */
export const TournamentQualificationCard: React.FC<TournamentCardProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const selectedModeMeta =
    TOURNAMENT_MODE_CATALOG.find((m) => m.key === value.dypMode) || TOURNAMENT_MODE_CATALOG[0];
  const effectiveTeamFormat: TeamFormat = selectedModeMeta.supportsSingles
    ? value.teamFormat
    : 'pairs';
  const showBucketsOption = selectedModeMeta.supportsBuckets && effectiveTeamFormat === 'pairs';

  return (
    <div className="space-y-3">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-4 space-y-3">
        <div className="text-xs font-semibold text-[var(--muted)]">
          Правила матчей (квалификация)
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-[var(--text)]">Голов до победы</span>
          <div
            role="radiogroup"
            aria-label="Голов до победы"
            className="flex gap-1.5 flex-wrap justify-end"
          >
            {[3, 5, 7, 10].map((v) => {
              const selected = value.targetScore === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => {
                    haptic('light');
                    onChange({
                      targetScore: v,
                      maxScore: value.maxScore < v ? v + 2 : value.maxScore,
                    });
                  }}
                  className={`px-3 py-1.5 rounded-2xl text-xs font-semibold border disabled:opacity-50 ${
                    selected
                      ? 'bg-[#2ea6ff] text-white border-[#2ea6ff]'
                      : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'
                  }`}
                >
                  {v}
                </button>
              );
            })}
            {![3, 5, 7, 10].includes(value.targetScore) && (
              <span className="px-3 py-1.5 rounded-2xl text-xs font-semibold border bg-[#2ea6ff] text-white border-[#2ea6ff]">
                {value.targetScore}
              </span>
            )}
          </div>
        </div>

        <BooleanToggleRow
          label="Баланс (+2 мяча)"
          description="При ничьей игра идет до разницы в 2 гола"
          value={value.winByTwo}
          disabled={disabled}
          onChange={(next) => onChange({ winByTwo: next })}
        />

        {value.winByTwo && (
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="qual-max-score-input" className="text-sm text-[var(--text)]">
              Максимум голов (лимит)
            </label>
            <NumericStepperInput
              id="qual-max-score-input"
              value={value.maxScore}
              min={value.targetScore}
              max={25}
              fallback={value.targetScore + 2}
              disabled={disabled}
              ariaLabel="Максимум голов"
              onCommit={(next) => onChange({ maxScore: next })}
            />
          </div>
        )}
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-4 space-y-2.5">
        <div className="text-xs font-semibold text-[var(--muted)]">Управление раундами</div>

        <BooleanToggleRow
          label="Автоматические раунды"
          description="Следующий раунд создается сам после завершения всех игр"
          value={value.autoRounds}
          disabled={disabled}
          onChange={(next) => onChange({ autoRounds: next })}
        />

        {showBucketsOption && (
          <BooleanToggleRow
            label={
              <span className="inline-flex items-center gap-1.5">
                <span>Корзины A / B (баланс)</span>
                <BucketsTooltip />
              </span>
            }
            description="Ставит сильного игрока (A) в пару к новичку (B)"
            value={value.useBuckets}
            disabled={disabled}
            onChange={(next) => onChange({ useBuckets: next })}
            ariaLabel="Корзины A / B (баланс по силе)"
          />
        )}
      </div>
    </div>
  );
};

/** Карточка настроек плей-офф. */
export const TournamentPlayoffCard: React.FC<TournamentCardProps> = ({
  value,
  onChange,
  disabled = false,
  canEditPlayoff = true,
}) => {
  const selectedModeMeta =
    TOURNAMENT_MODE_CATALOG.find((m) => m.key === value.dypMode) || TOURNAMENT_MODE_CATALOG[0];
  const effectiveTeamFormat: TeamFormat = selectedModeMeta.supportsSingles
    ? value.teamFormat
    : 'pairs';
  const playoffSizesList = effectiveTeamFormat === 'single' ? [2, 4, 8, 16, 32] : [4, 8, 16, 32];

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-[var(--muted)]">Плей-офф</div>
        {!canEditPlayoff && (
          <span className="text-[11px] font-semibold text-amber-500">Сетка уже запущена</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-[var(--text)]">Участников в сетке</span>
        <div
          role="radiogroup"
          aria-label="Участников в сетке"
          className="flex gap-1.5 flex-wrap justify-end"
        >
          {playoffSizesList.map((n) => {
            const selected = value.playoffSize === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled || !canEditPlayoff}
                onClick={() => {
                  haptic('light');
                  onChange({ playoffSize: n });
                }}
                className={`px-2.5 py-1.5 rounded-2xl text-xs font-semibold border disabled:opacity-50 ${
                  selected
                    ? 'bg-[#2ea6ff] text-white border-[#2ea6ff]'
                    : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'
                }`}
              >
                Топ-{n}
              </button>
            );
          })}
        </div>
      </div>

      <BooleanToggleRow
        label="Матч за 3-е место"
        value={value.thirdPlaceMatch}
        disabled={disabled || !canEditPlayoff}
        onChange={(next) => onChange({ thirdPlaceMatch: next })}
      />

      <div>
        <span className="block text-sm mb-1.5 text-[var(--text)]">Формат серии</span>
        <div role="radiogroup" aria-label="Формат серии" className="grid grid-cols-3 gap-1.5">
          {(
            [
              ['best_of_1', '1 сет'],
              ['best_of_3', 'Best of 3'],
              ['best_of_5', 'Best of 5'],
            ] as Array<[PlayoffFormat, string]>
          ).map(([val, label]) => {
            const selected = value.playoffFormat === val;
            return (
              <button
                key={val}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled || !canEditPlayoff}
                onClick={() => {
                  haptic('light');
                  onChange({ playoffFormat: val });
                }}
                className={`py-2 px-1 rounded-2xl text-xs font-semibold border inline-flex items-center justify-center gap-1 disabled:opacity-50 ${
                  selected
                    ? 'bg-[#2ea6ff]/12 text-[#2ea6ff] border-[#2ea6ff]'
                    : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'
                }`}
              >
                <RadioCircle selected={selected} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-[var(--text)]">Голов в сете плей-офф</span>
        <div role="radiogroup" aria-label="Голов в сете плей-офф" className="flex gap-1.5">
          {[3, 5, 7].map((v) => {
            const selected = value.playoffTargetScore === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled || !canEditPlayoff}
                onClick={() => {
                  haptic('light');
                  onChange({
                    playoffTargetScore: v,
                    playoffMaxScore: value.playoffMaxScore < v ? v + 2 : value.playoffMaxScore,
                  });
                }}
                className={`px-3 py-1.5 rounded-2xl text-xs font-semibold border disabled:opacity-50 ${
                  selected
                    ? 'bg-[#2ea6ff] text-white border-[#2ea6ff]'
                    : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'
                }`}
              >
                {v}
              </button>
            );
          })}
        </div>
      </div>

      <BooleanToggleRow
        label="Баланс в плей-офф (+2 мяча)"
        value={value.playoffWinByTwo}
        disabled={disabled || !canEditPlayoff}
        onChange={(next) => onChange({ playoffWinByTwo: next })}
      />

      {value.playoffWinByTwo && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="playoff-max-score-input" className="text-sm text-[var(--text)]">
            Лимит голов (плей-офф)
          </label>
          <NumericStepperInput
            id="playoff-max-score-input"
            value={value.playoffMaxScore}
            min={value.playoffTargetScore}
            max={25}
            fallback={value.playoffTargetScore + 2}
            disabled={disabled || !canEditPlayoff}
            ariaLabel="Лимит голов в плей-офф"
            onCommit={(next) => onChange({ playoffMaxScore: next })}
          />
        </div>
      )}
    </div>
  );
};

interface TournamentTimersCardProps {
  value: TournamentSettingsState;
  onChange: (patch: Partial<TournamentSettingsState>) => void;
  disabled?: boolean;
  defaultExpanded?: boolean;
}

/** Карточка таймера долгого матча и напоминаний о счёте. */
export const TournamentTimersCard: React.FC<TournamentTimersCardProps> = ({
  value,
  onChange,
  disabled = false,
  defaultExpanded = false,
}) => {
  const [showAdvancedRules, setShowAdvancedRules] = useState(defaultExpanded);

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-4 space-y-2.5">
      <button
        type="button"
        onClick={() => setShowAdvancedRules((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-xs font-semibold text-[var(--muted)] flex items-center gap-1.5">
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
            <label htmlFor="long-match-alert-input" className="text-[var(--muted)]">
              Сигнал, если матч дольше (мин)
            </label>
            <NumericStepperInput
              id="long-match-alert-input"
              value={value.longMatchAlertMin}
              min={3}
              max={120}
              fallback={15}
              disabled={disabled}
              ariaLabel="Сигнал долгого матча"
              onCommit={(next) => onChange({ longMatchAlertMin: next })}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="score-reminder-input" className="text-[var(--muted)]">
              Повторное напоминание о счёте (мин)
            </label>
            <NumericStepperInput
              id="score-reminder-input"
              value={value.scoreReminderMin}
              min={1}
              max={30}
              fallback={3}
              disabled={disabled}
              ariaLabel="Повторное напоминание о счёте"
              onCommit={(next) => onChange({ scoreReminderMin: next })}
            />
          </div>
        </div>
      )}
    </div>
  );
};

interface Props {
  value: TournamentSettingsState;
  onChange: (patch: Partial<TournamentSettingsState>) => void;
  namePlaceholder?: string;
  disabled?: boolean;
  canEditFormat?: boolean;
  canEditPlayoff?: boolean;
  showDisabledTables?: boolean;
  defaultShowAdvancedRules?: boolean;
}

/** Общие секции настроек турнира для экрана администрирования. */
export const TournamentSettingsFields: React.FC<Props> = ({
  value,
  onChange,
  namePlaceholder = 'Название турнира',
  disabled = false,
  canEditFormat = true,
  canEditPlayoff = true,
  showDisabledTables = false,
  defaultShowAdvancedRules = false,
}) => {
  const isElimination = value.dypMode === 'elimination';

  return (
    <div className="space-y-4">
      <TournamentFormatCard
        value={value}
        onChange={onChange}
        namePlaceholder={namePlaceholder}
        disabled={disabled}
        canEditFormat={canEditFormat}
      />

      <TournamentTablesCard
        value={value}
        onChange={onChange}
        disabled={disabled}
        showDisabledTables={showDisabledTables}
      />

      {!isElimination && (
        <TournamentQualificationCard value={value} onChange={onChange} disabled={disabled} />
      )}

      <TournamentPlayoffCard
        value={value}
        onChange={onChange}
        disabled={disabled}
        canEditPlayoff={canEditPlayoff}
      />

      <TournamentTimersCard
        value={value}
        onChange={onChange}
        disabled={disabled}
        defaultExpanded={defaultShowAdvancedRules}
      />
    </div>
  );
};
