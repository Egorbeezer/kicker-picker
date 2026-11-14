import React, { useState } from 'react';
import {
  ArrowLeft,
  Minus,
  Plus,
  Hash,
  Trophy,
  Crown,
  Trash2,
  Save,
  Radio,
  Share2,
} from 'lucide-react';
import type { DypMode, PlayoffFormat, TeamFormat, TournamentSnapshot } from '../types';
import { notify } from '../utils/telegram';
import { shareLiveUrlInTelegram } from '../utils/share';
import { Modal } from './Modal';
import { Toggle } from './Toggle';
import { BucketsTooltip, DypModeTooltip, TOURNAMENT_MODE_CATALOG } from './InfoTooltip';

interface Props {
  snapshot: TournamentSnapshot;
  onBack: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onToggleLive?: (enabled: boolean) => Promise<void>;
  onTransferAdmin: (playerId: number) => Promise<void>;
  onDelete: () => Promise<void>;
  busy: boolean;
}

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

  const [name, setName] = useState(tournament.name);
  const [tablesCount, setTablesCount] = useState(tournament.tablesCount);
  const [disabledTables, setDisabledTables] = useState<number[]>(
    () => (Array.isArray(tournament.disabledTables) ? tournament.disabledTables : [])
  );
  const [autoRounds, setAutoRounds] = useState(tournament.autoRounds);
  const [dypMode, setDypMode] = useState<DypMode>(tournament.dypMode || 'monster');
  const [teamFormat, setTeamFormat] = useState<TeamFormat>(tournament.teamFormat || 'pairs');
  const [roundRobinLoops, setRoundRobinLoops] = useState<number>(tournament.roundRobinLoops || 1);
  const [losLives, setLosLives] = useState<number>(tournament.losLives || 3);
  const [longMatchAlertMin, setLongMatchAlertMin] = useState<number>(tournament.longMatchAlertMin || 15);
  const [scoreReminderMin, setScoreReminderMin] = useState<number>(tournament.scoreReminderMin || 3);
  const [useBuckets, setUseBuckets] = useState<boolean>(Boolean(tournament.useBuckets));
  const [targetScore, setTargetScore] = useState(tournament.targetScore);
  const [winByTwo, setWinByTwo] = useState(tournament.winByTwo);
  const [maxScore, setMaxScore] = useState(tournament.maxScore);
  const [playoffSize, setPlayoffSize] = useState(tournament.playoffSize);
  const [thirdPlaceMatch, setThirdPlaceMatch] = useState(tournament.thirdPlaceMatch);
  const [playoffFormat, setPlayoffFormat] = useState<PlayoffFormat>(tournament.playoffFormat);
  const [playoffTargetScore, setPlayoffTargetScore] = useState(tournament.playoffTargetScore);
  const [playoffWinByTwo, setPlayoffWinByTwo] = useState(tournament.playoffWinByTwo);
  const [playoffMaxScore, setPlayoffMaxScore] = useState(tournament.playoffMaxScore);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canEditPlayoff = tournament.status !== 'PLAYOFF' && tournament.status !== 'FINISHED';
  const transferCandidates = players.filter(
    (p) => Boolean(p.tgId) && p.tgId !== tournament.creatorTgId
  );

  const handleSave = async () => {
    const cleanDisabled = disabledTables.filter((t) => t >= 1 && t <= tablesCount);
    await onSave({
      tournamentId: tournament.id,
      name: name.trim(),
      tablesCount,
      disabledTables: cleanDisabled.length >= tablesCount ? [] : cleanDisabled,
      autoRounds,
      dypMode,
      teamFormat,
      roundRobinLoops,
      losLives,
      skipQualification: dypMode === 'elimination',
      longMatchAlertMin,
      scoreReminderMin,
      useBuckets,
      targetScore,
      winByTwo,
      maxScore,
      playoffSize,
      thirdPlaceMatch,
      playoffFormat,
      playoffTargetScore,
      playoffWinByTwo,
      playoffMaxScore,
    });
    onBack();
  };

  const toggleDisabledTable = (tNum: number) => {
    setDisabledTables((prev) => {
      if (prev.includes(tNum)) {
        return prev.filter((x) => x !== tNum);
      }
      if (prev.length + 1 >= tablesCount) {
        notify('Хотя бы один стол должен быть активен');
        return prev;
      }
      return [...prev, tNum].sort((a, b) => a - b);
    });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto content-dock-pad bg-[var(--bg)]">
      <div className="p-4 border-b border-[var(--border)] sticky top-0 bg-[var(--bg-2)]/95 backdrop-blur-md z-10 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-semibold text-[#2ea6ff] active:scale-95"
        >
          <ArrowLeft size={18} /> Назад
        </button>
        <h2 className="text-base font-black">Настройки турнира</h2>
        <div className="w-14" />
      </div>

      <div className="p-4 space-y-5">
        {/* Basic settings */}
        <div className="bg-[#2c2c2e] rounded-2xl border border-[#3a3a3c] overflow-hidden">
          <div className="p-3.5 border-b border-[#3a3a3c]/60">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              ✏️ Название
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-transparent text-white font-semibold text-base outline-none placeholder-gray-600"
              placeholder="Название турнира"
            />
          </div>

          <div className="p-4 border-b border-[#3a3a3c]/60 space-y-3">
            <div className="flex justify-between items-center">
              <div className="font-medium text-white text-sm">🎱 Столов</div>
              <div className="flex items-center gap-3 bg-[#1c1c1d] rounded-xl p-1 border border-[#3a3a3c]">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(1, tablesCount - 1);
                    setTablesCount(next);
                    setDisabledTables((prev) => {
                      const filtered = prev.filter((n) => n <= next);
                      return filtered.length >= next ? [] : filtered;
                    });
                  }}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 active:scale-95"
                >
                  <Minus size={16} />
                </button>
                <div className="font-bold w-6 text-center">{tablesCount}</div>
                <button
                  type="button"
                  onClick={() => setTablesCount(Math.min(20, tablesCount + 1))}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 active:scale-95"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {tablesCount > 1 && (
              <div>
                <div className="text-[11px] text-gray-400 mb-1.5">
                  Активные столы (нажмите, чтобы временно отключить стол)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: tablesCount }, (_, i) => i + 1).map((tNum) => {
                    const isOff = disabledTables.includes(tNum);
                    return (
                      <button
                        key={tNum}
                        type="button"
                        onClick={() => toggleDisabledTable(tNum)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors active:scale-95 ${
                          isOff
                            ? 'bg-red-500/10 border-red-500/30 text-red-400 line-through'
                            : 'bg-green-500/15 border-green-500/30 text-green-400'
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

          <div className="p-4 border-b border-[#3a3a3c]/60 flex justify-between items-center">
            <div>
              <div className="font-medium text-white text-sm">🔁 Автораунды</div>
              <div className="text-[11px] text-gray-400 mt-0.5 leading-tight">
                {autoRounds ? 'Вкл — автозапуск после окончания раунда' : 'Выкл — запуск вручную'}
              </div>
            </div>
            <Toggle
              checked={autoRounds}
              onChange={setAutoRounds}
              color="green"
              ariaLabel="Автораунды"
            />
          </div>

          {canEditPlayoff && (
            <>
              <div className="p-4 border-b border-[var(--border)] space-y-2.5">
                <div>
                  <div className="font-medium text-[var(--text)] text-sm flex items-center gap-1.5">
                    <span>🎲 Формат турнира</span>
                    <DypModeTooltip />
                  </div>
                  <div className="text-[11px] text-[var(--muted)] mt-0.5 leading-tight">
                    {TOURNAMENT_MODE_CATALOG.find((m) => m.key === dypMode)?.shortDesc}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 bg-[var(--bg)] p-1.5 rounded-2xl border border-[var(--border)]">
                  {TOURNAMENT_MODE_CATALOG.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => {
                        setDypMode(m.key);
                        if (!m.supportsSingles) setTeamFormat('pairs');
                      }}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-colors text-left flex items-center gap-1.5 ${
                        dypMode === m.key
                          ? 'bg-[#2ea6ff] text-white shadow-sm'
                          : 'text-[var(--muted)]'
                      }`}
                    >
                      <span>{m.emoji}</span>
                      <span className="truncate">{m.title}</span>
                    </button>
                  ))}
                </div>

                {TOURNAMENT_MODE_CATALOG.find((m) => m.key === dypMode)?.supportsSingles && (
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {(['pairs', 'single'] as TeamFormat[]).map((tf) => (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => setTeamFormat(tf)}
                        className={`py-1.5 px-2.5 rounded-xl text-xs font-bold border ${
                          teamFormat === tf
                            ? 'bg-[#2ea6ff]/15 text-[#2ea6ff] border-[#2ea6ff]'
                            : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'
                        }`}
                      >
                        {tf === 'pairs' ? '👥 Пары (2×2)' : '👤 1×1'}
                      </button>
                    ))}
                  </div>
                )}

                {dypMode === 'round_robin' && (
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-[var(--muted)]">Кругов:</span>
                    <div className="flex gap-1.5">
                      {[1, 2].map((loops) => (
                        <button
                          key={loops}
                          type="button"
                          onClick={() => setRoundRobinLoops(loops)}
                          className={`px-3 py-1 rounded-xl font-bold border ${
                            roundRobinLoops === loops
                              ? 'bg-[#2ea6ff] text-white border-[#2ea6ff]'
                              : 'bg-[var(--bg)] text-[var(--muted)] border-[var(--border)]'
                          }`}
                        >
                          {loops}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {dypMode === 'last_one_standing' && (
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-[var(--muted)]">Жизней (сердец):</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={losLives}
                      onChange={(e) => setLosLives(Math.max(1, Math.min(10, Number(e.target.value) || 3)))}
                      className="w-16 bg-[var(--bg)] border border-[var(--border)] rounded-xl py-1 text-center font-bold text-[var(--text)]"
                    />
                  </div>
                )}
              </div>

              <div className="p-4 border-b border-[var(--border)] grid grid-cols-2 gap-2.5 text-xs">
                <div>
                  <div className="text-[var(--muted)] mb-1">Алерт долгого матча (мин)</div>
                  <input
                    type="number"
                    min={3}
                    max={120}
                    value={longMatchAlertMin}
                    onChange={(e) => setLongMatchAlertMin(Math.max(3, Number(e.target.value) || 15))}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-2.5 py-1.5 font-bold text-[var(--text)]"
                  />
                </div>
                <div>
                  <div className="text-[var(--muted)] mb-1">Напомнить счёт через (мин)</div>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={scoreReminderMin}
                    onChange={(e) => setScoreReminderMin(Math.max(1, Number(e.target.value) || 3))}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-2.5 py-1.5 font-bold text-[var(--text)]"
                  />
                </div>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div>
                  <div className="font-medium text-white text-sm flex items-center gap-1.5">
                    <span>🧺 Корзины A / B</span>
                    <BucketsTooltip />
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5 leading-tight">
                    Предпочитать пары A + B при жеребьёвке
                  </div>
                </div>
                <Toggle
                  checked={useBuckets}
                  onChange={setUseBuckets}
                  color="green"
                  ariaLabel="Корзины A и B"
                />
              </div>
            </>
          )}
        </div>

        {/* Qualification Rules */}
        {canEditPlayoff && (
          <div>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2 tracking-wider flex items-center gap-2 px-1">
              <Hash size={13} /> Квалификация (Группа)
            </h3>
            <div className="bg-[#2c2c2e] rounded-2xl border border-[#3a3a3c] overflow-hidden">
              <div className="p-4 border-b border-[#3a3a3c]/60 flex justify-between items-center">
                <div className="font-medium text-sm text-white">Играем до (голов)</div>
                <div className="flex items-center gap-3 bg-[#1c1c1d] rounded-xl p-1 border border-[#3a3a3c]">
                  <button
                    type="button"
                    onClick={() => setTargetScore(Math.max(1, targetScore - 1))}
                    className="w-8 h-8 flex items-center justify-center text-gray-400 active:scale-95"
                  >
                    <Minus size={16} />
                  </button>
                  <div className="font-bold w-6 text-center text-[#2ea6ff]">{targetScore}</div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = targetScore + 1;
                      setTargetScore(next);
                      setMaxScore(Math.max(maxScore, next));
                    }}
                    className="w-8 h-8 flex items-center justify-center text-gray-400 active:scale-95"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div>
                  <div className="font-medium text-sm text-white">Баланс</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">Разница в 2 мяча</div>
                </div>
                <Toggle
                  checked={winByTwo}
                  onChange={setWinByTwo}
                  color="green"
                  ariaLabel="Баланс в квалификации"
                />
              </div>

              {winByTwo && (
                <div className="p-4 border-t border-[#3a3a3c]/60 flex justify-between items-center bg-[#1c1c1d]/40">
                  <div className="font-medium text-sm text-gray-300">Жесткий лимит голов</div>
                  <div className="flex items-center gap-3 bg-[#1c1c1d] rounded-xl p-1 border border-[#3a3a3c]">
                    <button
                      type="button"
                      onClick={() => setMaxScore(Math.max(targetScore, maxScore - 1))}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 active:scale-95"
                    >
                      <Minus size={16} />
                    </button>
                    <div className="font-bold w-6 text-center">{maxScore}</div>
                    <button
                      type="button"
                      onClick={() => setMaxScore(maxScore + 1)}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 active:scale-95"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Playoff Rules */}
        {canEditPlayoff && (
          <div>
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2 tracking-wider flex items-center gap-2 px-1">
              <Trophy size={13} /> Плей-офф
            </h3>
            <div className="bg-[#2c2c2e] rounded-2xl border border-[#3a3a3c] overflow-hidden">
              <div className="p-4 border-b border-[#3a3a3c]/60 flex justify-between items-center">
                <div className="font-medium text-sm text-white">Выходят из группы</div>
                <select
                  value={playoffSize}
                  onChange={(e) => setPlayoffSize(Number(e.target.value))}
                  className="bg-[#1c1c1d] border border-[#3a3a3c] text-white font-bold text-sm rounded-lg px-3 py-1.5 outline-none"
                >
                  <option value={4}>Топ-4</option>
                  <option value={8}>Топ-8</option>
                  <option value={16}>Топ-16</option>
                  <option value={32}>Топ-32</option>
                </select>
              </div>

              <div className="p-4 border-b border-[#3a3a3c]/60 flex justify-between items-center">
                <div className="font-medium text-sm text-white">Матч за 3-е место</div>
                <Toggle
                  checked={thirdPlaceMatch}
                  onChange={setThirdPlaceMatch}
                  color="blue"
                  ariaLabel="Матч за 3-е место"
                />
              </div>

              <div className="p-4 border-b border-[#3a3a3c]/60 flex justify-between items-center bg-[#1c1c1d]/25">
                <div className="font-medium text-sm text-gray-300">Формат матчей</div>
                <select
                  value={playoffFormat}
                  onChange={(e) => setPlayoffFormat(e.target.value as PlayoffFormat)}
                  className="bg-[#1c1c1d] border border-[#3a3a3c] text-yellow-500 font-bold text-sm rounded-lg px-3 py-1.5 outline-none"
                >
                  <option value="best_of_1">Best of 1</option>
                  <option value="best_of_3">Best of 3</option>
                  <option value="best_of_5">Best of 5</option>
                </select>
              </div>

              <div className="p-4 border-b border-[#3a3a3c]/60 flex justify-between items-center bg-[#1c1c1d]/25">
                <div className="font-medium text-sm text-gray-300">Играем до (голов)</div>
                <div className="flex items-center gap-3 bg-[#1c1c1d] rounded-xl p-1 border border-[#3a3a3c]">
                  <button
                    type="button"
                    onClick={() => setPlayoffTargetScore(Math.max(1, playoffTargetScore - 1))}
                    className="w-8 h-8 flex items-center justify-center text-gray-400 active:scale-95"
                  >
                    <Minus size={16} />
                  </button>
                  <div className="font-bold w-6 text-center text-yellow-500">
                    {playoffTargetScore}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = playoffTargetScore + 1;
                      setPlayoffTargetScore(next);
                      setPlayoffMaxScore(Math.max(playoffMaxScore, next));
                    }}
                    className="w-8 h-8 flex items-center justify-center text-gray-400 active:scale-95"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className="p-4 flex justify-between items-center bg-[#1c1c1d]/25">
                <div className="font-medium text-sm text-gray-300">Баланс</div>
                <Toggle
                  checked={playoffWinByTwo}
                  onChange={setPlayoffWinByTwo}
                  color="yellow"
                  ariaLabel="Баланс в плей-офф"
                />
              </div>

              {playoffWinByTwo && (
                <div className="p-4 border-t border-[#3a3a3c]/60 flex justify-between items-center bg-[#1c1c1d]/40">
                  <div className="font-medium text-sm text-gray-300">Жесткий лимит голов</div>
                  <div className="flex items-center gap-3 bg-[#1c1c1d] rounded-xl p-1 border border-[#3a3a3c]">
                    <button
                      type="button"
                      onClick={() =>
                        setPlayoffMaxScore(Math.max(playoffTargetScore, playoffMaxScore - 1))
                      }
                      className="w-8 h-8 flex items-center justify-center text-gray-400 active:scale-95"
                    >
                      <Minus size={16} />
                    </button>
                    <div className="font-bold w-6 text-center text-yellow-500">
                      {playoffMaxScore}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPlayoffMaxScore(playoffMaxScore + 1)}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 active:scale-95"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={handleSave}
          className="w-full bg-[#2ea6ff] text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(46,166,255,0.35)] active:scale-[0.98] disabled:opacity-50"
        >
          <Save size={17} /> {busy ? 'Сохранение...' : 'Сохранить изменения'}
        </button>

        {/* Public Live Broadcast */}
        {onToggleLive && (
          <div className="bg-[#2c2c2e] rounded-2xl border border-[#3a3a3c] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-white text-sm flex items-center gap-1.5">
                  <Radio size={15} className={tournament.publicPath ? 'text-green-400' : 'text-gray-400'} />
                  Публичная Live-ссылка
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5 leading-tight">
                  Табло, таблица и сетка в любом браузере без входа в Telegram
                </div>
              </div>
              <Toggle
                checked={Boolean(tournament.publicPath)}
                disabled={busy}
                onChange={(next) => onToggleLive(next)}
                color="green"
                ariaLabel="Публичная Live-ссылка"
              />
            </div>

            {tournament.publicPath && (
              <div className="pt-1">
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
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="pt-2 space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={busy || transferCandidates.length === 0}
              onClick={() => setShowTransferModal(true)}
              className="bg-[#2c2c2e] border border-[#3a3a3c] disabled:opacity-40 text-yellow-400 py-3 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <Crown size={15} /> Передать права
            </button>

            {!confirmDelete ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
                className="bg-red-500/10 border border-red-500/25 text-red-400 py-3 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98]"
              >
                <Trash2 size={15} /> Удалить дип
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={onDelete}
                className="bg-red-600 text-white py-3 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98]"
              >
                <Trash2 size={15} /> Точно удалить?
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Transfer Admin Modal (gym-gym Modal) */}
      {showTransferModal && (
        <Modal
          title={
            <span className="flex items-center gap-2">
              <Crown size={18} className="text-yellow-500" /> Передать права организатора
            </span>
          }
          onClose={() => setShowTransferModal(false)}
        >
          <div className="space-y-2">
            {transferCandidates.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={async () => {
                  await onTransferAdmin(p.id);
                  setShowTransferModal(false);
                  onBack();
                }}
                className="w-full text-left bg-[var(--bg)] hover:bg-[var(--bg-3)] border border-[var(--border-strong)] rounded-xl px-4 py-3 flex items-center justify-between active:scale-[0.99]"
              >
                <span className="font-semibold text-sm text-white">{p.name}</span>
                <span className="text-xs text-[#2ea6ff] font-bold">Выбрать</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
};
