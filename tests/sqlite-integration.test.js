import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

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
const startRound = (await import('../tgcloud/endpoints/startRound.js')).default;
const startPlayoff = (await import('../tgcloud/endpoints/startPlayoff.js')).default;
const submitScore = (await import('../tgcloud/endpoints/submitScore.js')).default;
const confirmScore = (await import('../tgcloud/endpoints/confirmScore.js')).default;
const managePlayer = (await import('../tgcloud/endpoints/managePlayer.js')).default;
const getState = (await import('../tgcloud/endpoints/getState.js')).default;
const transferAdmin = (await import('../tgcloud/endpoints/transferAdmin.js')).default;
const shareLeaderboard = (await import('../tgcloud/endpoints/shareLeaderboard.js')).default;
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
    await addGuestPlayer(
      { tournamentId: snap.tournament.id, names: ['Вова', 'Дима'] },
      { initData: { user: { id: 10, first_name: 'Админ' } } }
    );
    const roundSnap = await startRound(
      { tournamentId: snap.tournament.id },
      { initData: { user: { id: 10, first_name: 'Админ' } } }
    );
    const m = roundSnap.currentRoundMatches[0];
    // Find player belonging to team1 and player belonging to team2
    const pAdmin = roundSnap.players.find((p) => p.tgId === 10);
    const pBoris = roundSnap.players.find((p) => p.tgId === 20);
    const adminInT1 = m.team1Players.some((p) => p.id === pAdmin.id);
    const borisInT1 = m.team1Players.some((p) => p.id === pBoris.id);

    await submitScore(
      { matchId: m.id, score1: 5, score2: 2 },
      { initData: { user: { id: 10, first_name: 'Админ' } } }
    );

    if (adminInT1 === borisInT1) {
      // Both telegram users ended up on same team -> admin confirms twice concurrently
      const confRes = await Promise.allSettled([
        confirmScore({ matchId: m.id, action: 'confirm' }, { initData: { user: { id: 10, first_name: 'Админ' } } }),
        confirmScore({ matchId: m.id, action: 'confirm' }, { initData: { user: { id: 10, first_name: 'Админ' } } }),
      ]);
      expect(confRes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(confRes.filter((r) => r.status === 'rejected')).toHaveLength(1);
    } else {
      const confRes = await Promise.allSettled([
        confirmScore({ matchId: m.id, action: 'confirm' }, { initData: { user: { id: 20, first_name: 'Борис' } } }),
        confirmScore({ matchId: m.id, action: 'confirm' }, { initData: { user: { id: 20, first_name: 'Борис' } } }),
      ]);
      expect(confRes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(confRes.filter((r) => r.status === 'rejected')).toHaveLength(1);
    }

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

  it('escapes HTML in transferAdmin, enforces access check in shareLeaderboard, and deduplicates client errors', async () => {
    const snap = await createTournament(
      { name: 'Кубок <Pro> & Co' },
      { initData: { user: { id: 1, first_name: 'Орг' } } }
    );
    const joined = await joinTournament(
      { tournamentId: snap.tournament.id },
      { initData: { user: { id: 2, first_name: 'Новый' } } }
    );
    const p2 = joined.players.find((p) => p.tgId === 2);

    // Outsider cannot export private tournament leaderboard
    const validPngBase64 = Buffer.alloc(150, 1).toString('base64');
    await expect(
      shareLeaderboard(
        { tournamentId: snap.tournament.id, imageBase64: validPngBase64, kind: 'standings' },
        { initData: { user: { id: 999, first_name: 'Чужой' } } }
      )
    ).rejects.toThrow('Нет доступа');

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

    const r1 = await reportClientError(
      { message: 'TypeError: boom', stack: 'at App.tsx:10' },
      { initData: { user: { id: 2, first_name: 'Новый' } } }
    );
    const r2 = await reportClientError(
      { message: 'TypeError: boom', stack: 'at App.tsx:10' },
      { initData: { user: { id: 2, first_name: 'Новый' } } }
    );
    expect(r1).toEqual({ ok: true, deduplicated: false });
    expect(r2).toEqual({ ok: true, deduplicated: true });
  });

  it('falls back to telegra.ph when primary textdb.dev live store returns HTTP 500', async () => {
    const snap = await createTournament(
      { name: 'Live Fallback Test' },
      { initData: { user: { id: 1, first_name: 'Орг' } } }
    );

    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'server error',
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
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
});
