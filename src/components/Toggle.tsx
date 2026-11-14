import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  color?: 'green' | 'blue' | 'yellow';
  ariaLabel?: string;
}

const ACTIVE_BG: Record<NonNullable<ToggleProps['color']>, string> = {
  green: 'bg-green-500 border-green-500',
  blue: 'bg-[#2ea6ff] border-[#2ea6ff]',
  yellow: 'bg-yellow-500 border-yellow-500',
};

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  color = 'green',
  ariaLabel,
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`w-12 h-6 rounded-full relative transition-colors duration-200 shrink-0 border disabled:opacity-50 ${
        checked ? ACTIVE_BG[color] : 'bg-[#1c1c1d] border-[#3a3a3c]'
      }`}
    >
      <span
        className={`absolute top-[1px] left-[2px] w-5 h-5 rounded-full transition-transform duration-200 shadow-sm ${
          checked ? 'translate-x-[22px] bg-white' : 'translate-x-0 bg-gray-400'
        }`}
      />
    </button>
  );
};
