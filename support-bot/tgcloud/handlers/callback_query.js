import {
  answerCallback,
  answering,
  dialogName,
  getAdminChatId,
  parseAnswerData,
  setAdminTarget,
} from '../lib/support.js';

export default async function (callbackQuery) {
  try {
    const userChatId = parseAnswerData(callbackQuery?.data);
    const chatId = String(callbackQuery?.message?.chat?.id ?? '');
    const adminChatId = await getAdminChatId();

    if (!adminChatId || chatId !== adminChatId) {
      await answerCallback(callbackQuery?.id, 'Нет прав для ответа.');
      return;
    }

    if (!userChatId) {
      await answerCallback(callbackQuery?.id, 'Не понял выбор. Откройте список заново.');
      return;
    }

    await setAdminTarget(chatId, userChatId);
    const name = await dialogName(userChatId);
    await answerCallback(callbackQuery?.id, answering(name));
  } catch (err) {
    console.error('[SUPPORT_BOT] callback_query error:', err?.message || err);
    await answerCallback(callbackQuery?.id, 'Ошибка обработки, попробуйте снова.');
  }
}
