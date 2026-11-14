import { table, integer, text, index } from 'sdk/db';
import { sql } from 'sdk/db';

export const supportDialogs = table('support_dialogs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userChatId: text('user_chat_id').unique().notNull(),
  userTelegramId: text('user_telegram_id'),
  userName: text('user_name'),
  userUsername: text('user_username'),
  lastMessageAt: integer('last_message_at').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  lastMsgIdx: index('idx_support_dialogs_last_msg').on(t.lastMessageAt),
}));

export const supportMessages = table('support_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  adminMessageId: text('admin_message_id').unique().notNull(),
  userChatId: text('user_chat_id').notNull(),
  answeredAt: integer('answered_at'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const supportTargets = table('support_targets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  adminChatId: text('admin_chat_id').unique().notNull(),
  userChatId: text('user_chat_id').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const supportConfig = table('support_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').unique().notNull(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
