import React, { useRef, useState } from 'react';
import { Crown, Loader2, Radio, Save, Share2, Trash2 } from 'lucide-react';
import type { TournamentSnapshot } from '../../types';
import { shareLiveUrlInTelegram } from '../../utils/share';
import { TOURNAMENT_MODE_CATALOG } from '../InfoTooltip';
import { Modal } from '../Modal';
import {
  BooleanToggleRow,
  TournamentSettingsFields,
  type TournamentSettingsState,
} from '../TournamentSettingsFields';
import { WiseCard, WisePillButton, WiseScreenHeader } from './WisePrimitives';

interface Props {
  snapshot: TournamentSnapshot;
  onBack: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onToggleLive?: (enabled: boolean) => Promise<void>;
  onTransferAdmin: (playerId: number) => Promise<void>;
  onDelete: () => Promise<void>;
  busy: boolean;
}

export const WiseAdminSettingsView: React.FC<Props> = ({
  snapshot,
  onBack,
  onSave,
  onToggleLive,
  onTransferAdmin,
  onDelete,
  busy,
}) => {
  const { tournament, players } = snapshot;

  const [settings, setSettings] = useState<TournamentSettingsState>({
    name: tournament.name,
    tablesCount: tournament.tablesCount,
    disabledTables: Array.isArray(tournament.disabledTables) ? tournament.disabledTables : [],
    autoRounds: tournament.autoRounds,
    dypMode: tournament.dypMode || 'monster',
    teamFormat: tournament.teamFormat || 'pairs',
    roundRobinLoops: tournament.roundRobinLoops || 1,
    losLives: tournament.losLives || 3,
    useBuckets: Boolean(tournament.useBuckets),
    targetScore: tournament.targetScore,
    winByTwo: tournament.winByTwo,
    maxScore: tournament.maxScore,
    playoffSize: tournament.playoffSize,
    thirdPlaceMatch: tournament.thirdPlaceMatch,
    playoffFormat: tournament.playoffFormat,
    playoffTargetScore: tournament.playoffTargetScore,
    playoffWinByTwo: tournament.playoffWinByTwo,
    playoffMaxScore: tournament.playoffMaxScore,
    longMatchAlertMin: tournament.longMatchAlertMin || 15,
    scoreReminderMin: tournament.scoreReminderMin || 3,
  });

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [localOp, setLocalOp] = useState<'save' | 'live' | 'transfer' | 'delete' | null>(null);
  const opLockRef = useRef(false);

  const isLocked = busy || localOp !== null;
  const canEditFormat = tournament.status === 'REGISTRATION';
  const canEditPlayoff = tournament.status !== 'PLAYOFF' && tournament.status !== 'FINISHED';
  const transferCandidates = players.filter(
    (p) => Boolean(p.tgId) && p.tgId !== tournament.creatorTgId
  );
  const selectedModeMeta =
    TOURNAMENT_MODE_CATALOG.find((m) => m.key === settings.dypMode) || TOURNAMENT_MODE_CATALOG[0];
  const isElimination = settings.dypMode === 'elimination';
  const showBucketsOption = selectedModeMeta.supportsBuckets && settings.teamFormat === 'pairs';

  const runGuarded = async (
    op: 'save' | 'live' | 'transfer' | 'delete',
    fn: () => Promise<void>
  ) => {
    if (isLocked || opLockRef.current) return;
    opLockRef.current = true;
    setLocalOp(op);
    try {
      await fn();
    } finally {
      opLockRef.current = false;
      setLocalOp(null);
    }
  };

  const handleSave = () =>
    runGuarded('save', async () => {
      const cleanDisabled = settings.disabledTables.filter(
        (t) => t >= 1 && t <= settings.tablesCount
      );
      await onSave({
        tournamentId: tournament.id,
        name: settings.name.trim(),
        tablesCount: settings.tablesCount,
        disabledTables: cleanDisabled.length >= settings.tablesCount ? [] : cleanDisabled,
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
      });
      onBack();
    });

  return (
    <div className="h-full overflow-y-auto content-dock-pad px-4 pt-4 space-y-4">
      <WiseScreenHeader title="Настройки" subtitle={tournament.name} />

      <TournamentSettingsFields
        value={settings}
        onChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
        disabled={isLocked}
        canEditFormat={canEditFormat}
        canEditPlayoff={canEditPlayoff}
        showDisabledTables={true}
        defaultShowAdvancedRules={true}
      />

      <WisePillButton
        variant="primary"
        loading={localOp === 'save' || busy}
        disabled={isLocked || !settings.name.trim()}
        onClick={handleSave}
        className="w-full py-3.5"
      >
        {localOp !== 'save' && !busy && <Save size={16} />}
        {localOp === 'save' || busy ? 'Сохранение...' : 'Сохранить изменения'}
      </WisePillButton>

      {onToggleLive && (
        <WiseCard className="space-y-3">
          <BooleanToggleRow
            label={
              <span className="inline-flex items-center gap-1.5">
                <Radio
                  size={15}
                  className={tournament.publicPath ? 'text-[var(--ok)]' : 'text-[var(--muted)]'}
                />
                <span>Публичная Live-ссылка</span>
              </span>
            }
            description="Табло, таблица и сетка в любом браузере без входа в Telegram"
            value={Boolean(tournament.publicPath)}
            disabled={isLocked}
            ariaLabel="Публичная Live-ссылка"
            onChange={(next) => {
              void runGuarded('live', () => onToggleLive(next));
            }}
          />

          {localOp === 'live' && (
            <div className="text-xs text-[var(--muted)] flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin text-[var(--accent-text)]" />
              Обновляем режим Live-трансляции...
            </div>
          )}

          {tournament.publicPath && (
            <WisePillButton
              variant="secondary"
              disabled={isLocked}
              onClick={() =>
                shareLiveUrlInTelegram({
                  name: tournament.name,
                  publicPath: tournament.publicPath!,
                })
              }
              className="w-full py-2.5 text-xs bg-[var(--bg)]"
            >
              <Share2 size={14} /> Поделиться Live-ссылкой
            </WisePillButton>
          )}
        </WiseCard>
      )}

      <div className="grid grid-cols-2 gap-2.5 pb-4">
        <WisePillButton
          variant="warn"
          disabled={isLocked || transferCandidates.length === 0}
          onClick={() => setShowTransferModal(true)}
          className="text-xs py-3"
        >
          <Crown size={15} /> Передать права
        </WisePillButton>

        {!confirmDelete ? (
          <WisePillButton
            variant="danger"
            disabled={isLocked}
            onClick={() => setConfirmDelete(true)}
            className="text-xs py-3"
          >
            <Trash2 size={15} /> Удалить турнир
          </WisePillButton>
        ) : (
          <WisePillButton
            variant="danger"
            loading={localOp === 'delete'}
            disabled={isLocked}
            onClick={() => {
              void runGuarded('delete', onDelete);
            }}
            className="text-xs py-3 !bg-red-600 !text-white"
          >
            {localOp !== 'delete' && <Trash2 size={15} />}
            {localOp === 'delete' ? 'Удаление...' : 'Точно удалить?'}
          </WisePillButton>
        )}
      </div>

      {showTransferModal && (
        <Modal
          title={
            <span className="flex items-center gap-2">
              <Crown size={18} className="text-amber-500" /> Передать права организатора
            </span>
          }
          onClose={() => {
            if (!isLocked) setShowTransferModal(false);
          }}
        >
          <div className="space-y-2">
            {transferCandidates.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={isLocked}
                onClick={() => {
                  void runGuarded('transfer', async () => {
                    await onTransferAdmin(p.id);
                    setShowTransferModal(false);
                    onBack();
                  });
                }}
                className="w-full text-left bg-[var(--card)] rounded-[20px] px-4 py-3 flex items-center justify-between active:scale-[0.99] disabled:opacity-50"
              >
                <span className="font-semibold text-sm text-[var(--text)]">{p.name}</span>
                <span className="text-xs text-[var(--accent-text)] font-bold">
                  {localOp === 'transfer' ? 'Передача...' : 'Выбрать'}
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
};
