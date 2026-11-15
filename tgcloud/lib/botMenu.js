import { api } from 'sdk';

/**
 * Удаляет список команд бота (чтобы скрыть гамбургер-кнопку «Меню» в диалоге)
 * и сбрасывает кнопку меню чата в default (без отдельного web_app окна).
 * Вход в приложение остаётся единым через закреплённое сообщение /start и ссылки t.me/...
 */
export async function syncBotMenuSettings() {
  await api.deleteMyCommands({});
  await api.setChatMenuButton({ menu_button: { type: 'default' } });
  return { ok: true, commands: [], menuButton: 'default' };
}

export default syncBotMenuSettings;
