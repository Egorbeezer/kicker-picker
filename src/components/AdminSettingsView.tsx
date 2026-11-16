import React, { useRef, useState } from 'react';
import { ArrowLeft, Crown, Loader2, Radio, Save, Share2, Trash2 } from 'lucide-react';
import type { TournamentSnapshot } from '../types';
import { shareLiveUrlInTelegram } from '../utils/share';
import { TOURNAMENT_MODE_CATALOG } from './InfoTooltip';
import { Modal } from './Modal';
import {
  BooleanToggleRow,
  TournamentSettingsFields,
  type TournamentSettingsState,
} from './TournamentSettingsFields';

interface Props {
  snapshot: TournamentSnapshot;
  onBack: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onToggleLive?: (enabled: boolean) => Promise<void>;
  onTransferAdmin: (playerId: number) => Promise<void>;
  onDelete: () => Promise<void>;
  busy: boolean;
}

/** Экран настроек существующего турнира в едином стиле с экраном создания. */
export const AdminSettingsView: React.FC<Props> = ({
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
    <div className="h-full overflow-y-auto content-dock-pad px-3.5 pt-2 space-y-4">
      <div className="flex items-center justify-between py-1">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[#2ea6ff] text-sm font-medium active:opacity-70"
        >
          <ArrowLeft size={16} /> Назад
        </button>
        <div className="font-bold text-base text-[var(--text)]">Настройки турнира</div>
        <div className="w-12" />
      </div>

      <TournamentSettingsFields
        value={settings}
        onChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
        disabled={isLocked}
        canEditFormat={canEditFormat}
        canEditPlayoff={canEditPlayoff}
        showDisabledTables={true}
        defaultShowAdvancedRules={true}
      />

      <button
        type="button"
        disabled={isLocked || !settings.name.trim()}
        onClick={handleSave}
        className="w-full bg-[#2ea6ff] text-white py-3.5 rounded-3xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#2ea6ff]/25 active:scale-[0.98] transition-transform disabled:opacity-50"
      >
        {localOp === 'save' || busy ? (
          <Loader2 size={17} className="animate-spin" />
        ) : (
          <Save size={17} />
        )}
        {localOp === 'save' || busy ? 'Сохранение...' : 'Сохранить изменения'}
      </button>

      {/* Public Live Broadcast */}
      {onToggleLive && (
        <div className="bg-[var(--card)] rounded-3xl border border-[var(--border)] p-4 space-y-3">
          <BooleanToggleRow
            label={
              <span className="inline-flex items-center gap-1.5">
                <Radio
                  size={15}
                  className={tournament.publicPath ? 'text-emerald-500' : 'text-[var(--muted)]'}
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
              <Loader2 size={13} className="animate-spin text-[#2ea6ff]" />
              Обновляем режим Live-трансляции...
            </div>
          )}

          {tournament.publicPath && (
            <div className="pt-1">
              <button
                type="button"
                disabled={isLocked}
                onClick={() =>
                  shareLiveUrlInTelegram({
                    name: tournament.name,
                    publicPath: tournament.publicPath!,
                  })
                }
                className="w-full bg-[#2ea6ff] text-white py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                <Share2 size={14} /> Поделиться
              </button>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={isLocked || transferCandidates.length === 0}
          onClick={() => setShowTransferModal(true)}
          className="bg-[var(--card)] border border-[var(--border)] disabled:opacity-40 text-amber-500 py-3 px-3 rounded-2xl font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98]"
        >
          <Crown size={15} /> Передать права
        </button>

        {!confirmDelete ? (
          <button
            type="button"
            disabled={isLocked}
            onClick={() => setConfirmDelete(true)}
            className="bg-red-500/10 border border-red-500/25 text-red-500 py-3 px-3 rounded-2xl font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
          >
            <Trash2 size={15} /> Удалить турнир
          </button>
        ) : (
          <button
            type="button"
            disabled={isLocked}
            onClick={() => {
              void runGuarded('delete', onDelete);
            }}
            className="bg-red-600 text-white py-3 px-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
          >
            {localOp === 'delete' ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Trash2 size={15} />
            )}
            {localOp === 'delete' ? 'Удаление...' : 'Точно удалить?'}
          </button>
        )}
      </div>

      {/* Transfer Admin Modal */}
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
                className="w-full text-left bg-[var(--bg)] hover:bg-[var(--bg-3)] border border-[var(--border-strong)] rounded-2xl px-4 py-3 flex items-center justify-between active:scale-[0.99] disabled:opacity-50"
              >
                <span className="font-semibold text-sm text-[var(--text)]">{p.name}</span>
                <span className="text-xs text-[#2ea6ff] font-bold">
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
