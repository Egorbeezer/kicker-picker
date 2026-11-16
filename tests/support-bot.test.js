import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

let sqlite = new DatabaseSync(':memory:');

function initSupportSchema(conn) {
  conn.exec(`
    CREATE TABLE support_dialogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_chat_id TEXT UNIQUE NOT NULL,
      user_telegram_id TEXT,
      user_name TEXT,
      user_username TEXT,
      last_message_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_message_id TEXT UNIQUE NOT NULL,
      user_chat_id TEXT NOT NULL,
      answered_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE support_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_chat_id TEXT UNIQUE NOT NULL,
      user_chat_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE support_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

function toDbVal(colDef, val) {
  if (val === undefined || val === null) return null;
  if (colDef.mode === 'timestamp') {
    if (val instanceof Date) return Math.floor(val.getTime() / 1000);
  }
  return val;
}

function fromDbRow(tblMeta, row) {
  if (!row) return null;
  const out = {};
  for (const [prop, colDef] of Object.entries(tblMeta.cols)) {
    const raw = row[colDef.colName];
    if (raw === null || raw === undefined) {
      out[prop] = null;
    } else if (colDef.mode === 'timestamp') {
      out[prop] = new Date(Number(raw) * 1000);
    } else {
      out[prop] = raw;
    }
  }
  return out;
}

function compileWhere(node, params) {
  if (!node) return '1=1';
  if (node.kind === 'eq') {
    if (node.val instanceof Date) throw new TypeError('db: unsupported value type: object');
    params.push(toDbVal(node.col, node.val));
    return `${node.col.colName} = ?`;
  }
  if (node.kind === 'gt') {
    if (node.val instanceof Date) throw new TypeError('db: unsupported value type: object');
    params.push(toDbVal(node.col, node.val));
    return `${node.col.colName} > ?`;
  }
  if (node.kind === 'lt') {
    if (node.val instanceof Date) throw new TypeError('db: unsupported value type: object');
    params.push(toDbVal(node.col, node.val));
    return `${node.col.colName} < ?`;
  }
  return '1=1';
}

const sendMessageMock = vi.fn();
const copyMessageMock = vi.fn();
const setMessageReactionMock = vi.fn();
const answerCallbackQueryMock = vi.fn();

vi.mock('sdk', () => {
  const db = {
    select(proj) {
      let tblMeta = null;
      let whereNode = null;
      let orderNode = null;
      const runSelect = () => {
        const params = [];
        const whereSql = compileWhere(whereNode, params);
        const orderSql = orderNode ? ` ORDER BY ${orderNode.col.colName} ${orderNode.dir}` : '';
        const rows = sqlite.prepare(`SELECT * FROM ${tblMeta.tableName} WHERE ${whereSql}${orderSql}`).all(...params);
        const mapped = rows.map((r) => fromDbRow(tblMeta, r));
        if (!proj) return mapped;
        return mapped.map((row) => {
          const picked = {};
          for (const k of Object.keys(proj)) picked[k] = row[k];
          return picked;
        });
      };
      const b = {
        from(t) { tblMeta = t.__meta; return b; },
        where(c) { whereNode = c; return b; },
        orderBy(o) { orderNode = o; return b; },
        all: async () => runSelect(),
        get: async () => runSelect()[0] ?? null,
      };
      return b;
    },
    insert(t) {
      const tblMeta = t.__meta;
      let payload = null;
      let conflict = null;
      let upsertPatch = null;
      let conflictCol = null;
      const execInsert = () => {
        const cols = [];
        const qs = [];
        const vals = [];
        for (const [k, v] of Object.entries(payload)) {
          const col = tblMeta.cols[k];
          if (!col || v === undefined) continue;
          cols.push(col.colName);
          qs.push('?');
          vals.push(toDbVal(col, v));
        }
        if (conflict === 'update' && upsertPatch && conflictCol) {
          const updates = [];
          for (const [k, v] of Object.entries(upsertPatch)) {
            const col = tblMeta.cols[k];
            if (!col || v === undefined) continue;
            updates.push(`${col.colName} = ?`);
            vals.push(toDbVal(col, v));
          }
          return sqlite
            .prepare(
              `INSERT INTO ${tblMeta.tableName} (${cols.join(', ')}) VALUES (${qs.join(', ')}) ON CONFLICT(${conflictCol.colName}) DO UPDATE SET ${updates.join(', ')}`
            )
            .run(...vals);
        }
        const verb = conflict === 'nothing' ? 'INSERT OR IGNORE' : 'INSERT';
        return sqlite.prepare(`${verb} INTO ${tblMeta.tableName} (${cols.join(', ')}) VALUES (${qs.join(', ')})`).run(...vals);
      };
      const b = {
        values(v) { payload = v; return b; },
        onConflictDoNothing() { conflict = 'nothing'; return b; },
        onConflictDoUpdate(opts) { conflict = 'update'; conflictCol = opts.target; upsertPatch = opts.set; return b; },
        then(res, rej) { return Promise.resolve(execInsert()).then(res, rej); },
      };
      return b;
    },
    update(t) {
      const tblMeta = t.__meta;
      let patch = {};
      let whereNode = null;
      const execUpdate = () => {
        const sets = [];
        const vals = [];
        for (const [k, v] of Object.entries(patch)) {
          const col = tblMeta.cols[k];
          if (!col || v === undefined) continue;
          sets.push(`${col.colName} = ?`);
          vals.push(toDbVal(col, v));
        }
        const whereSql = compileWhere(whereNode, vals);
        return sqlite.prepare(`UPDATE ${tblMeta.tableName} SET ${sets.join(', ')} WHERE ${whereSql}`).run(...vals);
      };
      const b = {
        set(p) { patch = p; return b; },
        where(c) { whereNode = c; return b; },
        then(res, rej) { return Promise.resolve(execUpdate()).then(res, rej); },
      };
      return b;
    },
    delete(t) {
      const tblMeta = t.__meta;
      let whereNode = null;
      const execDel = () => {
        const vals = [];
        const whereSql = compileWhere(whereNode, vals);
        return sqlite.prepare(`DELETE FROM ${tblMeta.tableName} WHERE ${whereSql}`).run(...vals);
      };
      const b = {
        where(c) { whereNode = c; return b; },
        then(res, rej) { return Promise.resolve(execDel()).then(res, rej); },
      };
      return b;
    },
  };

  return {
    db,
    api: {
      sendMessage: sendMessageMock,
      copyMessage: copyMessageMock,
      setMessageReaction: setMessageReactionMock,
      answerCallbackQuery: answerCallbackQueryMock,
    },
  };
});

vi.mock('sdk/db', () => {
  const mkCol = (type, colName, opts = {}) => ({
    type,
    colName,
    mode: opts.mode || null,
    primaryKey() { return this; },
    unique() { return this; },
    notNull() { return this; },
    default() { return this; },
  });
  return {
    table: (tableName, cols) => ({ __meta: { tableName, cols }, ...cols }),
    integer: (name, opts) => mkCol('integer', name, opts),
    text: (name) => mkCol('text', name),
    index: () => ({ on: () => ({}) }),
    eq: (col, val) => ({ kind: 'eq', col, val }),
    gt: (col, val) => ({ kind: 'gt', col, val }),
    lt: (col, val) => ({ kind: 'lt', col, val }),
    desc: (col) => ({ col, dir: 'DESC' }),
    sql: (strings) => ({ kind: 'sql', strings }),
  };
});

const handleMessage = (await import('../support-bot/tgcloud/handlers/message.js')).default;
const handleCallback = (await import('../support-bot/tgcloud/handlers/callback_query.js')).default;

let msgSeq = 100;

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  initSupportSchema(sqlite);
  msgSeq = 100;
  sendMessageMock.mockReset().mockImplementation(async () => ({ message_id: ++msgSeq }));
  copyMessageMock.mockReset().mockImplementation(async () => ({ message_id: ++msgSeq }));
  setMessageReactionMock.mockReset().mockResolvedValue(true);
  answerCallbackQueryMock.mockReset().mockResolvedValue(true);
});

describe('Support bot (@kickerpickersupportbot) end-to-end flow', () => {
  it('restricts /setadmin to owner and allows owner chat reassignment', async () => {
    await handleMessage({ chat: { id: 888, type: 'private' }, from: { id: 888, first_name: 'Чужой' }, text: '/setadmin' });
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: '888', text: expect.stringContaining('только владельцу бота') })
    );

    await handleMessage({
      chat: { id: 777, type: 'private' },
      from: { id: 777, first_name: 'Егор', username: 'egor_beezer' },
      text: '/setadmin',
    });
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: '777', text: expect.stringContaining('Вы назначены администратором') })
    );

    // Повторный вызов от постороннего всё так же отклоняется
    await handleMessage({
      chat: { id: 888, type: 'private' },
      from: { id: 888, first_name: 'Чужой', username: 'random_user' },
      text: '/setadmin',
    });
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: '888', text: expect.stringContaining('только владельцу бота') })
    );

    // Владелец может перепривязать админский чат на другой свой чат
    await handleMessage({
      chat: { id: 779, type: 'private' },
      from: { id: 779, first_name: 'Егор', username: 'Egor_Beezer' },
      text: '/setadmin',
    });
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: '779', text: expect.stringContaining('Вы назначены администратором') })
    );
  });

  it('forwards user text, photos, voice and video_note to admin and delivers reply back', async () => {
    await handleMessage({ chat: { id: 777, type: 'private' }, from: { id: 777, first_name: 'Егор', username: 'egor_beezer' }, text: '/setadmin' });
    sendMessageMock.mockClear();

    // User sends /start
    await handleMessage({ chat: { id: 500, type: 'private' }, from: { id: 500, first_name: 'Маша' }, text: '/start' });
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: '500', text: expect.stringContaining('поддержка «кикер пикер»') })
    );

    sendMessageMock.mockClear();
    // User sends a text question
    await handleMessage({
      message_id: 10,
      chat: { id: 500, type: 'private' },
      from: { id: 500, first_name: 'Маша', username: 'masha_k' },
      text: 'Не могу ввести счёт в финале',
    });
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: '777', text: expect.stringContaining('Маша (@masha_k)') })
    );
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: '500', text: expect.stringContaining('Спасибо, получили') })
    );

    const forwardedAdminMsgId = (await sendMessageMock.mock.results[0].value).message_id;
    sendMessageMock.mockClear();

    // User sends a screenshot (photo with caption) and a voice note
    await handleMessage({
      message_id: 11,
      chat: { id: 500, type: 'private' },
      from: { id: 500, first_name: 'Маша', username: 'masha_k' },
      photo: [{ file_id: 'p1' }],
      caption: 'Вот скриншот',
    });
    expect(copyMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: '777',
        from_chat_id: '500',
        message_id: 11,
        caption: expect.stringContaining('Вот скриншот'),
      })
    );

    // User sends a video_note (circle - captions unsupported in Telegram, sends header + copy)
    copyMessageMock.mockClear();
    sendMessageMock.mockClear();
    await handleMessage({
      message_id: 12,
      chat: { id: 500, type: 'private' },
      from: { id: 500, first_name: 'Маша', username: 'masha_k' },
      video_note: { file_id: 'vn1' },
    });
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: '777', text: expect.stringContaining('Маша') })
    );
    expect(copyMessageMock).toHaveBeenCalledWith({
      chat_id: '777',
      from_chat_id: '500',
      message_id: 12,
    });

    // Admin replies directly to the first forwarded message
    copyMessageMock.mockClear();
    sendMessageMock.mockClear();
    await handleMessage({
      message_id: 901,
      chat: { id: 777, type: 'private' },
      from: { id: 777, first_name: 'Егор' },
      reply_to_message: { message_id: forwardedAdminMsgId },
      text: 'Исправили, обновите экран',
    });
    expect(copyMessageMock).toHaveBeenCalledWith({
      chat_id: '500',
      from_chat_id: '777',
      message_id: 901,
    });
    expect(setMessageReactionMock).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: '777', message_id: 901 })
    );
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: '777', text: expect.stringContaining('Отправлено Маша') })
    );
  });

  it('supports inline dialog picker via callback_query and reports blocked users gracefully', async () => {
    await handleMessage({ chat: { id: 777, type: 'private' }, from: { id: 777, first_name: 'Егор', username: 'egor_beezer' }, text: '/setadmin' });
    await handleMessage({
      message_id: 21,
      chat: { id: 600, type: 'private' },
      from: { id: 600, first_name: 'Павел' },
      text: 'Привет!',
    });

    sendMessageMock.mockClear();
    // Admin writes without reply -> shows button list
    await handleMessage({
      message_id: 902,
      chat: { id: 777, type: 'private' },
      from: { id: 777, first_name: 'Егор' },
      text: 'Кому?',
    });
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: '777',
        reply_markup: {
          inline_keyboard: [[{ text: 'Павел', callback_data: 'answer:600' }]],
        },
      })
    );

    // Admin taps "Павел"
    await handleCallback({
      id: 'cb1',
      data: 'answer:600',
      message: { chat: { id: 777 } },
    });
    expect(answerCallbackQueryMock).toHaveBeenCalledWith({
      callback_query_id: 'cb1',
      text: expect.stringContaining('Отвечаете Павел'),
    });

    // Next message fails with 403 blocked -> notifies admin gracefully
    copyMessageMock.mockRejectedValueOnce({ code: 403, description: 'Forbidden: bot was blocked by the user' });
    sendMessageMock.mockClear();
    await handleMessage({
      message_id: 903,
      chat: { id: 777, type: 'private' },
      from: { id: 777, first_name: 'Егор' },
      text: 'Ваш ответ',
    });
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: '777',
        text: expect.stringContaining('удалил переписку с ботом'),
      })
    );
  });

  it('clips oversized messages under Telegram 4096 limit and keeps reply link on fallback', async () => {
    await handleMessage({
      chat: { id: 777, type: 'private' },
      from: { id: 777, first_name: 'Егор', username: 'egor_beezer' },
      text: '/setadmin',
    });
    sendMessageMock.mockClear();

    const longBody = 'А'.repeat(5200);
    await handleMessage({
      message_id: 55,
      chat: { id: 610, type: 'private' },
      from: { id: 610, first_name: 'Иван' },
      text: longBody,
    });
    const forwardedCall = sendMessageMock.mock.calls.find((c) => c[0]?.chat_id === '777');
    expect(forwardedCall).toBeDefined();
    expect(forwardedCall[0].text.length).toBeLessThanOrEqual(4096);
    expect(forwardedCall[0].text).toContain('…');

    // Fallback при ошибке copyMessage (например несовместимое вложение) сохраняет adminMessageId для reply
    sendMessageMock.mockClear();
    copyMessageMock.mockResolvedValueOnce({ ok: false, errorCode: 400, reason: 'Bad Request' });
    copyMessageMock.mockRejectedValueOnce({ code: 400, description: 'Bad Request' });
    await handleMessage({
      message_id: 56,
      chat: { id: 611, type: 'private' },
      from: { id: 611, first_name: 'Оля' },
      sticker: { file_id: 'st_1' },
    });
    const fbAdminMsg = (await sendMessageMock.mock.results[0].value).message_id;
    copyMessageMock.mockClear();
    await handleMessage({
      message_id: 950,
      chat: { id: 777, type: 'private' },
      from: { id: 777, first_name: 'Егор', username: 'egor_beezer' },
      reply_to_message: { message_id: fbAdminMsg },
      text: 'Получил стикер!',
    });
    expect(copyMessageMock).toHaveBeenCalledWith({
      chat_id: '611',
      from_chat_id: '777',
      message_id: 950,
    });
  });
});
