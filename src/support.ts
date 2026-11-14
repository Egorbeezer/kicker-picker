/** Username бота поддержки без `@`. */
export const SUPPORT_BOT_USERNAME = 'kickerpickersupportbot';

/** Ссылка на диалог с ботом поддержки в Telegram. */
export const SUPPORT_LINK = `https://t.me/${SUPPORT_BOT_USERNAME}`;

/** Текст широкой кнопки поддержки на экранах сбоя / вне Telegram. */
export const SUPPORT_BUTTON = '🛠️ Написать в поддержку';

/** Подсказка рядом с кнопкой поддержки на экране ошибки загрузки. */
export const SUPPORT_HINT =
  'Если приложение не отвечает или нужна помощь — напишите или отправьте файл в бот поддержки:';

/**
 * Открывает чат с ботом поддержки в Telegram (через WebApp API внутри Mini App,
 * или в новой вкладке при открытии в обычном браузере).
 */
export function openTelegramChat(link: string = SUPPORT_LINK): void {
  try {
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(link);
      return;
    }
  } catch {
    // fallback to browser window.open
  }
  window.open(link, '_blank', 'noopener,noreferrer');
}
