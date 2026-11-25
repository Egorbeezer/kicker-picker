import React, { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Radio } from 'lucide-react';
import type { CreateTournamentForm, PlayoffFormat } from '../types';
import { haptic } from '../utils/telegram';
import { TOURNAMENT_MODE_CATALOG } from './InfoTooltip';
import {
  BooleanToggleRow,
  TournamentFormatCard,
  TournamentPlayoffCard,
  TournamentQualificationCard,
  TournamentTablesCard,
  TournamentTimersCard,
  type TournamentSettingsState,
} from './TournamentSettingsFields';

interface Props {
  defaultName: string;
  onSubmit: (form: CreateTournamentForm) => Promise<void>;
  onCancel?: () => void;
  busy: boolean;
}

type WizardStepId = 'format' | 'qualification' | 'playoff' | 'tables_playoff' | 'launch';

interface WizardStep {
  id: WizardStepId;
  title: string;
  short: string;
}

function getPlayoffFormatLabel(fmt: PlayoffFormat): string {
  if (fmt === 'best_of_1') return '1 сет';
  if (fmt === 'best_of_3') return 'Best of 3';
  return 'Best of 5';
}

function getTablesWord(count: number): string {
  if (count === 1) return 'стол';
  if (count >= 2 && count <= 4) return 'стола';
  return 'столов';
}

/** Постраничный мастер создания нового турнира. */
export const CreateTournamentView: React.FC<Props> = ({
  defaultName,
  onSubmit,
  onCancel,
  busy,
}) => {
  const [settings, setSettings] = useState<TournamentSettingsState>({
    name: defaultName,
    tablesCount: 2,
    disabledTables: [],
    autoRounds: true,
    dypMode: 'monster',
    teamFormat: 'pairs',
    roundRobinLoops: 1,
    losLives: 3,
    useBuckets: false,
    targetScore: 7,
    winByTwo: false,
    maxScore: 9,
    playoffSize: 8,
    thirdPlaceMatch: true,
    playoffFormat: 'best_of_3',
    playoffTargetScore: 5,
    playoffWinByTwo: false,
    playoffMaxScore: 7,
    longMatchAlertMin: 15,
    scoreReminderMin: 3,
  });
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLocked = busy || submitting;
  const selectedModeMeta =
    TOURNAMENT_MODE_CATALOG.find((m) => m.key === settings.dypMode) || TOURNAMENT_MODE_CATALOG[0];
  const isElimination = settings.dypMode === 'elimination';
  const effectiveTeamFormat = selectedModeMeta.supportsSingles ? settings.teamFormat : 'pairs';
  const showBucketsOption = selectedModeMeta.supportsBuckets && effectiveTeamFormat === 'pairs';

  const steps: WizardStep[] = useMemo(() => {
    if (isElimination) {
      return [
        { id: 'format', title: 'Формат', short: 'Формат' },
        { id: 'tables_playoff', title: 'Столы и плей-офф', short: 'Сетка' },
        { id: 'launch', title: 'Запуск', short: 'Запуск' },
      ];
    }
    return [
      { id: 'format', title: 'Формат', short: 'Формат' },
      { id: 'qualification', title: 'Столы и отбор', short: 'Отбор' },
      { id: 'playoff', title: 'Плей-офф', short: 'Плей-офф' },
      { id: 'launch', title: 'Запуск', short: 'Запуск' },
    ];
  }, [isElimination]);

  const safeStepIndex = Math.min(stepIndex, steps.length - 1);
  const currentStep = steps[safeStepIndex];
  const isFirstStep = safeStepIndex === 0;
  const isLastStep = safeStepIndex === steps.length - 1;

  const goToStep = (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(steps.length - 1, nextIdx));
    haptic('light');
    setStepIndex(clamped);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  };

  const handlePatch = (patch: Partial<TournamentSettingsState>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLastStep) {
      goToStep(safeStepIndex + 1);
      return;
    }
    if (isLocked || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    haptic('success');
    try {
      await onSubmit({
        name: settings.name.trim() || defaultName,
        tables: settings.tablesCount,
        autoRounds: isElimination ? false : settings.autoRounds,
        dypMode: settings.dypMode,
        teamFormat: effectiveTeamFormat,
        roundRobinLoops: settings.dypMode === 'round_robin' ? settings.roundRobinLoops : 1,
        losLives: settings.dypMode === 'last_one_standing' ? settings.losLives : 3,
        skipQualification: isElimination,
        longMatchAlertMin: settings.longMatchAlertMin,
        scoreReminderMin: settings.scoreReminderMin,
        useBuckets: showBucketsOption ? settings.useBuckets : false,
        targetScore: settings.targetScore,
        winByTwo: settings.winByTwo,
        maxScore: settings.winByTwo
          ? Math.max(settings.targetScore, settings.maxScore)
          : settings.targetScore,
        playoffSize: settings.playoffSize,
        thirdPlaceMatch: settings.thirdPlaceMatch,
        playoffFormat: settings.playoffFormat,
        playoffTargetScore: settings.playoffTargetScore,
        playoffWinByTwo: settings.playoffWinByTwo,
        playoffMaxScore: settings.playoffWinByTwo
          ? Math.max(settings.playoffTargetScore, settings.playoffMaxScore)
          : settings.playoffTargetScore,
        liveEnabled,
      });
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const teamLabel = effectiveTeamFormat === 'single' ? '1×1' : '2×2';
  const formatExtra =
    settings.dypMode === 'round_robin'
      ? ` · ${settings.roundRobinLoops} ${settings.roundRobinLoops === 1 ? 'круг' : 'круга'}`
      : settings.dypMode === 'last_one_standing'
        ? ` · ${settings.losLives} жизн.`
        : '';

  const qualSummary = `${settings.tablesCount} ${getTablesWord(settings.tablesCount)}, до ${settings.targetScore}${
    settings.winByTwo ? ` (баланс до ${settings.maxScore})` : ''
  } голов${settings.autoRounds ? ', авто-раунды' : ''}${
    showBucketsOption && settings.useBuckets ? ', корзины A/B' : ''
  }`;

  const playoffSummary = `Топ-${settings.playoffSize}, ${getPlayoffFormatLabel(settings.playoffFormat)}, до ${settings.playoffTargetScore}${
    settings.playoffWinByTwo ? ` (до ${settings.playoffMaxScore})` : ''
  }${settings.thirdPlaceMatch ? ', матч за 3-е место' : ''}`;

  const summaryRows = [
    { label: 'Название', value: settings.name.trim() || defaultName, jumpTo: 0 },
    {
      label: 'Формат',
      value: `${selectedModeMeta.emoji} ${selectedModeMeta.title} (${teamLabel}${formatExtra})`,
      jumpTo: 0,
    },
    ...(isElimination
      ? [{ label: 'Столы', value: `${settings.tablesCount} ${getTablesWord(settings.tablesCount)}`, jumpTo: 1 }]
      : [{ label: 'Отбор', value: qualSummary, jumpTo: 1 }]),
    { label: 'Плей-офф', value: playoffSummary, jumpTo: isElimination ? 1 : 2 },
  ];

  return (
    <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
      {/* Полоса прогресса по шагам */}
      <div className="shrink-0 bg-[var(--bg-2)] border-b border-[var(--border)] px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-bold text-[var(--text)]">{currentStep.title}</span>
          <span className="text-[11px] font-semibold text-[var(--muted)]">
            Шаг {safeStepIndex + 1} из {steps.length}
          </span>
        </div>
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        >
          {steps.map((st, idx) => {
            const isDone = idx < safeStepIndex;
            const isCurrent = idx === safeStepIndex;
            return (
              <button
                key={st.id}
                type="button"
                disabled={isLocked}
                onClick={() => goToStep(idx)}
                className="text-left focus:outline-none disabled:opacity-60"
                aria-current={isCurrent ? 'step' : undefined}
              >
                <div
                  className={`h-1.5 rounded-full transition-colors duration-150 ease-out ${
                    isCurrent
                      ? 'bg-[#2ea6ff]'
                      : isDone
                        ? 'bg-[#2ea6ff]/65'
                        : 'bg-[var(--bg-3)]'
                  }`}
                />
                <div
                  className={`text-[10px] font-semibold mt-1 truncate ${
                    isCurrent ? 'text-[#2ea6ff]' : 'text-[var(--muted)]'
                  }`}
                >
                  {idx + 1}. {st.short}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Скроллящееся содержимое активного шага */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-3">
        {currentStep.id === 'format' && (
          <TournamentFormatCard
            value={settings}
            onChange={handlePatch}
            namePlaceholder={defaultName}
            disabled={isLocked}
          />
        )}

        {currentStep.id === 'qualification' && (
          <>
            <TournamentTablesCard value={settings} onChange={handlePatch} disabled={isLocked} />
            <TournamentQualificationCard
              value={settings}
              onChange={handlePatch}
              disabled={isLocked}
            />
          </>
        )}

        {currentStep.id === 'playoff' && (
          <TournamentPlayoffCard value={settings} onChange={handlePatch} disabled={isLocked} />
        )}

        {currentStep.id === 'tables_playoff' && (
          <>
            <TournamentTablesCard value={settings} onChange={handlePatch} disabled={isLocked} />
            <TournamentPlayoffCard value={settings} onChange={handlePatch} disabled={isLocked} />
          </>
        )}

        {currentStep.id === 'launch' && (
          <>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-4 space-y-2.5">
              <div className="text-xs font-semibold text-[var(--muted)]">Итоговые параметры</div>
              <div className="divide-y divide-[var(--border)]">
                {summaryRows.map((row) => (
                  <div
                    key={row.label}
                    className="py-2 first:pt-0 last:pb-0 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] text-[var(--muted)]">{row.label}</div>
                      <div className="text-xs font-semibold text-[var(--text)] mt-0.5 leading-snug">
                        {row.value}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => goToStep(row.jumpTo)}
                      className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-[#2ea6ff]/12 text-[#2ea6ff] shrink-0 active:scale-95 transition-transform disabled:opacity-50"
                    >
                      Изм.
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-4">
              <BooleanToggleRow
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Radio
                      size={15}
                      className={liveEnabled ? 'text-emerald-500' : 'text-[var(--muted)]'}
                    />
                    <span>Live-трансляция</span>
                  </span>
                }
                description="Публичная ссылка с табло, таблицей и сеткой для любого браузера и ТВ"
                value={liveEnabled}
                disabled={isLocked}
                ariaLabel="Включить Live-трансляцию"
                onChange={setLiveEnabled}
              />
            </div>

            <TournamentTimersCard
              value={settings}
              onChange={handlePatch}
              disabled={isLocked}
              defaultExpanded={false}
            />
          </>
        )}
      </div>

      {/* Нижняя панель навигации по шагам */}
      <div className="shrink-0 bg-[var(--bg-2)] border-t border-[var(--border)] px-3.5 py-3 pb-[calc(12px+var(--tg-inset-bottom,0px))] flex items-center gap-2.5">
        {(!isFirstStep || onCancel) && (
          <button
            type="button"
            disabled={isLocked}
            onClick={() => {
              if (isFirstStep) {
                haptic('light');
                onCancel?.();
              } else {
                goToStep(safeStepIndex - 1);
              }
            }}
            className="flex-1 py-3 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg)] text-sm font-semibold text-[var(--muted)] inline-flex items-center justify-center gap-1 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {!isFirstStep && <ChevronLeft size={16} />}
            <span>{isFirstStep ? 'Отмена' : 'Назад'}</span>
          </button>
        )}

        {!isLastStep ? (
          <button
            type="button"
            disabled={isLocked}
            onClick={() => goToStep(safeStepIndex + 1)}
            className="flex-[2] py-3 rounded-3xl bg-[#2ea6ff] text-white font-bold text-sm inline-flex items-center justify-center gap-1 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <span>Далее</span>
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={isLocked}
            className="flex-[2] py-3 rounded-3xl bg-[#2ea6ff] text-white font-bold text-sm inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {isLocked && <Loader2 size={16} className="animate-spin" />}
            {isLocked ? 'Создаём турнир...' : 'Создать турнир'}
          </button>
        )}
      </div>
    </form>
  );
};
