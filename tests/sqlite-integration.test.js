import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';

let sqlite = new DatabaseSync(':memory:');

function initSqliteSchema(conn) {
  conn.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT NOT NULL,
      last_name TEXT,
      photo_url TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      creator_tg_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'REGISTRATION',
      current_round INTEGER NOT NULL DEFAULT 0,
      tables_count INTEGER NOT NULL DEFAULT 2,
      disabled_tables TEXT,
      auto_rounds INTEGER NOT NULL DEFAULT 0,
      pending_playoff INTEGER NOT NULL DEFAULT 0,
      dyp_mode TEXT NOT NULL DEFAULT 'monster',
      team_format TEXT NOT NULL DEFAULT 'pairs',
      round_robin_loops INTEGER NOT NULL DEFAULT 1,
      los_lives INTEGER NOT NULL DEFAULT 3,
      skip_qualification INTEGER NOT NULL DEFAULT 0,
      long_match_alert_min INTEGER NOT NULL DEFAULT 15,
      score_reminder_min INTEGER NOT NULL DEFAULT 3,
      co_admin_tg_ids TEXT,
      use_buckets INTEGER NOT NULL DEFAULT 0,
      last_round_byes TEXT,
      target_score INTEGER NOT NULL DEFAULT 5,
      win_by_two INTEGER NOT NULL DEFAULT 0,
      max_score INTEGER NOT NULL DEFAULT 7,
      playoff_size INTEGER NOT NULL DEFAULT 8,
      third_place_match INTEGER NOT NULL DEFAULT 1,
      playoff_format TEXT NOT NULL DEFAULT 'best_of_1',
      playoff_target_score INTEGER NOT NULL DEFAULT 5,
      playoff_win_by_two INTEGER NOT NULL DEFAULT 0,
      playoff_max_score INTEGER NOT NULL DEFAULT 7,
      table_config TEXT,
      public_token TEXT,
      public_path TEXT,
      started_at INTEGER,
      finished_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE tournament_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      tg_id INTEGER,
      name TEXT NOT NULL,
      initials TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_guest INTEGER NOT NULL DEFAULT 0,
      dyp_role TEXT,
      byes_count INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER,
      lives_left INTEGER,
      joined_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      stage TEXT NOT NULL DEFAULT 'QUALIFICATION',
      round_number INTEGER NOT NULL,
      bracket_slot TEXT,
      table_number INTEGER NOT NULL,
      team1_player1_id INTEGER NOT NULL,
      team1_player2_id INTEGER,
      team2_player1_id INTEGER NOT NULL,
      team2_player2_id INTEGER,
      status TEXT NOT NULL DEFAULT 'PLAYING',
      score1 INTEGER NOT NULL DEFAULT 0,
      score2 INTEGER NOT NULL DEFAULT 0,
      sets_won1 INTEGER NOT NULL DEFAULT 0,
      sets_won2 INTEGER NOT NULL DEFAULT 0,
      sets_history TEXT,
      submitted_by_team INTEGER,
      submitted_by_tg_id INTEGER,
      confirm_messages TEXT,
      coin_result TEXT,
      last_reminder_at INTEGER,
      reminder_stage INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      finished_at INTEGER
    );
    CREATE TABLE club_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_tg_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      tg_id INTEGER,
      dyp_role TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE tournament_admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      tg_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'coadmin',
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX uniq_ta_tournament_tg ON tournament_admins (tournament_id, tg_id);
    CREATE TABLE client_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id INTEGER,
      fingerprint TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_tournaments_creator ON tournaments (creator_tg_id);
    CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments (status);
    CREATE INDEX IF NOT EXISTS idx_tp_tournament ON tournament_players (tournament_id);
    CREATE INDEX IF NOT EXISTS idx_tp_tg_id ON tournament_players (tg_id);
    CREATE INDEX IF NOT EXISTS idx_matches_tournament_round ON matches (tournament_id, stage, round_number);
    CREATE INDEX IF NOT EXISTS idx_ta_tg_id ON tournament_admins (tg_id);
  `);
}

function toDbVal(colDef, val) {
  if (val === undefined) return null;
  if (val === null) return null;
  if (colDef.type === 'boolean') return val ? 1 : 0;
  if (colDef.type === 'json') return JSON.stringify(val);
  if (colDef.mode === 'timestamp') {
    if (val instanceof Date) return Math.floor(val.getTime() / 1000);
    if (typeof val === 'number') return val > 1e12 ? Math.floor(val / 1000) : val;
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
    } else if (colDef.type === 'boolean') {
      out[prop] = Boolean(raw);
    } else if (colDef.type === 'json') {
      out[prop] = typeof raw === 'string' ? JSON.parse(raw) : raw;
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
  if (node.kind === 'and') {
    const parts = node.conds.filter(Boolean).map((c) => compileWhere(c, params));
    return parts.length ? `(${parts.join(' AND ')})` : '1=1';
  }
  if (node.kind === 'or') {
    const parts = node.conds.filter(Boolean).map((c) => compileWhere(c, params));
    return parts.length ? `(${parts.join(' OR ')})` : '1=1';
  }
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
  if (node.kind === 'isNotNull') {
    return `${node.col.colName} IS NOT NULL`;
  }
  if (node.kind === 'inArray') {
    if (!node.vals.length) return '1=0';
    const marks = node.vals.map((v) => {
      params.push(toDbVal(node.col, v));
      return '?';
    });
    return `${node.col.colName} IN (${marks.join(', ')})`;
  }
  return '1=1';
}

function compileSqlExpr(expr) {
  if (expr && expr.kind === 'sql') {
    return expr.strings
      .map((chunk, i) => {
        if (i >= expr.values.length) return chunk;
        const v = expr.values[i];
        if (v && v.colName) return chunk + v.colName;
        return chunk + String(v);
      })
      .join('');
  }
  return null;
}

const sendMessageSpy = vi.fn().mockResolvedValue({ message_id: 1 });
const sendPhotoSpy = vi.fn().mockResolvedValue({ message_id: 2, photo: [] });
const deleteMessageSpy = vi.fn().mockResolvedValue(true);
const fetchMock = vi.fn();

vi.mock('sdk', () => {
  const realDb = {
    select(projection = null) {
      let tblMeta = null;
      let whereNode = null;
      let orderNode = null;
      const runSelect = () => {
        const params = [];
        const whereSql = compileWhere(whereNode, params);
        const orderSql = orderNode ? ` ORDER BY ${orderNode.col.colName} ${orderNode.dir}` : '';
        const rows = sqlite.prepare(`SELECT * FROM ${tblMeta.tableName} WHERE ${whereSql}${orderSql}`).all(...params);
        return rows.map((r) => {
          const obj = fromDbRow(tblMeta, r);
          if (!projection) return obj;
          const picked = {};
          for (const [k, col] of Object.entries(projection)) {
            picked[k] = obj[col.prop];
          }
          return picked;
        });
      };
      const builder = {
        from(t) {
          tblMeta = t.__meta;
          return builder;
        },
        where(c) {
          whereNode = c;
          return builder;
        },
        orderBy(o) {
          orderNode = o;
          return builder;
        },
        all: async () => runSelect(),
        get: async () => runSelect()[0] ?? null,
      };
      return builder;
    },
    insert(t) {
      const tblMeta = t.__meta;
      let payload = null;
      let conflictMode = null;
      let conflictSet = null;
      const execInsert = (ret) => {
        const items = Array.isArray(payload) ? payload : [payload];
        const results = [];
        for (const rowObj of items) {
          const cols = [];
          const placeholders = [];
          const vals = [];
          for (const [prop, v] of Object.entries(rowObj)) {
            const colDef = tblMeta.cols[prop];
            if (!colDef || v === undefined) continue;
            cols.push(colDef.colName);
            placeholders.push('?');
            vals.push(toDbVal(colDef, v));
          }
          let sqlStr = `INSERT INTO ${tblMeta.tableName} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`;
          if (conflictMode === 'nothing') {
            sqlStr = `INSERT OR IGNORE INTO ${tblMeta.tableName} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`;
          } else if (conflictMode === 'update' && conflictSet) {
            const sets = [];
            for (const [sp, sv] of Object.entries(conflictSet)) {
              const sc = tblMeta.cols[sp];
              if (!sc) continue;
              sets.push(`${sc.colName} = ?`);
              vals.push(toDbVal(sc, sv));
            }
            sqlStr += ` ON CONFLICT DO UPDATE SET ${sets.join(', ')}`;
          }
          if (ret) {
            sqlStr += ' RETURNING *';
            const r = sqlite.prepare(sqlStr).get(...vals);
            if (r) results.push(fromDbRow(tblMeta, r));
          } else {
            const info = sqlite.prepare(sqlStr).run(...vals);
            results.push(info);
          }
        }
        return results;
      };
      const builder = {
        values(v) {
          payload = v;
          return builder;
        },
        onConflictDoNothing() {
          conflictMode = 'nothing';
          return builder;
        },
        onConflictDoUpdate({ set }) {
          conflictMode = 'update';
          conflictSet = set;
          return builder;
        },
        returning: async () => execInsert(true),
        run: async () => execInsert(false),
        then(resolve, reject) {
          return Promise.resolve(execInsert(false)).then(resolve, reject);
        },
      };
      return builder;
    },
    update(t) {
      const tblMeta = t.__meta;
      let patch = {};
      let whereNode = null;
      const execUpdate = (ret) => {
        const sets = [];
        const vals = [];
        for (const [prop, v] of Object.entries(patch)) {
          const colDef = tblMeta.cols[prop];
          if (!colDef || v === undefined) continue;
          const exprSql = compileSqlExpr(v);
          if (exprSql !== null) {
            sets.push(`${colDef.colName} = ${exprSql}`);
          } else {
            sets.push(`${colDef.colName} = ?`);
            vals.push(toDbVal(colDef, v));
          }
        }
        const whereSql = compileWhere(whereNode, vals);
        let sqlStr = `UPDATE ${tblMeta.tableName} SET ${sets.join(', ')} WHERE ${whereSql}`;
        if (ret) {
          sqlStr += ' RETURNING *';
          return sqlite.prepare(sqlStr).all(...vals).map((r) => fromDbRow(tblMeta, r));
        }
        return sqlite.prepare(sqlStr).run(...vals);
      };
      const builder = {
        set(p) {
          patch = p;
          return builder;
        },
        where(c) {
          whereNode = c;
          return builder;
        },
        returning: async () => execUpdate(true),
        run: async () => execUpdate(false),
        then(resolve, reject) {
          return Promise.resolve(execUpdate(false)).then(resolve, reject);
        },
      };
      return builder;
    },
    delete(t) {
      const tblMeta = t.__meta;
      let whereNode = null;
      const execDelete = () => {
        const vals = [];
        const whereSql = compileWhere(whereNode, vals);
        return sqlite.prepare(`DELETE FROM ${tblMeta.tableName} WHERE ${whereSql}`).run(...vals);
      };
      const builder = {
        where(c) {
          whereNode = c;
          return builder;
        },
        run: async () => execDelete(),
        then(resolve, reject) {
          return Promise.resolve(execDelete()).then(resolve, reject);
        },
      };
      return builder;
    },
  };

  return {
    db: realDb,
    fetch: (...args) => fetchMock(...args),
    api: {
      sendMessage: (...args) => sendMessageSpy(...args),
      sendPhoto: (...args) => sendPhotoSpy(...args),
      deleteMessage: (...args) => deleteMessageSpy(...args),
      editMessageText: vi.fn().mockResolvedValue(true),
      editMessageReplyMarkup: vi.fn().mockResolvedValue(true),
      answerCallbackQuery: vi.fn().mockResolvedValue(true),
      savePreparedInlineMessage: vi.fn().mockResolvedValue({ id: 'prep_1' }),
    },
    InputFile: class InputFile {
      constructor(data, name, opts) {
        this.data = data;
        this.name = name;
        this.opts = opts;
      }
    },
    EndpointError: class EndpointError extends Error {
      constructor(msg, opts) {
        super(msg);
        this.parameters = opts;
      }
    },
  };
});

vi.mock('sdk/db', () => {
  const mkCol = (type, colName) => {
    const def = { type, colName, mode: null };
    const chain = {
      __colDef: def,
      primaryKey: () => chain,
      unique: () => chain,
      notNull: () => chain,
      default: () => chain,
    };
    return chain;
  };
  return {
    table: (tableName, rawCols) => {
      const cols = {};
      const exported = {};
      for (const [prop, builder] of Object.entries(rawCols)) {
        const def = { ...builder.__colDef, prop };
        cols[prop] = def;
        exported[prop] = def;
      }
      exported.__meta = { tableName, cols };
      return exported;
    },
    integer: (name, opts) => {
      const c = mkCol('integer', name);
      c.__colDef.mode = opts?.mode || null;
      return c;
    },
    text: (name) => mkCol('text', name),
    boolean: (name) => mkCol('boolean', name),
    json: (name) => mkCol('json', name),
    index: () => ({ on: () => ({}) }),
    uniqueIndex: () => ({ on: () => ({}) }),
    eq: (col, val) => ({ kind: 'eq', col, val }),
    gt: (col, val) => ({ kind: 'gt', col, val }),
    lt: (col, val) => ({ kind: 'lt', col, val }),
    and: (...conds) => ({ kind: 'and', conds }),
    or: (...conds) => ({ kind: 'or', conds }),
    inArray: (col, vals) => ({ kind: 'inArray', col, vals }),
    isNotNull: (col) => ({ kind: 'isNotNull', col }),
    desc: (col) => ({ col, dir: 'DESC' }),
    sql: (strings, ...values) => ({ kind: 'sql', strings, values }),
  };
});

const createTournament = (await import('../tgcloud/endpoints/createTournament.js')).default;
const addGuestPlayer = (await import('../tgcloud/endpoints/addGuestPlayer.js')).default;
const joinTournament = (await import('../tgcloud/endpoints/joinTournament.js')).default;
const leaveTournament = (await import('../tgcloud/endpoints/leaveTournament.js')).default;
const startRound = (await import('../tgcloud/endpoints/startRound.js')).default;
const startPlayoff = (await import('../tgcloud/endpoints/startPlayoff.js')).default;
const deleteLastRound = (await import('../tgcloud/endpoints/deleteLastRound.js')).default;
const submitScore = (await import('../tgcloud/endpoints/submitScore.js')).default;
const confirmScore = (await import('../tgcloud/endpoints/confirmScore.js')).default;
const togglePlayerActive = (await import('../tgcloud/endpoints/togglePlayerActive.js')).default;
const finishTournament = (await import('../tgcloud/endpoints/finishTournament.js')).default;
const callbackQueryHandler = (await import('../tgcloud/handlers/callback_query.js')).default;
const managePlayer = (await import('../tgcloud/endpoints/managePlayer.js')).default;
const getState = (await import('../tgcloud/endpoints/getState.js')).default;
const transferAdmin = (await import('../tgcloud/endpoints/transferAdmin.js')).default;
const deleteTournament = (await import('../tgcloud/endpoints/deleteTournament.js')).default;
const reportClientError = (await import('../tgcloud/endpoints/reportClientError.js')).default;
const { publishPublicLivePage } = await import('../tgcloud/lib/publicLive.js');

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  initSqliteSchema(sqlite);
  sendMessageSpy.mockClear();
  sendPhotoSpy.mockClear();
  fetchMock.mockReset();
});

describe('SQLite integration: CAS concurrency, indexing, telemetry, and live fallback', () => {
  it('prevents duplicate round creation on concurrent startRound calls via CAS', async () => {
    const snap = await createTournament(
      { name: 'Кубок', dypMode: 'monster', targetScore: 5 },
      { initData: { user: { id: 100, first_name: 'Егор' } } }
    );
    await addGuestPlayer(
      { tournamentId: snap.tournament.id, names: ['Маша', 'Костя', 'Юля'] },
      { initData: { user: { id: 100, first_name: 'Егор' } } }
    );

    const results = await Promise.allSettled([
      startRound({ tournamentId: snap.tournament.id }, { initData: { user: { id: 100, first_name: 'Егор' } } }),
      startRound({ tournamentId: snap.tournament.id }, { initData: { user: { id: 100, first_name: 'Егор' } } }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(fulfilled[0].value.currentRoundMatches).toHaveLength(1);
  });

  it('prevents double score confirmation on concurrent confirmScore calls and skips extra LOS life deduction', async () => {
    const snap = await createTournament(
      { name: 'LOS Кубок', dypMode: 'last_one_standing', losLives: 3, targetScore: 5 },
      { initData: { user: { id: 10, first_name: 'Админ' } } }
    );
    await joinTournament({ tournamentId: snap.tournament.id }, { initData: { user: { id: 20, first_name: 'Борис' } } });
    await joinTournament({ tournamentId: snap.tournament.id }, { initData: { user: { id: 30, first_name: 'Вова' } } });
    await joinTournament({ tournamentId: snap.tournament.id }, { initData: { user: { id: 40, first_name: 'Дима' } } });
    const roundSnap = await startRound(
      { tournamentId: snap.tournament.id },
      { initData: { user: { id: 10, first_name: 'Админ' } } }
    );
    const m = roundSnap.currentRoundMatches[0];
    const pAdmin = roundSnap.players.find((p) => p.tgId === 10);
    const adminInT1 = m.team1Players.some((p) => p.id === pAdmin.id);
    const oppIds = new Set((adminInT1 ? m.team2Players : m.team1Players).map((p) => p.id));
    const oppPlayer = roundSnap.players.find((p) => oppIds.has(p.id) && p.tgId);
    expect(oppPlayer?.tgId).toBeTruthy();

    await submitScore(
      { matchId: m.id, score1: 5, score2: 2 },
      { initData: { user: { id: 10, first_name: 'Админ' } } }
    );

    const confRes = await Promise.allSettled([
      confirmScore({ matchId: m.id, action: 'confirm' }, { initData: { user: { id: oppPlayer.tgId, first_name: oppPlayer.name } } }),
      confirmScore({ matchId: m.id, action: 'confirm' }, { initData: { user: { id: oppPlayer.tgId, first_name: oppPlayer.name } } }),
    ]);
    expect(confRes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(confRes.filter((r) => r.status === 'rejected')).toHaveLength(1);

    const afterState = await getState(
      { tournamentId: snap.tournament.id, light: true },
      { initData: { user: { id: 10, first_name: 'Админ' } } }
    );
    const totalLives = afterState.activeTournament.players.reduce((sum, p) => sum + (p.livesLeft ?? 3), 0);
    // Initial total lives = 4 * 3 = 12; losing team has 2 players -> exactly 2 lives deducted -> 10 left
    expect(totalLives).toBe(10);
  });

  it('indexes co-admins in tournament_admins and serves light polling mode in getState', async () => {
    const snap = await createTournament(
      { name: 'Клубный турнир' },
      { initData: { user: { id: 1, first_name: 'Орг' } } }
    );
    const joined = await joinTournament(
      { tournamentId: snap.tournament.id },
      { initData: { user: { id: 2, first_name: 'СоАдмин' } } }
    );
    const p2 = joined.players.find((p) => p.tgId === 2);
    await managePlayer(
      { tournamentId: snap.tournament.id, playerId: p2.id, action: 'toggle_coadmin' },
      { initData: { user: { id: 1, first_name: 'Орг' } } }
    );

    const fullState = await getState({}, { initData: { user: { id: 2, first_name: 'СоАдмин' } } });
    expect(fullState.tournaments).toHaveLength(1);
    expect(fullState.activeTournament.isAdmin).toBe(true);
    expect(fullState.light).toBeUndefined();

    const lightState = await getState(
      { tournamentId: snap.tournament.id, light: true },
      { initData: { user: { id: 2, first_name: 'СоАдмин' } } }
    );
    expect(lightState.light).toBe(true);
    expect(lightState.activeTournament.tournament.id).toBe(snap.tournament.id);
    expect(lightState.tournamentHistory).toBeUndefined();
  });

  it('escapes HTML in transferAdmin, alerts @egor_beezer on client errors, deduplicates, rate-limits, and cleans LIVE on deleteTournament', async () => {
    // Register @egor_beezer so alert notifications resolve chat_id 777
    await createTournament(
      { name: 'Owner Seed' },
      { initData: { user: { id: 777, first_name: 'Egor', username: 'egor_beezer' } } }
    );
    const snap = await createTournament(
      { name: 'Кубок <Pro> & Co' },
      { initData: { user: { id: 1, first_name: 'Орг' } } }
    );
    const joined = await joinTournament(
      { tournamentId: snap.tournament.id },
      { initData: { user: { id: 2, first_name: 'Новый' } } }
    );
    const p2 = joined.players.find((p) => p.tgId === 2);

    await transferAdmin(
      { tournamentId: snap.tournament.id, playerId: p2.id },
      { initData: { user: { id: 1, first_name: 'Орг' } } }
    );
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: 2,
        text: expect.stringContaining('&lt;Pro&gt; &amp; Co'),
      })
    );

    sendMessageSpy.mockClear();
    const r1 = await reportClientError(
      { message: 'TypeError: boom', stack: 'at App.tsx:10', source: 'window_error' },
      { initData: { user: { id: 2, first_name: 'Новый' } } }
    );
    const r2 = await reportClientError(
      { message: 'TypeError: boom', stack: 'at App.tsx:10', source: 'window_error' },
      { initData: { user: { id: 2, first_name: 'Новый' } } }
    );
    expect(r1).toEqual({ ok: true, deduplicated: false });
    expect(r2).toEqual({ ok: true, deduplicated: true });
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: 777,
        text: expect.stringContaining('TypeError: boom'),
      })
    );

    // Rate limiting after 10 distinct errors from user 2 within 10m
    for (let i = 1; i <= 9; i++) {
      await reportClientError(
        { message: `Err #${i}` },
        { initData: { user: { id: 2, first_name: 'Новый' } } }
      );
    }
    const rLimited = await reportClientError(
      { message: 'Err #10 overflow' },
      { initData: { user: { id: 2, first_name: 'Новый' } } }
    );
    expect(rLimited).toEqual({ ok: true, deduplicated: false, rateLimited: true });

    // Deleting a tournament with active LIVE page cleans up external textdb.dev page
    sqlite.prepare("UPDATE tournaments SET public_path = 'kp_test123' WHERE id = ?").run(snap.tournament.id);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' });
    await deleteTournament(
      { tournamentId: snap.tournament.id },
      { initData: { user: { id: 2, first_name: 'Новый' } } }
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://textdb.dev/api/data/kp_test123',
      expect.objectContaining({ method: 'POST', body: '' })
    );
  });

  it('retries transient textdb.dev HTTP 500 once before falling back to telegra.ph', async () => {
    const snap = await createTournament(
      { name: 'Live Fallback Test' },
      { initData: { user: { id: 1, first_name: 'Орг' } } }
    );

    // 1. Первая 500 -> повторная попытка успешна, kp_* адрес сохранён
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'transient error',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });
    const kpPath = await publishPublicLivePage(snap.tournament.id, { createIfMissing: true });
    expect(kpPath).toMatch(/^kp_/);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 2. Два 500 подряд от textdb.dev -> переключение на резервный telegra.ph
    fetchMock.mockClear();
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'server error 1',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'server error 2',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { access_token: 'tg_tok_1' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { path: 'Live-Fallback-11-14' } }),
      });

    const path = await publishPublicLivePage(snap.tournament.id, { createIfMissing: true });
    expect(path).toBe('Live-Fallback-11-14');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('prevents duplicate playoff bracket generation on concurrent startPlayoff calls via CAS', async () => {
    const snap = await createTournament(
      { name: 'Быстрый плей-офф', skipQualification: true, playoffSize: 4, targetScore: 5 },
      { initData: { user: { id: 100, first_name: 'Егор' } } }
    );
    await addGuestPlayer(
      { tournamentId: snap.tournament.id, names: ['Аня', 'Боря', 'Вася'] },
      { initData: { user: { id: 100, first_name: 'Егор' } } }
    );

    const results = await Promise.allSettled([
      startPlayoff({ tournamentId: snap.tournament.id, bracketSize: 4 }, { initData: { user: { id: 100, first_name: 'Егор' } } }),
      startPlayoff({ tournamentId: snap.tournament.id, bracketSize: 4 }, { initData: { user: { id: 100, first_name: 'Егор' } } }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const state = await getState(
      { tournamentId: snap.tournament.id, light: true },
      { initData: { user: { id: 100, first_name: 'Егор' } } }
    );
    expect(state.activeTournament.tournament.status).toBe('PLAYOFF');
    expect(state.activeTournament.currentRoundMatches).toHaveLength(1);
    expect(state.activeTournament.playoffMatches).toHaveLength(1);
  });

  it('detaches tgId on leaveTournament even after player has matches so tournament disappears from player active state', async () => {
    const snap = await createTournament(
      { name: 'Финал выписки', targetScore: 5 },
      { initData: { user: { id: 100, first_name: 'Админ' } } }
    );
    await joinTournament(
      { tournamentId: snap.tournament.id },
      { initData: { user: { id: 202, first_name: 'Финалист' } } }
    );
    await addGuestPlayer(
      { tournamentId: snap.tournament.id, names: ['Г1', 'Г2'] },
      { initData: { user: { id: 100, first_name: 'Админ' } } }
    );
    await startRound(
      { tournamentId: snap.tournament.id },
      { initData: { user: { id: 100, first_name: 'Админ' } } }
    );

    await leaveTournament(
      { tournamentId: snap.tournament.id },
      { initData: { user: { id: 202, first_name: 'Финалист' } } }
    );

    const rows = sqlite.prepare('SELECT id, tg_id, is_active, is_guest FROM tournament_players WHERE tournament_id = ?').all(snap.tournament.id);
    expect(rows.some((r) => r.tg_id === 202)).toBe(false);
    expect(rows).toHaveLength(4);

    const playerState = await getState(
      {},
      { initData: { user: { id: 202, first_name: 'Финалист' } } }
    );
    expect(playerState.activeTournament).toBeNull();
  });

  it('auto-finishes started tournaments inactive for >= 24h while keeping unstarted registration open', async () => {
    const oldStart = await createTournament(
      { name: 'Вчерашний плей-офф', skipQualification: true, playoffSize: 4, targetScore: 5 },
      { initData: { user: { id: 301, first_name: 'Орг1' } } }
    );
    await addGuestPlayer(
      { tournamentId: oldStart.tournament.id, names: ['А', 'Б', 'В'] },
      { initData: { user: { id: 301, first_name: 'Орг1' } } }
    );
    await startPlayoff(
      { tournamentId: oldStart.tournament.id, bracketSize: 4 },
      { initData: { user: { id: 301, first_name: 'Орг1' } } }
    );

    const oldReg = await createTournament(
      { name: 'Черновик регистрации' },
      { initData: { user: { id: 302, first_name: 'Орг2' } } }
    );

    const twoDaysAgoSec = Math.floor((Date.now() - 26 * 60 * 60 * 1000) / 1000);
    sqlite.prepare('UPDATE tournaments SET created_at = ?, started_at = ? WHERE id IN (?, ?)').run(twoDaysAgoSec, twoDaysAgoSec, oldStart.tournament.id, oldReg.tournament.id);
    sqlite.prepare('UPDATE matches SET created_at = ? WHERE tournament_id = ?').run(twoDaysAgoSec, oldStart.tournament.id);

    const stateOld = await getState(
      { tournamentId: oldStart.tournament.id },
      { initData: { user: { id: 301, first_name: 'Орг1' } } }
    );
    expect(stateOld.activeTournament.tournament.status).toBe('FINISHED');
    expect(stateOld.activeTournament.tournament.finishedAt).toBeTruthy();

    const stateReg = await getState(
      { tournamentId: oldReg.tournament.id },
      { initData: { user: { id: 302, first_name: 'Орг2' } } }
    );
    expect(stateReg.activeTournament.tournament.status).toBe('REGISTRATION');
  });

  it('prevents duplicate player rows on concurrent joinTournament, duplicate deletes on deleteLastRound, and double toggles on togglePlayerActive', async () => {
    const snap = await createTournament(
      { name: 'Гонка кликов', dypMode: 'monster', targetScore: 5 },
      { initData: { user: { id: 500, first_name: 'Орг' } } }
    );
    const tid = snap.tournament.id;

    // 5 concurrent join requests from the same Telegram user -> still exactly 1 row
    await Promise.all(
      Array.from({ length: 5 }, () =>
        joinTournament({ tournamentId: tid }, { initData: { user: { id: 501, first_name: 'Игрок1' } } })
      )
    );
    const p501Rows = sqlite
      .prepare('SELECT id FROM tournament_players WHERE tournament_id = ? AND tg_id = ?')
      .all(tid, 501);
    expect(p501Rows).toHaveLength(1);

    await joinTournament({ tournamentId: tid }, { initData: { user: { id: 502, first_name: 'Игрок2' } } });
    await joinTournament({ tournamentId: tid }, { initData: { user: { id: 503, first_name: 'Игрок3' } } });

    // Co-admin added
    const p501 = sqlite
      .prepare('SELECT id FROM tournament_players WHERE tournament_id = ? AND tg_id = ?')
      .get(tid, 501);
    await managePlayer(
      { tournamentId: tid, playerId: p501.id, action: 'toggle_coadmin' },
      { initData: { user: { id: 500, first_name: 'Орг' } } }
    );

    // Concurrent togglePlayerActive by admin and co-admin -> exactly 1 succeeds, 1 CONFLICT
    const toggleRes = await Promise.allSettled([
      togglePlayerActive({ tournamentId: tid, playerId: p501.id }, { initData: { user: { id: 500, first_name: 'Орг' } } }),
      togglePlayerActive({ tournamentId: tid, playerId: p501.id }, { initData: { user: { id: 501, first_name: 'Игрок1' } } }),
    ]);
    expect(toggleRes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(toggleRes.filter((r) => r.status === 'rejected')).toHaveLength(1);

    // Activate back, start round, then concurrent deleteLastRound -> 1 succeeds, 1 CONFLICT
    const curActive = sqlite.prepare('SELECT is_active FROM tournament_players WHERE id = ?').get(p501.id).is_active;
    if (!curActive) {
      await togglePlayerActive({ tournamentId: tid, playerId: p501.id }, { initData: { user: { id: 500, first_name: 'Орг' } } });
    }
    await startRound({ tournamentId: tid }, { initData: { user: { id: 500, first_name: 'Орг' } } });

    const delRes = await Promise.allSettled([
      deleteLastRound({ tournamentId: tid }, { initData: { user: { id: 500, first_name: 'Орг' } } }),
      deleteLastRound({ tournamentId: tid }, { initData: { user: { id: 501, first_name: 'Игрок1' } } }),
    ]);
    expect(delRes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(delRes.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(sqlite.prepare('SELECT status, current_round FROM tournaments WHERE id = ?').get(tid)).toEqual({
      status: 'REGISTRATION',
      current_round: 0,
    });
  });

  it('keeps submitScore idempotent and protects inline Telegram callback_query confirm vs dispute races', async () => {
    const snap = await createTournament(
      { name: 'Чат гонка', dypMode: 'monster', targetScore: 5 },
      { initData: { user: { id: 600, first_name: 'Админ' } } }
    );
    for (const [id, name] of [
      [601, 'Аня'],
      [602, 'Боря'],
      [603, 'Витя'],
    ]) {
      await joinTournament({ tournamentId: snap.tournament.id }, { initData: { user: { id, first_name: name } } });
    }
    const rSnap = await startRound({ tournamentId: snap.tournament.id }, { initData: { user: { id: 600, first_name: 'Админ' } } });
    const m = rSnap.currentRoundMatches[0];
    const pAdmin = rSnap.players.find((p) => p.tgId === 600);
    const adminTeam1 = m.team1Players.some((p) => p.id === pAdmin.id);
    const oppIds = new Set((adminTeam1 ? m.team2Players : m.team1Players).map((p) => p.id));
    const oppPlayers = rSnap.players.filter((p) => oppIds.has(p.id) && p.tgId);

    const s1 = await submitScore({ matchId: m.id, score1: 5, score2: 1 }, { initData: { user: { id: 600, first_name: 'Админ' } } });
    expect(s1.alreadySubmitted).toBeFalsy();
    const sentBeforeDup = sendMessageSpy.mock.calls.length;

    const s2 = await submitScore({ matchId: m.id, score1: 5, score2: 1 }, { initData: { user: { id: 600, first_name: 'Админ' } } });
    expect(s2.alreadySubmitted).toBe(true);
    expect(sendMessageSpy.mock.calls.length).toBe(sentBeforeDup);

    // Concurrent confirm & dispute via Telegram bot inline callback buttons
    const oppA = oppPlayers[0];
    const oppB = oppPlayers[1] || oppPlayers[0];
    await Promise.all([
      callbackQueryHandler({
        id: 'cb1',
        data: `confirm:${m.id}:5:1`,
        from: { id: oppA.tgId, first_name: oppA.name },
        message: { chat: { id: oppA.tgId }, message_id: 10 },
      }),
      callbackQueryHandler({
        id: 'cb2',
        data: `dispute:${m.id}:5:1`,
        from: { id: oppB.tgId, first_name: oppB.name },
        message: { chat: { id: oppB.tgId }, message_id: 11 },
      }),
    ]);

    const finalMatchRow = sqlite.prepare('SELECT status, score1, score2 FROM matches WHERE id = ?').get(m.id);
    expect(['FINISHED', 'PLAYING']).toContain(finalMatchRow.status);
  });

  it('DOOMSDAY SCALE: handles 350 tournaments (>300 SQL chunking), 3500 players, 7000 matches, and 200 concurrent polls smoothly', async () => {
    const heroTgId = 9001;
    const insertUser = sqlite.prepare('INSERT OR IGNORE INTO users (tg_id, first_name) VALUES (?, ?)');
    insertUser.run(heroTgId, 'СуперАдмин');
    for (let k = 1; k <= 12; k++) {
      insertUser.run(9100 + k, `Игрок${k}`);
    }

    const insertTourney = sqlite.prepare(
      `INSERT INTO tournaments (name, creator_tg_id, status, current_round, tables_count, dyp_mode, target_score, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertPlayer = sqlite.prepare(
      `INSERT INTO tournament_players (tournament_id, tg_id, name, initials, is_active, is_guest, sort_order)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    );
    const insertMatch = sqlite.prepare(
      `INSERT INTO matches (tournament_id, stage, round_number, table_number, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, status, score1, score2)
       VALUES (?, 'QUALIFICATION', ?, ?, ?, ?, ?, ?, 'FINISHED', 5, 3)`
    );

    const tIds = [];
    sqlite.exec('BEGIN');
    const modes = ['monster', 'classic', 'swiss', 'round_robin', 'whist'];
    const nowSec = Math.floor(Date.now() / 1000);
    for (let t = 0; t < 350; t++) {
      const isLast = t === 349;
      const res = insertTourney.run(
        `Турнир #${t + 1}`,
        heroTgId,
        isLast ? 'QUALIFICATION' : 'FINISHED',
        4,
        2,
        modes[t % modes.length],
        5,
        isLast ? null : nowSec - t * 3600
      );
      const tid = Number(res.lastInsertRowid);
      tIds.push(tid);

      const pIds = [];
      for (let p = 0; p < 10; p++) {
        const tg = p === 0 ? heroTgId : 9101 + p;
        const pRes = insertPlayer.run(tid, tg, `Игрок_${p}`, `И${p}`, 0, p + 1);
        pIds.push(Number(pRes.lastInsertRowid));
      }
      for (let r = 1; r <= 4; r++) {
        for (let g = 0; g < 5; g++) {
          const i = (g * 2 + r) % 10;
          insertMatch.run(
            tid,
            r,
            (g % 2) + 1,
            pIds[i % 10],
            pIds[(i + 1) % 10],
            pIds[(i + 2) % 10],
            pIds[(i + 3) % 10]
          );
        }
      }
    }
    sqlite.exec('COMMIT');

    const activeTid = tIds[tIds.length - 1];

    // 1. 200 concurrent light polls (typical live evening peak for active clubs)
    const tPollStart = performance.now();
    const pollTimings = [];
    const lightResults = await Promise.all(
      Array.from({ length: 200 }, async (_, idx) => {
        const s = performance.now();
        const res = await getState(
          { tournamentId: tIds[idx % tIds.length], light: true },
          { initData: { user: { id: 9101 + (idx % 9), first_name: 'Игрок' } } }
        );
        pollTimings.push(performance.now() - s);
        return res;
      })
    );
    const lightTotalMs = performance.now() - tPollStart;
    pollTimings.sort((a, b) => a - b);
    const lightP95Ms = pollTimings[Math.floor(pollTimings.length * 0.95)] || 0;
    expect(lightResults).toHaveLength(200);
    expect(lightResults.every((r) => Boolean(r.activeTournament))).toBe(true);

    // 2. Full getState across 350 tournaments (7000 matches, 3500 players -> >300 ID SQLite chunking!)
    const tFullStart = performance.now();
    const fullState = await getState(
      { tournamentId: activeTid },
      { initData: { user: { id: heroTgId, first_name: 'СуперАдмин' } } }
    );
    const fullMs = performance.now() - tFullStart;

    expect(fullState.tournaments).toHaveLength(350);
    expect(fullState.tournamentHistory).toHaveLength(350);
    expect(fullState.playerProfile.tournamentsPlayed).toBe(350);
    expect(fullState.playerProfile.totalMatches).toBeGreaterThan(1000);

    console.info(
      `[DOOMSDAY SCALE] 350 tournaments / 3500 players / 7000 matches | ` +
        `200 light polls total=${lightTotalMs.toFixed(1)}ms (p95=${lightP95Ms.toFixed(1)}ms) | ` +
        `full getState(350)=${fullMs.toFixed(1)}ms`
    );
    expect(lightTotalMs).toBeLessThan(5000);
    expect(fullMs).toBeLessThan(5000);
  });

  it('DOOMSDAY CONCURRENCY: 32 parallel tournaments x 12 players x 3 rounds with score/confirm/double-click storms stay 100% consistent', async () => {
    const startMs = performance.now();
    const T_COUNT = 32;
    const contexts = [];
    for (let t = 0; t < T_COUNT; t++) {
      const adminId = 20000 + t * 20;
      const snap = await createTournament(
        { name: `Шторм #${t + 1}`, autoRounds: true, tables: 3, targetScore: 5, playoffSize: 4 },
        { initData: { user: { id: adminId, first_name: `Орг${t}` } } }
      );
      const guestNames = Array.from({ length: 11 }, (_, i) => `Уч_${t}_${i + 1}`);
      await addGuestPlayer(
        { tournamentId: snap.tournament.id, names: guestNames },
        { initData: { user: { id: adminId, first_name: `Орг${t}` } } }
      );
      // Intentional double-click burst on startRound for every tournament simultaneously
      const rBurst = await Promise.allSettled([
        startRound({ tournamentId: snap.tournament.id }, { initData: { user: { id: adminId, first_name: `Орг${t}` } } }),
        startRound({ tournamentId: snap.tournament.id }, { initData: { user: { id: adminId, first_name: `Орг${t}` } } }),
      ]);
      expect(rBurst.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(rBurst.filter((r) => r.status === 'rejected')).toHaveLength(1);
      contexts.push({ tid: snap.tournament.id, adminId });
    }

    // Play 3 full qualification rounds across all 32 tournaments in parallel bursts
    for (let round = 1; round <= 3; round++) {
      await Promise.all(
        contexts.map(async ({ tid, adminId }) => {
          const openMatches = sqlite
            .prepare("SELECT id FROM matches WHERE tournament_id = ? AND stage = 'QUALIFICATION' AND round_number = ? AND status != 'FINISHED'")
            .all(tid, round);
          expect(openMatches.length).toBeGreaterThan(0);

          // Force parallel score save bursts on every match in the round simultaneously
          await Promise.all(
            openMatches.map((m, idx) =>
              submitScore(
                { matchId: m.id, score1: 5, score2: idx % 4, forceAdmin: true },
                { initData: { user: { id: adminId, first_name: `Орг` } } }
              )
            )
          );
        })
      );
    }

    // Transition all 32 tournaments to playoff concurrently (scheduling pendingPlayoff then finishing active round -> auto-playoff -> finals)
    await Promise.all(
      contexts.map(async ({ tid, adminId }) => {
        await startPlayoff(
          { tournamentId: tid, playoffSize: 4, thirdPlaceMatch: false },
          { initData: { user: { id: adminId, first_name: 'Орг' } } }
        );
        // If autoRounds created round 4, finish its open matches to trigger pendingPlayoff -> PLAYOFF
        const qualOpen = sqlite
          .prepare("SELECT id FROM matches WHERE tournament_id = ? AND stage = 'QUALIFICATION' AND status != 'FINISHED'")
          .all(tid);
        if (qualOpen.length > 0) {
          await Promise.all(
            qualOpen.map((m) =>
              submitScore(
                { matchId: m.id, score1: 5, score2: 1, forceAdmin: true },
                { initData: { user: { id: adminId, first_name: 'Орг' } } }
              )
            )
          );
        }
        // Play semifinals + final
        for (let step = 0; step < 3; step++) {
          const poOpen = sqlite
            .prepare("SELECT id FROM matches WHERE tournament_id = ? AND stage = 'PLAYOFF' AND status != 'FINISHED'")
            .all(tid);
          if (poOpen.length === 0) break;
          await Promise.all(
            poOpen.map((m) =>
              submitScore(
                { matchId: m.id, score1: 5, score2: 2, forceAdmin: true },
                { initData: { user: { id: adminId, first_name: 'Орг' } } }
              )
            )
          );
        }
        await finishTournament(
          { tournamentId: tid },
          { initData: { user: { id: adminId, first_name: 'Орг' } } }
        );
      })
    );

    const elapsedMs = performance.now() - startMs;
    const finishedCount = sqlite.prepare("SELECT COUNT(*) as c FROM tournaments WHERE status = 'FINISHED' AND name LIKE 'Шторм #%'").get().c;
    const totalMatchesPlayed = sqlite.prepare("SELECT COUNT(*) as c FROM matches WHERE status = 'FINISHED'").get().c;
    const dupRounds = sqlite
      .prepare("SELECT tournament_id, stage, round_number, COUNT(*) as cnt FROM matches GROUP BY tournament_id, stage, round_number HAVING cnt > 3")
      .all();

    expect(finishedCount).toBe(T_COUNT);
    expect(totalMatchesPlayed).toBeGreaterThanOrEqual(T_COUNT * (9 + 3));
    expect(dupRounds).toHaveLength(0);

    console.info(
      `[DOOMSDAY CONCURRENCY] 32 parallel tournaments x 12 players finished through playoff in ${elapsedMs.toFixed(1)}ms ` +
        `(${totalMatchesPlayed} matches total, 0 duplicate rounds)`
    );
    expect(elapsedMs).toBeLessThan(8000);
  });

  it('excludes absent players from playoff seeding and shifts top-8 cutline down to #9/#10', async () => {
    const adminCtx = { initData: { user: { id: 8100, first_name: 'Орг' } } };
    const snap = await createTournament(
      {
        name: 'Отсутствующие плей-офф',
        tablesCount: 2,
        playoffSize: 8,
        dypMode: 'monster',
        teamFormat: 'pairs',
        autoRounds: false,
      },
      adminCtx
    );
    const tid = snap.tournament.id;

    for (let i = 1; i <= 10; i++) {
      await addGuestPlayer({ tournamentId: tid, name: `Участник ${i}` }, adminCtx);
    }

    let beforePoState = null;
    for (let round = 1; round <= 2; round++) {
      await startRound({ tournamentId: tid }, adminCtx);
      const openMatches = sqlite
        .prepare("SELECT id FROM matches WHERE tournament_id = ? AND stage = 'QUALIFICATION' AND round_number = ? AND status != 'FINISHED'")
        .all(tid, round);
      for (let idx = 0; idx < openMatches.length; idx++) {
        beforePoState = await submitScore(
          { matchId: openMatches[idx].id, score1: 7, score2: idx % 3, forceAdmin: true },
          adminCtx
        );
      }
    }

    expect(beforePoState.leaderboard).toHaveLength(11); // Орг + 10 гостей
    const rank5 = beforePoState.leaderboard[4];
    const rank7 = beforePoState.leaderboard[6];
    const rank9 = beforePoState.leaderboard[8];
    const rank10 = beforePoState.leaderboard[9];

    // Mark rank #5 and #7 absent
    await togglePlayerActive({ tournamentId: tid, playerId: rank5.playerId }, adminCtx);
    await togglePlayerActive({ tournamentId: tid, playerId: rank7.playerId }, adminCtx);

    // Deleting a guest who has played shows updated Russian hint referencing "отсутствующего"
    await expect(
      managePlayer({ tournamentId: tid, playerId: rank5.playerId, action: 'delete_player' }, adminCtx)
    ).rejects.toThrow(/отметьте как отсутствующего/i);

    const poState = await startPlayoff(
      { tournamentId: tid, playoffSize: 8, thirdPlaceMatch: false },
      adminCtx
    );
    expect(poState.tournament.status).toBe('PLAYOFF');
    const seededPlayerIds = poState.playoffMatches.flatMap((m) => [
      ...m.team1Players.map((p) => p.id),
      ...m.team2Players.map((p) => p.id),
    ]);
    expect(seededPlayerIds).toHaveLength(8);
    expect(seededPlayerIds).not.toContain(rank5.playerId);
    expect(seededPlayerIds).not.toContain(rank7.playerId);
    expect(seededPlayerIds).toContain(rank9.playerId);
    expect(seededPlayerIds).toContain(rank10.playerId);
  });

  it('rejects startPlayoff when fewer than minimum active participants remain', async () => {
    const adminCtx = { initData: { user: { id: 8101, first_name: 'Орг2' } } };
    const snap = await createTournament(
      { name: 'Мало активных', tablesCount: 1, playoffSize: 4, teamFormat: 'pairs' },
      adminCtx
    );
    const tid = snap.tournament.id;
    // Creator is auto-joined as player #1; adding 3 guests gives 4 players total.
    const added = [];
    for (let i = 1; i <= 3; i++) {
      const s = await addGuestPlayer({ tournamentId: tid, name: `Игрок ${i}` }, adminCtx);
      added.push(s.players[s.players.length - 1]);
    }
    await togglePlayerActive({ tournamentId: tid, playerId: added[0].id }, adminCtx);

    await expect(
      startPlayoff({ tournamentId: tid, playoffSize: 4, thirdPlaceMatch: false }, adminCtx)
    ).rejects.toThrow(/минимум 4 присутствующих/);
  });

  it('deduplicates snapshot avatars, returns unchanged:true on matching snapshotVersion, and updates version on match finish', async () => {
    const adminCtx = { initData: { user: { id: 9201, first_name: 'Егор' } } };
    const snap = await createTournament(
      { name: 'Poll Opt', dypMode: 'monster', targetScore: 5, autoRounds: false },
      adminCtx
    );
    const tid = snap.tournament.id;
    sqlite.prepare("UPDATE users SET photo_url = 'data:image/jpeg;base64,AAAABBBB' WHERE tg_id = 9201").run();
    await addGuestPlayer({ tournamentId: tid, names: ['А', 'Б', 'В'] }, adminCtx);
    await startRound({ tournamentId: tid }, adminCtx);

    const firstPoll = await getState({ tournamentId: tid, light: true }, adminCtx);
    expect(firstPoll.light).toBe(true);
    expect(firstPoll.unchanged).toBeUndefined();
    const s = firstPoll.activeTournament;
    expect(s.snapshotVersion).toBeTruthy();
    // Base64 avatar keeps single canonical copy in players[] while omitted from leaderboard/teamPlayers
    expect(s.players.find((p) => p.tgId === 9201)?.avatarUrl).toBe('data:image/jpeg;base64,AAAABBBB');
    expect(s.leaderboard[0].avatarUrl).toBeUndefined();
    expect(s.currentRoundMatches[0].team1Players[0].avatarUrl).toBeUndefined();

    // Matching snapshotVersion skips building full snapshot
    const unchangedPoll = await getState(
      { tournamentId: tid, light: true, snapshotVersion: s.snapshotVersion },
      adminCtx
    );
    expect(unchangedPoll.light).toBe(true);
    expect(unchangedPoll.unchanged).toBe(true);
    expect(unchangedPoll.snapshotVersion).toBe(s.snapshotVersion);
    expect(unchangedPoll.activeTournament).toBeUndefined();

    // Submitting a score bumps snapshotVersion so next light poll delivers fresh state
    await submitScore(
      { matchId: s.currentRoundMatches[0].id, score1: 5, score2: 1, forceAdmin: true },
      adminCtx
    );
    const changedPoll = await getState(
      { tournamentId: tid, light: true, snapshotVersion: s.snapshotVersion },
      adminCtx
    );
    expect(changedPoll.unchanged).toBeUndefined();
    expect(changedPoll.activeTournament.snapshotVersion).not.toBe(s.snapshotVersion);
    expect(changedPoll.activeTournament.currentRoundMatches[0].status).toBe('FINISHED');
  });

  it('prevents concurrent regenerateFirst races via CAS and prunes expired client_errors rows', async () => {
    const adminCtx = { initData: { user: { id: 9301, first_name: 'РегенОрг' } } };
    const snap = await createTournament(
      { name: 'CAS Regen', tablesCount: 1, dypMode: 'monster' },
      adminCtx
    );
    const tid = snap.tournament.id;
    await addGuestPlayer({ tournamentId: tid, names: ['П1', 'П2', 'П3', 'П4'] }, adminCtx);
    await startRound({ tournamentId: tid }, adminCtx);

    const regenResults = await Promise.allSettled([
      startRound({ tournamentId: tid, regenerateFirst: true }, adminCtx),
      startRound({ tournamentId: tid, regenerateFirst: true }, adminCtx),
    ]);
    expect(regenResults.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(regenResults.filter((r) => r.status === 'rejected')).toHaveLength(1);

    const r1Matches = sqlite
      .prepare("SELECT id FROM matches WHERE tournament_id = ? AND stage = 'QUALIFICATION' AND round_number = 1")
      .all(tid);
    expect(r1Matches).toHaveLength(1);
    const totalByes = sqlite
      .prepare('SELECT SUM(byes_count) AS s FROM tournament_players WHERE tournament_id = ?')
      .get(tid);
    expect(totalByes.s).toBe(1);

    // Retention test: older than 30 days pruned, fresh retained
    const oldSec = Math.floor(Date.now() / 1000) - 40 * 24 * 60 * 60;
    sqlite
      .prepare("INSERT INTO client_errors (tg_id, fingerprint, message, created_at) VALUES (9301, 'old_fp', 'old err', ?)")
      .run(oldSec);
    await reportClientError({ message: 'fresh error trigger' }, adminCtx);
    const remainingOld = sqlite
      .prepare("SELECT id FROM client_errors WHERE fingerprint = 'old_fp'")
      .all();
    const remainingFresh = sqlite
      .prepare("SELECT id FROM client_errors WHERE message = 'fresh error trigger'")
      .all();
    expect(remainingOld).toHaveLength(0);
    expect(remainingFresh).toHaveLength(1);
  });
});
