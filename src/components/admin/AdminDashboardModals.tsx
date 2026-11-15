import React from 'react';
import { Ban, RotateCcw, Share2 } from 'lucide-react';
import type { MatchItem, Tournament } from '../../types';
import { haptic } from '../../utils/telegram';
import { shareLiveUrlInTelegram } from '../../utils/share';
import type { PodiumImageResult } from '../../utils/exportPodiumImage';
import { Modal } from '../Modal';
import { ScorePickerRow } from '../ScorePickerRow';
import { Toggle } from '../Toggle';

interface PodiumSummary {
  first: string | null;
  second: string | null;
  third: string | null;
}

interface Props {
  tournament: Tournament;
  busy: boolean;
  podium: PodiumSummary;
  editingMatch: MatchItem | null;
  setEditingMatch: React.Dispatch<React.SetStateAction<MatchItem | null>>;
  getMaxButtonForMatch: (m: MatchItem) => number;
  onSaveEditingMatch: () => Promise<void>;
  onAdminManageMatch: (params: {
    matchId: number;
    action: 'set_table' | 'reset' | 'toggle_cancel';
    tableNumber?: number;
  }) => Promise<void>;
  confirmDeleteRound: boolean;
  setConfirmDeleteRound: (open: boolean) => void;
  onDeleteLastRound: () => Promise<void>;
  showLiveModal: boolean;
  setShowLiveModal: (open: boolean) => void;
  onToggleLive: (enabled: boolean) => Promise<void>;
  confirmFinish: boolean;
  setConfirmFinish: (open: boolean) => void;
  onFinishTournament: (reopen?: boolean) => Promise<void>;
  onOpenPodiumPreview: () => Promise<void>;
  podiumPreview: PodiumImageResult | null;
  setPodiumPreview: (preview: PodiumImageResult | null) => void;
  sharingPodium: boolean;
  onSharePodium: () => Promise<void>;
  playoffPromptOpen: boolean;
  setPlayoffPromptOpen: (open: boolean) => void;
  promptPlayoffSize: number;
  setPromptPlayoffSize: (size: number) => void;
  promptThirdPlace: boolean;
  setPromptThirdPlace: (checked: boolean) => void;
  onStartPlayoff: (options?: { playoffSize?: number; thirdPlaceMatch?: boolean }) => Promise<void>;
}

export const AdminDashboardModals: React.FC<Props> = ({
  tournament,
  busy,
  podium,
  editingMatch,
  setEditingMatch,
  getMaxButtonForMatch,
  onSaveEditingMatch,
  onAdminManageMatch,
  confirmDeleteRound,
  setConfirmDeleteRound,
  onDeleteLastRound,
  showLiveModal,
  setShowLiveModal,
  onToggleLive,
  confirmFinish,
  setConfirmFinish,
  onFinishTournament,
  onOpenPodiumPreview,
  podiumPreview,
  setPodiumPreview,
  sharingPodium,
  onSharePodium,
  playoffPromptOpen,
  setPlayoffPromptOpen,
  promptPlayoffSize,
  setPromptPlayoffSize,
  promptThirdPlace,
  setPromptThirdPlace,
  onStartPlayoff,
}) => (
  <>
    {editingMatch && (
      <Modal
        title={`Редактирование матча (Стол ${editingMatch.tableNumber})`}
        onClose={() => setEditingMatch(null)}
        footer={
          <button
            type="button"
            disabled={busy}
            onClick={onSaveEditingMatch}
            className="btn btn-primary w-full py-3.5"
          >
            {busy ? 'Сохранение...' : `Сохранить счет: ${editingMatch.score1} - ${editingMatch.score2}`}
          </button>
        }
      >
        <div className="py-1 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm text-white truncate">
                {editingMatch.team1Label}
              </span>
              <span className="text-xl font-black text-[#2ea6ff] shrink-0">
                {editingMatch.score1}
              </span>
            </div>
            <ScorePickerRow
              score={editingMatch.score1}
              maxScore={getMaxButtonForMatch(editingMatch)}
              onChange={(val) =>
                setEditingMatch((prev) => (prev ? { ...prev, score1: val } : null))
              }
            />
          </div>

          <div className="text-center font-black text-xs text-gray-500">VS</div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm text-white truncate">
                {editingMatch.team2Label}
              </span>
              <span className="text-xl font-black text-[#2ea6ff] shrink-0">
                {editingMatch.score2}
              </span>
            </div>
            <ScorePickerRow
              score={editingMatch.score2}
              maxScore={getMaxButtonForMatch(editingMatch)}
              onChange={(val) =>
                setEditingMatch((prev) => (prev ? { ...prev, score2: val } : null))
              }
            />
          </div>

          {tournament.tablesCount > 1 && (
            <div className="pt-2 border-t border-[var(--border)]">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                Переназначить стол
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: tournament.tablesCount }, (_, i) => i + 1).map((tNum) => (
                  <button
                    key={tNum}
                    type="button"
                    disabled={busy || editingMatch.tableNumber === tNum}
                    onClick={async () => {
                      await onAdminManageMatch({
                        matchId: editingMatch.id,
                        action: 'set_table',
                        tableNumber: tNum,
                      });
                      setEditingMatch((prev) => (prev ? { ...prev, tableNumber: tNum } : null));
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors active:scale-95 ${
                      editingMatch.tableNumber === tNum
                        ? 'bg-[#2ea6ff] border-[#2ea6ff] text-white'
                        : 'bg-[var(--bg)] border-[var(--border-strong)] text-gray-300'
                    }`}
                  >
                    Стол {tNum}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-[var(--border)] grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const mId = editingMatch.id;
                setEditingMatch(null);
                await onAdminManageMatch({ matchId: mId, action: 'reset' });
              }}
              className="bg-[var(--bg)] border border-[var(--border-strong)] text-gray-200 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-40"
            >
              <RotateCcw size={14} /> Сбросить счёт
            </button>

            {editingMatch.stage === 'QUALIFICATION' && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const mId = editingMatch.id;
                  setEditingMatch(null);
                  await onAdminManageMatch({ matchId: mId, action: 'toggle_cancel' });
                }}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border active:scale-95 disabled:opacity-40 ${
                  editingMatch.status === 'CANCELLED'
                    ? 'bg-green-500/15 border-green-500/30 text-green-400'
                    : 'bg-red-500/10 border-red-500/25 text-red-400'
                }`}
              >
                <Ban size={14} />
                {editingMatch.status === 'CANCELLED' ? 'Вернуть матч' : 'Отменить матч'}
              </button>
            )}
          </div>
        </div>
      </Modal>
    )}

    {confirmDeleteRound && (
      <Modal
        title="Удалить текущий раунд?"
        onClose={() => setConfirmDeleteRound(false)}
        footer={
          <div className="btn-row">
            <button
              type="button"
              onClick={() => setConfirmDeleteRound(false)}
              className="btn btn-ghost"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setConfirmDeleteRound(false);
                await onDeleteLastRound();
              }}
              className="btn bg-red-600 text-white font-bold"
            >
              Удалить раунд
            </button>
          </div>
        }
      >
        <p className="text-sm text-[var(--muted)] leading-relaxed">
          Все матчи и результаты раунда №{tournament.currentRound} ({tournament.status === 'QUALIFICATION' ? 'Квалификация' : 'Плей-офф'}) будут безвозвратно удалены, а счётчик отдыхов вернётся на предыдущий шаг.
        </p>
      </Modal>
    )}

    {showLiveModal && (
      <Modal
        title="Публичная Live-ссылка"
        onClose={() => setShowLiveModal(false)}
        closeLabel="Закрыть"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-sm text-white">Live-трансляция</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                Показывает текущий раунд, таблицу и сетку плей-офф в любом браузере и на ТВ без входа в Telegram
              </div>
            </div>
            <Toggle
              checked={Boolean(tournament.publicPath)}
              disabled={busy}
              onChange={(next) => onToggleLive(next)}
              color="green"
              ariaLabel="Включить Live-ссылку"
            />
          </div>

          {tournament.publicPath && (
            <button
              type="button"
              onClick={() =>
                shareLiveUrlInTelegram({
                  name: tournament.name,
                  publicPath: tournament.publicPath!,
                })
              }
              className="w-full bg-[#2ea6ff] text-white py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95"
            >
              <Share2 size={14} /> Поделиться
            </button>
          )}
        </div>
      </Modal>
    )}

    {confirmFinish && (
      <Modal
        title="Завершить турнир?"
        onClose={() => setConfirmFinish(false)}
        footer={
          <div className="btn-row">
            <button
              type="button"
              onClick={() => setConfirmFinish(false)}
              className="btn btn-ghost"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setConfirmFinish(false);
                await onFinishTournament(false);
                await onOpenPodiumPreview();
              }}
              className="btn bg-green-600 text-white font-bold"
            >
              Завершить
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-[var(--muted)]">
          <p className="leading-relaxed">
            {tournament.status === 'PLAYOFF'
              ? 'Турнир получит статус «Завершён», а итоговые призовые места будут зафиксированы.'
              : 'Завершить турнир по итогам квалификации без проведения плей-офф?'}
          </p>
          {(podium.first || podium.second || podium.third) && (
            <div className="space-y-1.5 text-xs">
              {podium.first && (
                <div className="bg-[var(--bg)] border border-yellow-500/30 rounded-xl px-3 py-2 flex justify-between">
                  <span className="text-yellow-500 font-bold">🥇 1 место</span>
                  <span className="font-bold text-[var(--text)]">{podium.first}</span>
                </div>
              )}
              {podium.second && (
                <div className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-3 py-2 flex justify-between">
                  <span className="text-[var(--muted)] font-bold">🥈 2 место</span>
                  <span className="font-semibold text-[var(--text)]">{podium.second}</span>
                </div>
              )}
              {podium.third && (
                <div className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-3 py-2 flex justify-between">
                  <span className="text-amber-500 font-bold">🥉 3 место</span>
                  <span className="font-semibold text-[var(--text)]">{podium.third}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    )}

    {podiumPreview && (
      <Modal
        title="Итоги турнира"
        onClose={() => setPodiumPreview(null)}
        footer={
          <button
            type="button"
            disabled={sharingPodium}
            onClick={onSharePodium}
            className="btn btn-primary w-full font-bold flex items-center justify-center gap-1.5"
          >
            <Share2 size={15} />
            {sharingPodium ? 'Отправка…' : 'Поделиться'}
          </button>
        }
      >
        <div className="space-y-3">
          <img
            src={podiumPreview.dataUrl}
            alt="Победители и призёры турнира"
            className="w-full rounded-xl border border-[var(--border-strong)]"
          />
          <p className="text-xs text-[var(--muted)] text-center">
            Нажмите «Поделиться», чтобы отправить карточку призёров в Telegram.
          </p>
        </div>
      </Modal>
    )}

    {playoffPromptOpen && (
      <Modal
        title="Запуск плей-офф"
        onClose={() => setPlayoffPromptOpen(false)}
        footer={
          <div className="btn-row">
            <button
              type="button"
              onClick={() => setPlayoffPromptOpen(false)}
              className="btn btn-ghost"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const payload = {
                  playoffSize: promptPlayoffSize,
                  thirdPlaceMatch: promptThirdPlace,
                };
                setPlayoffPromptOpen(false);
                await onStartPlayoff(payload);
              }}
              className="btn btn-primary font-bold"
            >
              Начать плей-офф
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              Размер сетки плей-офф
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(tournament.teamFormat === 'single' ? [2, 4, 8, 16, 32] : [4, 8, 16, 32]).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    haptic('light');
                    setPromptPlayoffSize(n);
                  }}
                  className={`px-3 py-1.5 rounded-2xl text-xs font-bold border transition-colors ${
                    promptPlayoffSize === n
                      ? 'bg-[#2ea6ff] text-white border-[#2ea6ff]'
                      : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'
                  }`}
                >
                  Топ-{n}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between gap-2 bg-[var(--bg)] border border-[var(--border)] rounded-2xl px-3.5 py-3 cursor-pointer">
            <div>
              <div className="text-sm font-semibold text-[var(--text)]">Матч за 3-е место</div>
              <div className="text-xs text-[var(--muted)]">
                Проигравшие в полуфиналах сыграют за бронзу
              </div>
            </div>
            <input
              type="checkbox"
              checked={promptThirdPlace}
              onChange={(e) => setPromptThirdPlace(e.target.checked)}
              className="w-5 h-5 accent-[#2ea6ff]"
            />
          </label>
        </div>
      </Modal>
    )}
  </>
);
