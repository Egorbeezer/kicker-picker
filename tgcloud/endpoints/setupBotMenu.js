import { EndpointError } from 'sdk';
import { syncBotMenuSettings } from '../lib/botMenu.js';

/**
 * Серверный запуск настройки команд (/start) и menu_button бота через `npx tgcloud run endpoints/setupBotMenu '{}'`.
 * Вызовы из клиентского Mini App (где присутствует ctx.initData.user) отклоняются.
 */
export default async function (_input, ctx) {
  if (ctx?.initData?.user) {
    throw new EndpointError('Forbidden', { code: 'FORBIDDEN' });
  }
  return await syncBotMenuSettings();
}
