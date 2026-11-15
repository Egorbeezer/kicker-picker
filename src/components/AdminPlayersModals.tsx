import React, { useState, useEffect } from 'react';
import { BookmarkCheck, Shuffle, X } from 'lucide-react';
import type { ClubPlayer, DypRole, TournamentPlayer } from '../types';
import { haptic } from '../utils/telegram';
import { Modal } from './Modal';

interface AddPlayersModalProps {
  open: boolean;
  busy: boolean;
  useBuckets: boolean;
  clubPlayers: ClubPlayer[];
  existingNamesSet: Set<string>;
  onManageClubPlayer?: (params: {
    action: 'list' | 'add' | 'delete';
    id?: number;
    name?: string;
  }) => Promise<void>;
  onSubmit: (payload: {
    names?: string[];
    clubPlayerIds?: number[];
    shuffle: boolean;
    dypRole: DypRole;
    saveToClub: boolean;
  }) => Promise<void>;
  onClose: () => void;
}

export const AddPlayersModal: React.FC<AddPlayersModalProps> = ({
  open,
  busy,
  useBuckets,
  clubPlayers,
  existingNamesSet,
  onManageClubPlayer,
  onSubmit,
  onClose,
}) => {
  const [rawNames, setRawNames] = useState('');
  const [guestRole, setGuestRole] = useState<DypRole>(null);
  const [shuffleOrder, setShuffleOrder] = useState(true);
  const [saveToClub, setSaveToClub] = useState(true);
  const [selectedClubIds, setSelectedClubIds] = useState<number[]>([]);

  useEffect(() => {
    if (open) {
      setRawNames('');
      setGuestRole(null);
      setShuffleOrder(true);
      setSaveToClub(true);
      setSelectedClubIds([]);
    }
  }, [open]);

  if (!open) return null;

  const parsedLines = rawNames
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const parsedPreviewCount = parsedLines.length + selectedClubIds.length;

  const toggleClubChip = (id: number) => {
    haptic('light');
    setSelectedClubIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedLines.length === 0 && selectedClubIds.length === 0) return;
    haptic('success');
    await onSubmit({
      names: parsedLines.length > 0 ? parsedLines : undefined,
      clubPlayerIds: selectedClubIds.length > 0 ? selectedClubIds : undefined,
      shuffle: shuffleOrder,
      dypRole: useBuckets ? guestRole : null,
      saveToClub,
    });
    onClose();
  };

  return (
    <Modal
      title="Добавить участников"
      onClose={onClose}
      footer={
        <div className="btn-row">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Отмена
          </button>
          <button
            type="submit"
            form="bulk-add-form"
            disabled={busy || parsedPreviewCount === 0}
            className="btn btn-primary"
          >
            Добавить ({parsedPreviewCount})
          </button>
        </div>
      }
    >
      <form id="bulk-add-form" onSubmit={handleBulkAdd} className="space-y-3">
        {clubPlayers.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
              <BookmarkCheck size={12} className="text-[#2ea6ff]" />
              Постоянные игроки клуба (выбор в 1 тап)
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto py-0.5">
              {clubPlayers.map((cp) => {
                const alreadyAdded = existingNamesSet.has(cp.name.trim().toLowerCase());
                const selected = selectedClubIds.includes(cp.id);
                return (
                  <div
                    key={cp.id}
                    className={`inline-flex items-center gap-1 rounded-full border pl-2.5 pr-1.5 py-1 text-xs font-semibold ${
                      alreadyAdded
                        ? 'opacity-45 bg-[var(--bg)] border-[var(--border)] text-[var(--muted)]'
                        : selected
                          ? 'bg-[#2ea6ff] border-[#2ea6ff] text-white'
                          : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text)]'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => toggleClubChip(cp.id)}
                      className="text-left"
                    >
                      {cp.name}
                    </button>
                    {onManageClubPlayer && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onManageClubPlayer({ action: 'delete', id: cp.id })}
                        aria-label={`Удалить ${cp.name} из базы`}
                        className="p-0.5 opacity-60 hover:opacity-100 disabled:opacity-30"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="text-xs text-[var(--muted)] block mb-1.5">
            Новые имена (по одному на строку или через запятую)
          </label>
          <textarea
            rows={4}
            placeholder={'Например:\nМакс\nОля\nСаша, Дима'}
            value={rawNames}
            onChange={(e) => setRawNames(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border-strong)] rounded-2xl px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[#2ea6ff] resize-none"
          />
        </div>

        {useBuckets && (
          <div>
            <div className="text-xs font-medium text-[var(--muted)] mb-1.5">
              Корзина для новых участников
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {([null, 'A', 'B'] as DypRole[]).map((roleOpt) => (
                <button
                  key={String(roleOpt)}
                  type="button"
                  onClick={() => setGuestRole(roleOpt)}
                  className={`py-2 rounded-2xl text-xs font-bold border ${
                    guestRole === roleOpt
                      ? 'bg-[#2ea6ff] border-[#2ea6ff] text-white'
                      : 'bg-[var(--bg)] border-[var(--border)] text-[var(--muted)]'
                  }`}
                >
                  {roleOpt === 'A' ? 'Корзина A' : roleOpt === 'B' ? 'Корзина B' : 'Без корзины'}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-center justify-between gap-2 bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-3 py-2 cursor-pointer">
          <span className="flex items-center gap-2 text-xs text-[var(--text)]">
            <Shuffle size={14} className="text-[#2ea6ff]" />
            Перемешать порядок при добавлении
          </span>
          <input
            type="checkbox"
            checked={shuffleOrder}
            onChange={(e) => setShuffleOrder(e.target.checked)}
            className="w-4 h-4 accent-[#2ea6ff]"
          />
        </label>

        <label className="flex items-center justify-between gap-2 bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-3 py-2 cursor-pointer">
          <span className="flex items-center gap-2 text-xs text-[var(--text)]">
            <BookmarkCheck size={14} className="text-emerald-500" />
            Сохранить новых игроков в базу клуба
          </span>
          <input
            type="checkbox"
            checked={saveToClub}
            onChange={(e) => setSaveToClub(e.target.checked)}
            className="w-4 h-4 accent-[#2ea6ff]"
          />
        </label>
      </form>
    </Modal>
  );
};

interface RenamePlayerModalProps {
  player: TournamentPlayer | null;
  busy: boolean;
  onSubmit: (playerId: number, name: string) => Promise<void>;
  onClose: () => void;
}

export const RenamePlayerModal: React.FC<RenamePlayerModalProps> = ({
  player,
  busy,
  onSubmit,
  onClose,
}) => {
  const [renameValue, setRenameValue] = useState(player?.name || '');

  useEffect(() => {
    setRenameValue(player?.name || '');
  }, [player]);

  if (!player) return null;

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameValue.trim()) return;
    haptic('success');
    await onSubmit(player.id, renameValue.trim());
    onClose();
  };

  return (
    <Modal
      title="Переименовать участника"
      onClose={onClose}
      footer={
        <div className="btn-row">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Отмена
          </button>
          <button
            type="submit"
            form="rename-player-form"
            disabled={busy || !renameValue.trim()}
            className="btn btn-primary"
          >
            Сохранить
          </button>
        </div>
      }
    >
      <form id="rename-player-form" onSubmit={handleRenameSubmit}>
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder="Имя игрока"
          autoFocus
          className="w-full bg-[var(--bg)] border border-[var(--border-strong)] rounded-2xl px-3.5 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[#2ea6ff]"
        />
      </form>
    </Modal>
  );
};

interface SubstitutePlayerModalProps {
  player: TournamentPlayer | null;
  clubPlayers: ClubPlayer[];
  busy: boolean;
  onSubmit: (playerId: number, name: string, tgId: number | null) => Promise<void>;
  onClose: () => void;
}

export const SubstitutePlayerModal: React.FC<SubstitutePlayerModalProps> = ({
  player,
  clubPlayers,
  busy,
  onSubmit,
  onClose,
}) => {
  const [subName, setSubName] = useState('');
  const [subTgId, setSubTgId] = useState<number | null>(null);

  useEffect(() => {
    setSubName('');
    setSubTgId(null);
  }, [player]);

  if (!player) return null;

  const handleSubstituteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim()) return;
    haptic('success');
    await onSubmit(player.id, subName.trim(), subTgId);
    onClose();
  };

  return (
    <Modal
      title={`Заменить: ${player.name}`}
      onClose={onClose}
      footer={
        <div className="btn-row">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Отмена
          </button>
          <button
            type="submit"
            form="sub-player-form"
            disabled={busy || !subName.trim()}
            className="btn btn-primary"
          >
            Заменить
          </button>
        </div>
      }
    >
      <form id="sub-player-form" onSubmit={handleSubstituteSubmit} className="space-y-3">
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          Новый игрок займёт место <strong className="text-[var(--text)]">{player.name}</strong> во
          всех текущих матчах и сетке плей-офф, не ломая турнир.
        </p>
        {clubPlayers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {clubPlayers.map((cp) => (
              <button
                key={cp.id}
                type="button"
                onClick={() => {
                  setSubName(cp.name);
                  setSubTgId(cp.tgId ?? null);
                }}
                className="px-2.5 py-1 rounded-full bg-[var(--bg)] border border-[var(--border)] text-xs font-semibold text-[var(--text)] hover:border-[#2ea6ff]"
              >
                {cp.name}
              </button>
            ))}
          </div>
        )}
        <input
          type="text"
          value={subName}
          onChange={(e) => {
            setSubName(e.target.value);
            setSubTgId(null);
          }}
          placeholder="Имя игрока на замену"
          autoFocus
          className="w-full bg-[var(--bg)] border border-[var(--border-strong)] rounded-2xl px-3.5 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[#2ea6ff]"
        />
      </form>
    </Modal>
  );
};
