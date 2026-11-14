import { TelegramIcon } from './TelegramIcon';
import { openTelegramChat, SUPPORT_LINK } from '../support';
import { haptic } from '../utils/telegram';

/**
 * Широкая капсульная кнопка поддержки в сквозной шапке (Telegram-иконка + 🛠️),
 * по клику открывает чат с @kickerpickersupportbot (по примеру gym gym).
 */
export const SupportHeaderButton = ({ className = '' }: { className?: string }) => (
  <button
    type="button"
    onClick={() => {
      haptic('light');
      openTelegramChat(SUPPORT_LINK);
    }}
    className={`min-w-[62px] h-10 px-2.5 rounded-full bg-[var(--bg-3)] border border-[var(--border-strong)] inline-flex items-center justify-center gap-1.5 text-[var(--text)] text-[13px] font-medium leading-none active:scale-95 transition-transform shrink-0 ${className}`.trim()}
    aria-label="Поддержка"
    title="Написать в поддержку"
    data-testid="header-support-btn"
  >
    <TelegramIcon size={20} />
    <span aria-hidden="true">🛠️</span>
  </button>
);
