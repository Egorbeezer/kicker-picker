import {
  ADMIN_HELLO,
  LIST_HEADER,
  NO_ADMIN_YET,
  NO_DIALOGS,
  UNKNOWN_REPLY,
  USER_ACK,
  USER_HELLO,
  answerKeyboard,
  claimAdminChatId,
  clearAdminTarget,
  copySupportMessage,
  couldNotReach,
  detectAttachment,
  dialogHeader,
  dialogInfo,
  dialogName,
  dialogsForAnswer,
  failedToUser,
  fallbackText,
  getAdminChatId,
  isSupportOwner,
  markAnswered,
  markDelivered,
  rememberAdminMessage,
  rememberDialog,
  replyFailureKind,
  resolveTarget,
  sendSupportMessage,
  sentTo,
  withHeader,
} from '../lib/support.js';

async function handlePerson(message, chatId, adminChatId) {
  const info = dialogInfo(message);
  if (!info) return;
  const text = String(message?.text || '');

  if (text.startsWith('/start') || text.startsWith('/help')) {
    await sendSupportMessage(chatId, USER_HELLO);
    return;
  }

  const first = await rememberDialog(info);

  if (!adminChatId) {
    await sendSupportMessage(chatId, USER_ACK);
    console.warn('[SUPPORT_BOT] Message received before /setadmin was claimed', { chatId });
    return;
  }

  const header = dialogHeader(info, first);
  const attachment = detectAttachment(message);
  let delivered;

  if (attachment) {
    const captionWithHeader = withHeader(header, String(message?.caption || ''));
    const canSendInlineCaption =
      attachment.supportsCaption && captionWithHeader.length <= 1000;

    if (canSendInlineCaption) {
      const copied = await copySupportMessage(
        chatId,
        message.message_id,
        adminChatId,
        captionWithHeader
      );
      delivered = copied.ok;
      if (copied.ok && copied.messageId !== null) {
        await rememberAdminMessage(copied.messageId, chatId);
      }
    } else {
      const headSent = await sendSupportMessage(
        adminChatId,
        withHeader(header, String(message?.caption || ''))
      );
      if (headSent.ok && headSent.messageId !== null) {
        await rememberAdminMessage(headSent.messageId, chatId);
      }
      const copied = await copySupportMessage(chatId, message.message_id, adminChatId);
      delivered = copied.ok;
      if (copied.ok && copied.messageId !== null) {
        await rememberAdminMessage(copied.messageId, chatId);
      }
    }
  } else {
    const sent = await sendSupportMessage(adminChatId, withHeader(header, text));
    delivered = sent.ok;
    if (sent.ok && sent.messageId !== null) {
      await rememberAdminMessage(sent.messageId, chatId);
    }
  }

  if (!delivered) {
    const fbSent = await sendSupportMessage(adminChatId, fallbackText(info, message));
    if (fbSent.ok && fbSent.messageId !== null) {
      await rememberAdminMessage(fbSent.messageId, chatId);
      delivered = true;
    }
  }

  if (first && delivered) {
    await sendSupportMessage(chatId, USER_ACK);
  }
}

async function handleAdmin(message, adminId) {
  const text = String(message?.text || '');
  if (text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/setadmin')) {
    await sendSupportMessage(adminId, ADMIN_HELLO);
    return;
  }

  const replyTo = message?.reply_to_message?.message_id;
  const target = await resolveTarget({ replyToMessageId: replyTo ?? null, adminChatId: adminId });

  if (!target) {
    const dialogs = await dialogsForAnswer();
    if (dialogs.length === 0) {
      await sendSupportMessage(adminId, NO_DIALOGS);
      return;
    }
    const header = replyTo !== undefined && replyTo !== null ? UNKNOWN_REPLY : LIST_HEADER;
    await sendSupportMessage(adminId, header, answerKeyboard(dialogs));
    return;
  }

  const forwarded = await copySupportMessage(adminId, message.message_id, target.chatId);
  if (!forwarded.ok) {
    const gone = replyFailureKind(forwarded.errorCode, forwarded.reason) === 'gone';
    if (gone) {
      if (target.via === 'reply' && replyTo !== undefined) await markAnswered(replyTo);
      else await clearAdminTarget(adminId);
      const dialogs = await dialogsForAnswer();
      await sendSupportMessage(
        adminId,
        couldNotReach(await dialogName(target.chatId)),
        dialogs.length > 0 ? answerKeyboard(dialogs) : undefined
      );
    } else {
      await sendSupportMessage(adminId, failedToUser(forwarded.reason));
    }
    return;
  }

  await markDelivered(adminId, message.message_id);
  if (target.via === 'reply' && replyTo !== undefined) await markAnswered(replyTo);
  else await clearAdminTarget(adminId);

  const name = await dialogName(target.chatId);
  await sendSupportMessage(adminId, sentTo(name));
}

export default async function (message) {
  if (!message || message.chat?.type !== 'private') return;
  try {
    const chatId = String(message.chat.id);
    const text = String(message.text || '');

    if (text.trim() === '/setadmin') {
      if (!isSupportOwner(message.from)) {
        await sendSupportMessage(chatId, '⛔ Команда /setadmin доступна только владельцу бота.');
        return;
      }
      const claim = await claimAdminChatId(chatId, Date.now(), { force: true });
      if (claim.ok) {
        await sendSupportMessage(chatId, `✅ Вы назначены администратором поддержки.\n\n${ADMIN_HELLO}`);
      } else {
        await sendSupportMessage(chatId, '⛔ Не удалось привязать администратора поддержки.');
      }
      return;
    }

    const adminChatId = await getAdminChatId();
    if (adminChatId && chatId === adminChatId) {
      await handleAdmin(message, chatId);
      return;
    }

    if (!adminChatId && text.startsWith('/admin')) {
      await sendSupportMessage(chatId, NO_ADMIN_YET);
      return;
    }

    await handlePerson(message, chatId, adminChatId);
  } catch (err) {
    console.error('[SUPPORT_BOT] message handler error:', err?.message || err);
  }
}
