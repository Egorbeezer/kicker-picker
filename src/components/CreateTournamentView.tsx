import React, { useRef, useState } from 'react';
import { Loader2, Radio } from 'lucide-react';
import type { CreateTournamentForm } from '../types';
import { haptic } from '../utils/telegram';
import { TOURNAMENT_MODE_CATALOG } from './InfoTooltip';
import {
  BooleanToggleRow,
  TournamentSettingsFields,
  type TournamentSettingsState,
} from './TournamentSettingsFields';

interface Props {
  defaultName: string;
  onSubmit: (form: CreateTournamentForm) => Promise<void>;
  onCancel?: () => void;
  busy: boolean;
}

/** Экран создания нового турнира на базе общих карточек и радиокнопок. */
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
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);

  const isLocked = busy || submitting;
  const selectedModeMeta =
    TOURNAMENT_MODE_CATALOG.find((m) => m.key === settings.dypMode) || TOURNAMENT_MODE_CATALOG[0];
  const isElimination = settings.dypMode === 'elimination';
  const showBucketsOption = selectedModeMeta.supportsBuckets && settings.teamFormat === 'pairs';

  const handlePatch = (patch: Partial<TournamentSettingsState>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        teamFormat: selectedModeMeta.supportsSingles ? settings.teamFormat : 'pairs',
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-24">
      <TournamentSettingsFields
        value={settings}
        onChange={handlePatch}
        namePlaceholder={defaultName}
        disabled={isLocked}
      />

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

      <div className="flex gap-2.5 pt-2">
        {onCancel && (
          <button
            type="button"
            disabled={isLocked}
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-3xl border border-[var(--border)] bg-[var(--card)] text-sm font-semibold text-[var(--muted)] disabled:opacity-50"
          >
            Назад
          </button>
        )}
        <button
          type="submit"
          disabled={isLocked}
          className="flex-[2] py-3.5 rounded-3xl bg-[#2ea6ff] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#2ea6ff]/20 active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {isLocked && <Loader2 size={16} className="animate-spin" />}
          {isLocked ? 'Создаём турнир...' : 'Создать турнир'}
        </button>
      </div>
    </form>
  );
};
