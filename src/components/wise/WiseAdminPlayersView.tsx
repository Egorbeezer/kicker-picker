import React, { useState } from 'react';
import {
  UserPlus,
  Share2,
  Pause,
  Play,
  Pencil,
  Shuffle,
  Trash2,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  Shield,
  RefreshCw,
  Heart,
  MoreHorizontal,
} from 'lucide-react';
import type { ClubPlayer, DypRole, TournamentPlayer, TournamentSnapshot } from '../../types';
import { haptic } from '../../utils/telegram';
import { shareTournamentInTelegram } from '../../utils/share';
import { PlayerAvatar } from '../PlayerAvatar';
import { BucketsTooltip } from '../InfoTooltip';
import { Modal } from '../Modal';
import {
  AddPlayersModal,
  RenamePlayerModal,
  SubstitutePlayerModal,
} from '../AdminPlayersModals';
import {
  WiseCard,
  WiseCircleAction,
  WiseList,
  WiseListRow,
  WiseScreenHeader,
  WiseSearchInput,
} from './WisePrimitives';

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

export const WiseAdminPlayersView: React.FC<Props> = ({
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
  const [actionPlayer, setActionPlayer] = useState<TournamentPlayer | null>(null);
  const [renamingPlayer, setRenamingPlayer] = useState<TournamentPlayer | null>(null);
  const [substitutingPlayer, setSubstitutingPlayer] = useState<TournamentPlayer | null>(null);
  const [deletingPlayer, setDeletingPlayer] = useState<TournamentPlayer | null>(null);

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

  const actionCols =
    canReorderSeeding && players.length >= 2 ? (canRegenerateRound1 ? 4 : 3) : 2;

  return (
    <div className="h-full overflow-y-auto content-dock-pad px-4 pt-4 space-y-4">
      <WiseScreenHeader
        title="Участники"
        subtitle={
          <>
            Активных: <strong className="text-[var(--text)]">{activeCount}</strong> из {players.length}
          </>
        }
      />

      <div
        className={`grid gap-2 ${
          actionCols === 4 ? 'grid-cols-4' : actionCols === 3 ? 'grid-cols-3' : 'grid-cols-2'
        }`}
      >
        <WiseCircleAction
          variant="accent"
          icon={<UserPlus size={19} />}
          label="Добавить"
          ariaLabel="Добавить участников"
          disabled={busy}
          onClick={() => setShowAddModal(true)}
        />
        <WiseCircleAction
          icon={<Share2 size={19} />}
          label="Пригласить"
          onClick={handleInviteInTelegram}
        />
        {canReorderSeeding && players.length >= 2 && (
          <WiseCircleAction
            icon={<Shuffle size={19} />}
            label="Посев"
            ariaLabel="Перемешать посев"
            disabled={busy}
            onClick={() => {
              void onManagePlayer({ action: 'shuffle_seeding' });
            }}
          />
        )}
        {canRegenerateRound1 && onStartRound && (
          <WiseCircleAction
            variant="warn"
            icon={<RefreshCw size={19} />}
            label="Раунд 1"
            ariaLabel="Пересобрать 1-й раунд"
            disabled={busy}
            onClick={() => {
              void onStartRound({ preserveOrder: true, regenerateFirst: true });
            }}
          />
        )}
      </div>

      {useBuckets && (
        <WiseCard className="!py-2.5 !px-3.5 text-[11px] text-[var(--muted)] flex items-center justify-between gap-2">
          <span>
            Нажимайте <strong className="text-amber-500">A</strong> /{' '}
            <strong className="text-[var(--accent-text)]">B</strong> для баланса пар.
          </span>
          <BucketsTooltip />
        </WiseCard>
      )}

      {players.length > 0 && (
        <WiseSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Поиск по участникам..."
          ariaLabel="Поиск участников"
        />
      )}

      <WiseList>
        {filteredPlayers.map((p, idx) => {
          const isMe = p.id === snapshot.myPlayerId;
          const isCoAdmin = Boolean(p.tgId && coAdminSet.has(Number(p.tgId)));
          const isMainCreator = Boolean(
            p.tgId && Number(p.tgId) === Number(tournament.creatorTgId)
          );
          const roleBadge =
            p.dypRole === 'A'
              ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
              : p.dypRole === 'B'
                ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                : 'bg-[var(--card)] text-[var(--muted)]';

          return (
            <WiseListRow key={p.id} className={p.isActive ? '' : 'opacity-55'}>
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
                      <span className="text-[10px] font-bold bg-[var(--accent-soft)] text-[var(--accent-text)] px-2 py-0.5 rounded-full">
                        Вы
                      </span>
                    )}
                    {isMainCreator && (
                      <span className="text-[10px] font-bold bg-[var(--warn-soft)] text-[var(--warn)] px-2 py-0.5 rounded-full">
                        Организатор
                      </span>
                    )}
                    {isCoAdmin && (
                      <span className="text-[10px] font-bold bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-full">
                        Со-админ
                      </span>
                    )}
                    {p.isGuest && (
                      <span className="text-[10px] text-[var(--muted)] bg-[var(--card)] px-2 py-0.5 rounded-full">
                        Гость
                      </span>
                    )}
                    {tournament.dypMode === 'last_one_standing' && (
                      <span className="text-[10px] font-bold text-[var(--danger)] bg-[var(--danger-soft)] px-2 py-0.5 rounded-full inline-flex items-center gap-0.5">
                        <Heart size={10} fill="currentColor" /> {p.livesLeft ?? tournament.losLives ?? 3}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    Отдыхов: {p.byesCount} {!p.isActive && '· Отсутствует'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {useBuckets && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => cycleRole(p)}
                    className={`w-8 h-8 rounded-full text-xs font-bold transition-transform active:scale-90 ${roleBadge}`}
                    title="Корзина игрока (A / B / Без корзины)"
                  >
                    {p.dypRole || '—'}
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    haptic('light');
                    void onToggleActive(p.id);
                  }}
                  className={`h-8 px-2.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 active:scale-95 ${
                    p.isActive
                      ? 'bg-[var(--card)] text-[var(--muted)]'
                      : 'bg-[var(--ok-soft)] text-[var(--ok)]'
                  }`}
                  title={p.isActive ? 'Отметить как отсутствующего' : 'Вернуть в турнир'}
                  aria-label={p.isActive ? 'Отметить как отсутствующего' : 'Вернуть в турнир'}
                >
                  {p.isActive ? <Pause size={12} /> : <Play size={12} />}
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    haptic('light');
                    setActionPlayer(p);
                  }}
                  aria-label={`Действия для ${p.name}`}
                  className="w-8 h-8 rounded-full bg-[var(--card)] text-[var(--text)] flex items-center justify-center active:scale-95"
                >
                  <MoreHorizontal size={16} />
                </button>
              </div>
            </WiseListRow>
          );
        })}
      </WiseList>

      {/* Модалка действий с участником */}
      {actionPlayer && (
        <Modal
          title={actionPlayer.name}
          onClose={() => setActionPlayer(null)}
          closeLabel="Закрыть"
        >
          <div className="space-y-2">
            {Boolean(actionPlayer.tgId) &&
              Number(actionPlayer.tgId) !== Number(tournament.creatorTgId) &&
              isCreator && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const target = actionPlayer;
                    setActionPlayer(null);
                    await onManagePlayer({ playerId: target.id, action: 'toggle_coadmin' });
                  }}
                  className="w-full text-left bg-[var(--card)] rounded-[20px] px-4 py-3 flex items-center gap-3 text-sm font-semibold text-[var(--text)] active:scale-[0.99]"
                >
                  <Shield size={16} className="text-purple-400" />
                  <span>
                    {coAdminSet.has(Number(actionPlayer.tgId))
                      ? 'Убрать из со-админов'
                      : 'Сделать со-админом'}
                  </span>
                </button>
              )}

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const target = actionPlayer;
                setActionPlayer(null);
                setRenamingPlayer(target);
              }}
              className="w-full text-left bg-[var(--card)] rounded-[20px] px-4 py-3 flex items-center gap-3 text-sm font-semibold text-[var(--text)] active:scale-[0.99]"
            >
              <Pencil size={16} className="text-[var(--muted)]" />
              <span>Переименовать</span>
            </button>

            {tournament.status !== 'FINISHED' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const target = actionPlayer;
                  setActionPlayer(null);
                  setSubstitutingPlayer(target);
                }}
                className="w-full text-left bg-[var(--card)] rounded-[20px] px-4 py-3 flex items-center gap-3 text-sm font-semibold text-[var(--text)] active:scale-[0.99]"
              >
                <ArrowLeftRight size={16} className="text-[var(--accent-text)]" />
                <span>Заменить игрока в турнире</span>
              </button>
            )}

            {tournament.status !== 'FINISHED' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const target = actionPlayer;
                  setActionPlayer(null);
                  setDeletingPlayer(target);
                }}
                className="w-full text-left bg-[var(--danger-soft)] rounded-[20px] px-4 py-3 flex items-center gap-3 text-sm font-semibold text-[var(--danger)] active:scale-[0.99]"
              >
                <Trash2 size={16} />
                <span>Удалить участника</span>
              </button>
            )}
          </div>
        </Modal>
      )}

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

      {deletingPlayer && (
        <Modal
          title="Удалить участника?"
          onClose={() => {
            if (!busy) setDeletingPlayer(null);
          }}
          closeLabel="Отмена"
          footer={
            <button
              type="button"
              data-testid="confirm-delete-player-btn"
              disabled={busy}
              onClick={async () => {
                haptic('light');
                const targetId = deletingPlayer.id;
                await onManagePlayer({ playerId: targetId, action: 'delete_player' });
                setDeletingPlayer(null);
              }}
              className="w-full py-3 rounded-full bg-red-600 text-white font-bold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {busy ? 'Удаление...' : 'Удалить'}
            </button>
          }
        >
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            Игрок <strong className="text-[var(--text)]">{deletingPlayer.name}</strong> будет
            удалён из списка участников турнира.
          </p>
        </Modal>
      )}
    </div>
  );
};
