import React, { useState } from 'react';
import {
  UserPlus,
  Share2,
  Pause,
  Play,
  Pencil,
  Shuffle,
  Search,
  Trash2,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  Shield,
  RefreshCw,
  Heart,
} from 'lucide-react';
import type { ClubPlayer, DypRole, TournamentPlayer, TournamentSnapshot } from '../types';
import { haptic } from '../utils/telegram';
import { shareTournamentInTelegram } from '../utils/share';
import { PlayerAvatar } from './PlayerAvatar';
import { BucketsTooltip } from './InfoTooltip';
import {
  AddPlayersModal,
  RenamePlayerModal,
  SubstitutePlayerModal,
} from './AdminPlayersModals';

interface Props {
  snapshot: TournamentSnapshot;
  clubPlayers?: ClubPlayer[];
  onAddGuest: (payload: {
    name?: string;
    names?: string[] | string;
    shuffle?: boolean;
    dypRole?: DypRole;
    clubPlayerIds?: number[];
    saveToClub?: boolean;
  }) => Promise<void>;
  onManagePlayer: (params: {
    playerId?: number;
    action:
      | 'rename'
      | 'set_role'
      | 'delete_player'
      | 'substitute'
      | 'move_seeding'
      | 'shuffle_seeding'
      | 'toggle_coadmin';
    name?: string;
    dypRole?: DypRole;
    replacementName?: string;
    replacementTgId?: number | null;
    direction?: 'up' | 'down';
  }) => Promise<void>;
  onManageClubPlayer?: (params: {
    action: 'list' | 'add' | 'delete';
    id?: number;
    name?: string;
  }) => Promise<void>;
  onStartRound?: (opts?: { preserveOrder?: boolean; regenerateFirst?: boolean }) => Promise<void>;
  onToggleActive: (playerId: number) => Promise<void>;
  busy: boolean;
}

export const AdminPlayersView: React.FC<Props> = ({
  snapshot,
  clubPlayers = [],
  onAddGuest,
  onManagePlayer,
  onManageClubPlayer,
  onStartRound,
  onToggleActive,
  busy,
}) => {
  const { tournament, players, currentRoundMatches, isCreator } = snapshot;
  const activeCount = players.filter((p) => p.isActive).length;
  const useBuckets = Boolean(tournament.useBuckets);
  const coAdminSet = new Set((tournament.coAdminTgIds || []).map(Number));
  const canReorderSeeding =
    tournament.status === 'REGISTRATION' ||
    (tournament.status === 'QUALIFICATION' &&
      tournament.currentRound === 1 &&
      !currentRoundMatches.some((m) => m.status === 'FINISHED'));
  const canRegenerateRound1 =
    Boolean(onStartRound) &&
    tournament.status === 'QUALIFICATION' &&
    tournament.currentRound === 1 &&
    !currentRoundMatches.some((m) => m.status === 'FINISHED');

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [renamingPlayer, setRenamingPlayer] = useState<TournamentPlayer | null>(null);
  const [substitutingPlayer, setSubstitutingPlayer] = useState<TournamentPlayer | null>(null);

  const openAddModal = () => setShowAddModal(true);
  const openRename = (player: TournamentPlayer) => setRenamingPlayer(player);
  const openSubstitute = (player: TournamentPlayer) => setSubstitutingPlayer(player);

  const cycleRole = async (player: TournamentPlayer) => {
    haptic('light');
    const next: DypRole =
      player.dypRole === 'A' ? 'B' : player.dypRole === 'B' ? null : 'A';
    await onManagePlayer({
      playerId: player.id,
      action: 'set_role',
      dypRole: next,
    });
  };

  const handleInviteInTelegram = () => {
    haptic('light');
    shareTournamentInTelegram({ id: tournament.id, name: tournament.name });
  };

  const existingNamesSet = new Set(players.map((p) => p.name.trim().toLowerCase()));
  const filteredPlayers = players.filter((p) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q);
  });

  return (
    <div className="h-full overflow-y-auto content-dock-pad p-4 space-y-4">
      {/* Header action strip */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="font-bold text-base text-[var(--text)]">Участники</h2>
            <p className="text-xs text-[var(--muted)]">
              Активных: <span className="text-[var(--text)] font-bold">{activeCount}</span> из {players.length}
            </p>
          </div>

          <button
            type="button"
            onClick={handleInviteInTelegram}
            className="text-xs font-bold text-[#2ea6ff] bg-[#2ea6ff]/10 px-3 py-2 rounded-full flex items-center gap-1.5 border border-[#2ea6ff]/25 active:scale-95"
          >
            <Share2 size={14} /> Пригласить
          </button>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={openAddModal}
          className="w-full py-3 rounded-2xl bg-[#2ea6ff] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#2ea6ff]/20 active:scale-[0.98] disabled:opacity-40"
        >
          <UserPlus size={16} /> Добавить участников (в т.ч. из базы)
        </button>

        {/* Pre-Round 1 seeding controls */}
        {canReorderSeeding && players.length >= 2 && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => onManagePlayer({ action: 'shuffle_seeding' })}
              className="flex-1 min-w-[140px] py-2 px-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-xs font-bold text-[var(--text)] inline-flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-40"
            >
              <Shuffle size={13} className="text-[#2ea6ff]" /> Перемешать посев
            </button>
            {canRegenerateRound1 && onStartRound && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onStartRound({ preserveOrder: true, regenerateFirst: true })}
                className="flex-1 min-w-[160px] py-2 px-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-xs font-bold text-amber-500 inline-flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-40"
              >
                <RefreshCw size={13} /> Пересобрать 1-й раунд
              </button>
            )}
          </div>
        )}

        {useBuckets && (
          <div className="text-[11px] text-[var(--muted)] bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-3 py-2 flex items-center justify-between gap-2">
            <span>
              Нажимайте на бейдж <span className="font-bold text-amber-500">A</span> /{' '}
              <span className="font-bold text-[#2ea6ff]">B</span> справа от игрока для баланса пар.
            </span>
            <BucketsTooltip />
          </div>
        )}
      </div>

      {/* Search bar */}
      {players.length > 0 && (
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по участникам..."
            aria-label="Поиск участников"
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-2xl pl-9 pr-3.5 py-2.5 text-xs text-[var(--text)] focus:outline-none focus:border-[#2ea6ff]"
          />
        </div>
      )}

      {/* Players List */}
      <div className="space-y-2">
        {filteredPlayers.map((p, idx) => {
          const isMe = p.id === snapshot.myPlayerId;
          const isCoAdmin = Boolean(p.tgId && coAdminSet.has(Number(p.tgId)));
          const isMainCreator = Boolean(p.tgId && Number(p.tgId) === Number(tournament.creatorTgId));
          const roleBadge =
            p.dypRole === 'A'
              ? 'bg-amber-500/15 border-amber-500/35 text-amber-500'
              : p.dypRole === 'B'
                ? 'bg-[#2ea6ff]/15 border-[#2ea6ff]/35 text-[#2ea6ff]'
                : 'bg-[var(--bg)] border-[var(--border)] text-[var(--muted)]';

          return (
            <div
              key={p.id}
              className={`bg-[var(--card)] border rounded-3xl px-3.5 py-2.5 flex items-center justify-between gap-2 ${
                p.isActive ? 'border-[var(--border)]' : 'border-[var(--border)] opacity-55'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {canReorderSeeding && (
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      disabled={busy || idx === 0}
                      onClick={() =>
                        onManagePlayer({ playerId: p.id, action: 'move_seeding', direction: 'up' })
                      }
                      aria-label={`Поднять ${p.name}`}
                      className="text-[var(--muted)] disabled:opacity-25 p-0.5"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      disabled={busy || idx === filteredPlayers.length - 1}
                      onClick={() =>
                        onManagePlayer({ playerId: p.id, action: 'move_seeding', direction: 'down' })
                      }
                      aria-label={`Опустить ${p.name}`}
                      className="text-[var(--muted)] disabled:opacity-25 p-0.5"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>
                )}

                <PlayerAvatar
                  avatarUrl={p.avatarUrl}
                  initials={p.initials}
                  name={p.name}
                  isMe={isMe}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm flex items-center gap-1.5 flex-wrap text-[var(--text)]">
                    <span className="truncate">{p.name}</span>
                    {isMe && (
                      <span className="text-[10px] font-bold bg-[#2ea6ff]/15 text-[#2ea6ff] px-1.5 py-0.5 rounded-full">
                        Вы
                      </span>
                    )}
                    {isMainCreator && (
                      <span className="text-[10px] font-bold bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded-full">
                        Организатор
                      </span>
                    )}
                    {isCoAdmin && (
                      <span className="text-[10px] font-bold bg-purple-500/15 text-purple-500 px-1.5 py-0.5 rounded-full">
                        Со-админ
                      </span>
                    )}
                    {p.isGuest && (
                      <span className="text-[10px] text-[var(--muted)] bg-[var(--bg)] border border-[var(--border)] px-1.5 py-0.5 rounded-full">
                        Гость
                      </span>
                    )}
                    {tournament.dypMode === 'last_one_standing' && (
                      <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5">
                        <Heart size={10} fill="currentColor" /> {p.livesLeft ?? tournament.losLives ?? 3}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    Отдыхов: {p.byesCount} {!p.isActive && '• Отсутствует'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                {useBuckets && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => cycleRole(p)}
                    className={`w-7 h-7 rounded-xl text-xs font-semibold border transition-transform active:scale-90 ${roleBadge}`}
                    title="Корзина игрока (A / B / Без корзины)"
                  >
                    {p.dypRole || '—'}
                  </button>
                )}

                {Boolean(p.tgId) && !isMainCreator && isCreator && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onManagePlayer({ playerId: p.id, action: 'toggle_coadmin' })}
                    aria-label={`Со-админ для ${p.name}`}
                    title={isCoAdmin ? 'Убрать из со-админов' : 'Сделать со-админом'}
                    className={`p-1.5 rounded-xl border active:scale-95 ${
                      isCoAdmin
                        ? 'bg-purple-500/15 border-purple-500/35 text-purple-500'
                        : 'bg-[var(--bg)] border-[var(--border)] text-[var(--muted)]'
                    }`}
                  >
                    <Shield size={13} />
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openRename(p)}
                  aria-label={`Переименовать ${p.name}`}
                  className="p-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)] active:scale-95"
                  title="Переименовать"
                >
                  <Pencil size={13} />
                </button>

                {tournament.status !== 'FINISHED' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openSubstitute(p)}
                    aria-label={`Заменить ${p.name}`}
                    className="p-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[#2ea6ff] active:scale-95"
                    title="Заменить игрока в турнире"
                  >
                    <ArrowLeftRight size={13} />
                  </button>
                )}

                {tournament.status !== 'FINISHED' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onManagePlayer({ playerId: p.id, action: 'delete_player' })}
                    aria-label={`Удалить ${p.name}`}
                    className="p-1.5 rounded-xl border border-red-500/25 bg-red-500/10 text-red-500 active:scale-95"
                    title="Удалить участника"
                  >
                    <Trash2 size={13} />
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    haptic('light');
                    void onToggleActive(p.id);
                  }}
                  className={`px-2 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 border active:scale-95 ${
                    p.isActive
                      ? 'bg-[var(--bg)] border-[var(--border)] text-[var(--muted)]'
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500'
                  }`}
                  title={p.isActive ? 'Отметить как отсутствующего' : 'Вернуть в турнир'}
                  aria-label={p.isActive ? 'Отметить как отсутствующего' : 'Вернуть в турнир'}
                >
                  {p.isActive ? (
                    <>
                      <Pause size={11} />
                      <span>Отсутствует</span>
                    </>
                  ) : (
                    <>
                      <Play size={11} />
                      <span>Вернуть</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <AddPlayersModal
        open={showAddModal}
        busy={busy}
        useBuckets={useBuckets}
        clubPlayers={clubPlayers}
        existingNamesSet={existingNamesSet}
        onManageClubPlayer={onManageClubPlayer}
        onSubmit={onAddGuest}
        onClose={() => setShowAddModal(false)}
      />

      <RenamePlayerModal
        player={renamingPlayer}
        busy={busy}
        onSubmit={async (playerId, name) => {
          await onManagePlayer({ playerId, action: 'rename', name });
        }}
        onClose={() => setRenamingPlayer(null)}
      />

      <SubstitutePlayerModal
        player={substitutingPlayer}
        clubPlayers={clubPlayers}
        busy={busy}
        onSubmit={async (playerId, replacementName, replacementTgId) => {
          await onManagePlayer({
            playerId,
            action: 'substitute',
            replacementName,
            replacementTgId,
          });
        }}
        onClose={() => setSubstitutingPlayer(null)}
      />
    </div>
  );
};
