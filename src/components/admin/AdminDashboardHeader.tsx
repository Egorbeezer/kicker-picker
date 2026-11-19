import React from 'react';
import { Clock, Radio, RefreshCw, Settings, Share2 } from 'lucide-react';
import type { Tournament, TournamentTimings } from '../../types';
import { formatTimeHm } from '../../utils/date';
import { shareTournamentInTelegram } from '../../utils/share';
import { getDypModeLabel } from '../InfoTooltip';

interface Props {
  tournament: Tournament;
  timings: TournamentTimings | null | undefined;
  activeTablesCount: number;
  finishedCount: number;
  totalCount: number;
  onShowLive: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
}

export const AdminDashboardHeader: React.FC<Props> = ({
  tournament,
  timings,
  activeTablesCount,
  finishedCount,
  totalCount,
  onShowLive,
  onRefresh,
  onOpenSettings,
}) => (
  <div className="p-4 border-b border-[#3a3a3c] bg-[#2c2c2e] sticky top-0 z-10">
    <div className="flex justify-between items-center gap-2">
      <h2 className="text-xl font-bold truncate pr-2">{tournament.name}</h2>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onShowLive}
          className={`p-1.5 rounded-lg border active:scale-95 ${
            tournament.publicPath
              ? 'bg-green-500/15 text-green-400 border-green-500/35'
              : 'bg-[#1c1c1d] text-gray-300 border-[#3a3a3c]'
          }`}
          title="Публичная Live-ссылка"
          aria-label="Публичная Live-ссылка"
        >
          <Radio size={15} />
        </button>
        <button
          type="button"
          onClick={() => shareTournamentInTelegram({ id: tournament.id, name: tournament.name })}
          className="bg-[#2ea6ff]/15 text-[#2ea6ff] border border-[#2ea6ff]/30 p-1.5 rounded-lg active:scale-95"
          title="Поделиться ссылкой"
          aria-label="Поделиться ссылкой"
        >
          <Share2 size={15} />
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="bg-[#1c1c1d] text-gray-300 border border-[#3a3a3c] p-1.5 rounded-lg active:scale-95"
          title="Обновить"
          aria-label="Обновить"
        >
          <RefreshCw size={15} />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="bg-[#1c1c1d] text-gray-200 border border-[#3a3a3c] p-1.5 rounded-lg active:scale-95"
          title="Настройки турнира"
          aria-label="Настройки турнира"
        >
          <Settings size={15} />
        </button>
      </div>
    </div>

    <div className="flex justify-between items-center mt-2">
      <span className="text-xs text-gray-400">
        {tournament.status === 'REGISTRATION' && 'Регистрация'}
        {tournament.status === 'QUALIFICATION' && `Квалификация • Раунд ${tournament.currentRound}`}
        {tournament.status === 'PLAYOFF' && `Плей-офф • Раунд ${tournament.currentRound}`}
        {tournament.status === 'FINISHED' && 'Турнир завершен'}
        {' • '}
        {getDypModeLabel(tournament.dypMode)}
        {tournament.useBuckets ? ' (A/B)' : ''}
        {' • '}Столов: {activeTablesCount}/{tournament.tablesCount}
        {tournament.autoRounds ? ' • Авто' : ''}
      </span>
      {totalCount > 0 && (
        <span className="text-sm font-medium text-[#2ea6ff]">
          Сыграно {finishedCount} из {totalCount}
        </span>
      )}
    </div>

    {totalCount > 0 && (
      <div className="w-full bg-[#1c1c1d] h-2 rounded-full mt-3 overflow-hidden border border-[#3a3a3c]">
        <div
          className="bg-[#2ea6ff] h-full transition-[width] duration-500 ease-out"
          style={{ width: `${(finishedCount / totalCount) * 100}%` }}
        />
      </div>
    )}

    {timings && (timings.playedCount > 0 || timings.elapsedMinutes > 0) && (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 mt-2.5 pt-2 border-t border-[#3a3a3c]/50">
        <span className="flex items-center gap-1">
          <Clock size={12} className="text-[#2ea6ff]" />
          Идёт: <strong className="text-white">{timings.elapsedMinutes} мин</strong>
        </span>
        {timings.avgMatchMinutes !== null && (
          <span>
            Матч: <strong className="text-white">~{timings.avgMatchMinutes} мин</strong>
          </span>
        )}
        <span>
          Всего игр: <strong className="text-white">{timings.playedCount}/{timings.totalCount}</strong>
        </span>
        {timings.estimatedEndAt && tournament.status !== 'FINISHED' && (
          <span>
            Раунд до: <strong className="text-[#2ea6ff]">{formatTimeHm(timings.estimatedEndAt)}</strong>
          </span>
        )}
      </div>
    )}
  </div>
);
