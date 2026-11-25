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
            className={`h-11 rounded-[14px] text-base transition-[colors,transform] duration-150 ease-out active:scale-95 border ${
              selected
                ? 'bg-[var(--accent)] text-[var(--on-accent)] border-[var(--accent)] font-bold shadow-[0_1px_2px_rgba(14,15,12,0.08)]'
                : 'bg-[var(--bg)] text-[var(--text)] border-[var(--border-strong)] font-semibold shadow-[0_1px_2px_rgba(14,15,12,0.06)] hover:border-[var(--accent-text)]'
            }`}
          >
            {digit}
          </button>
        );
      })}
    </div>
  );
};
