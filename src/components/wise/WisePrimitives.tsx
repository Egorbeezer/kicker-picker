import React from 'react';
import { Loader2, Search } from 'lucide-react';
import { haptic } from '../../utils/telegram';

export const WiseScreenHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, left, right, className = '' }) => (
  <div className={`flex items-start justify-between gap-3 ${className}`.trim()}>
    <div className="flex items-start gap-2.5 min-w-0 flex-1">
      {left && <div className="shrink-0 pt-0.5">{left}</div>}
      <div className="min-w-0 flex-1">
        <h2 className="text-[22px] leading-tight font-bold tracking-tight text-[var(--text)] truncate">
          {title}
        </h2>
        {subtitle && (
          <div className="text-xs text-[var(--muted)] mt-1 leading-snug">{subtitle}</div>
        )}
      </div>
    </div>
    {right && <div className="shrink-0 flex items-center gap-1.5">{right}</div>}
  </div>
);

export const WiseCard: React.FC<{
  children: React.ReactNode;
  accent?: boolean;
  className?: string;
}> = ({ children, accent = false, className = '' }) => (
  <div
    className={`rounded-[24px] p-4 ${
      accent
        ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent-text)]/30'
        : 'bg-[var(--card)]'
    } ${className}`.trim()}
  >
    {children}
  </div>
);

export const WiseCircleAction: React.FC<{
  icon: React.ReactNode;
  label: string;
  variant?: 'accent' | 'surface' | 'warn' | 'danger';
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  ariaLabel?: string;
  testId?: string;
}> = ({
  icon,
  label,
  variant = 'surface',
  disabled = false,
  active = false,
  onClick,
  title,
  ariaLabel,
  testId,
}) => {
  const circleCls =
    variant === 'accent'
      ? 'bg-[var(--accent)] text-[var(--on-accent)]'
      : variant === 'warn'
        ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
        : variant === 'danger'
          ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
          : active
            ? 'bg-[var(--accent-soft)] text-[var(--accent-text)] ring-1 ring-[var(--accent-text)]/30'
            : 'bg-[var(--card)] text-[var(--text)]';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        haptic('light');
        onClick?.();
      }}
      title={title || label}
      aria-label={ariaLabel || label}
      data-testid={testId}
      className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-45 min-w-0"
    >
      <span className={`w-12 h-12 rounded-full flex items-center justify-center ${circleCls}`}>
        {icon}
      </span>
      <span className="text-[11px] font-semibold text-[var(--text)] truncate max-w-full">
        {label}
      </span>
    </button>
  );
};

export const WisePillButton: React.FC<{
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'warn' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  title?: string;
  ariaLabel?: string;
  type?: 'button' | 'submit';
}> = ({
  children,
  variant = 'primary',
  loading = false,
  disabled = false,
  onClick,
  className = '',
  title,
  ariaLabel,
  type = 'button',
}) => {
  const variantCls =
    variant === 'primary'
      ? 'bg-[var(--accent)] text-[var(--on-accent)] font-bold'
      : variant === 'warn'
        ? 'bg-[var(--warn-soft)] text-[var(--warn)] font-bold'
        : variant === 'danger'
          ? 'bg-[var(--danger-soft)] text-[var(--danger)] font-bold'
          : variant === 'ghost'
            ? 'bg-transparent text-[var(--text)] border border-[var(--border-strong)] font-semibold'
            : 'bg-[var(--card)] text-[var(--text)] font-semibold';

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={() => {
        haptic('light');
        onClick?.();
      }}
      title={title}
      aria-label={ariaLabel}
      className={`rounded-full py-3 px-4 text-sm inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-45 ${variantCls} ${className}`.trim()}
    >
      {loading && <Loader2 size={16} className="animate-spin shrink-0" />}
      {children}
    </button>
  );
};

export function WiseSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: ReadonlyArray<{ value: T; label: React.ReactNode }>;
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-1 bg-[var(--card)] p-1 rounded-full ${className}`.trim()}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              haptic('light');
              onChange(opt.value);
            }}
            className={`py-2 px-2.5 rounded-full text-xs font-bold transition-colors truncate ${
              isActive
                ? 'bg-[var(--bg)] text-[var(--text)] shadow-sm'
                : 'text-[var(--muted)]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export const WiseSearchInput: React.FC<{
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}> = ({ value, onChange, placeholder, ariaLabel, className = '' }) => (
  <div className={`relative ${className}`.trim()}>
    <Search
      size={15}
      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
    />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className="w-full bg-[var(--card)] rounded-full pl-9 pr-4 py-2.5 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-text)]/35"
    />
  </div>
);

export const WiseProgressBar: React.FC<{
  value: number;
  max: number;
  className?: string;
}> = ({ value, max, className = '' }) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`w-full h-1.5 rounded-full bg-[var(--bg-3)] overflow-hidden ${className}`.trim()}>
      <div
        className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

export const WiseList: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`divide-y divide-[var(--border)] ${className}`.trim()}>{children}</div>
);

export const WiseListRow: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`py-3 px-1 flex items-center justify-between gap-3 ${className}`.trim()}>
    {children}
  </div>
);
