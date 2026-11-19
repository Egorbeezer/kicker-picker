import React from 'react';
import { haptic } from '../utils/telegram';

interface Props {
  score: number;
  maxScore: number;
  onChange: (nextScore: number) => void;
}

/**
 * Полоса быстрого выбора счёта (цифры 1..N без кнопок + / -).
 * Повторное нажатие по выбранной цифре сбрасывает счёт в 0.
 */
export const ScorePickerRow: React.FC<Props> = ({ score, maxScore, onChange }) => {
  const safeMax = Math.max(1, maxScore);
  const digits = Array.from({ length: safeMax }, (_, i) => i + 1);
  const useSingleGrid = safeMax <= 7;

  return (
    <div
      className={
        useSingleGrid
          ? 'grid gap-1.5 w-full'
          : 'grid grid-cols-7 gap-1.5 w-full'
      }
      style={useSingleGrid ? { gridTemplateColumns: `repeat(${safeMax}, minmax(0, 1fr))` } : undefined}
    >
      {digits.map((digit) => {
        const selected = score === digit;
        return (
          <button
            key={digit}
            type="button"
            onClick={() => {
              haptic('light');
              onChange(selected ? 0 : digit);
            }}
            className={`h-11 rounded-[14px] font-semibold text-base transition-[colors,transform] duration-150 ease-out active:scale-95 active:translate-y-[1px] active:shadow-none border ${
              selected
                ? 'bg-[#2ea6ff] text-white border-[#2ea6ff] shadow-[0_4px_14px_rgba(46,166,255,0.45)]'
                : 'bg-[var(--bg-3)] text-[var(--text)] border-[var(--border-strong)] shadow-[0_3px_8px_var(--shadow),inset_0_1px_0_rgba(255,255,255,0.12)] hover:border-[#2ea6ff]/50'
            }`}
          >
            {digit}
          </button>
        );
      })}
    </div>
  );
};
