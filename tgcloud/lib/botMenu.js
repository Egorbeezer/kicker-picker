import { api } from 'sdk';

export const BOT_COMMANDS = [
  { command: 'start', description: 'Открыть Кикер Пикер' },
];

/**
 * Устанавливает единственную быструю команду /start и переводит кнопку меню чата
 * в режим commands (без web_app), чтобы все входы открывали единый Main Mini App.
 */
export async function syncBotMenuSettings() {
  await api.setMyCommands({ commands: BOT_COMMANDS });
  await api.setChatMenuButton({ menu_button: { type: 'commands' } });
  return { ok: true, commands: BOT_COMMANDS, menuButton: 'commands' };
}

export default syncBotMenuSettings;
