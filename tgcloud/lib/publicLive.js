import { db, fetch } from 'sdk';
import { eq } from 'sdk/db';
import { tournaments } from '../schema.js';
import { getTournamentSnapshot } from './helpers.js';

const LIVE_STORE_BASE = 'https://textdb.dev/api/data';
const LIVE_FETCH_TIMEOUT_MS = 6000;

async function fetchWithTimeout(url, init, timeoutMs = LIVE_FETCH_TIMEOUT_MS) {
  const AbortCtrl = typeof globalThis !== 'undefined' ? globalThis.AbortController : undefined;
  const setTimer = typeof globalThis !== 'undefined' ? globalThis.setTimeout : undefined;
  const clearTimer = typeof globalThis !== 'undefined' ? globalThis.clearTimeout : undefined;
  const controller = typeof AbortCtrl === 'function' ? new AbortCtrl() : null;

  let timerId = null;
  const reqPromise = fetch(url, controller ? { ...init, signal: controller.signal } : init);

  if (typeof setTimer !== 'function') {
    return await reqPromise;
  }

  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimer(() => {
      try {
        controller?.abort();
      } catch {
        // ignore abort failure
      }
      reject(new Error(`Live request timeout (${timeoutMs}ms)`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([reqPromise, timeoutPromise]);
  } finally {
    if (timerId !== null && typeof clearTimer === 'function') {
      clearTimer(timerId);
    }
  }
}

function toEpochMs(val) {
  if (!val) return null;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val < 1e12 ? val * 1000 : val;
  }
  return null;
}

function compactPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    initials: p.initials,
    dypRole: p.dypRole || null,
  };
}

function compactMatch(m) {
  return {
    id: m.id,
    stage: m.stage,
    roundNumber: m.roundNumber,
    bracketSlot: m.bracketSlot || null,
    tableNumber: m.tableNumber,
    status: m.status,
    score1: m.score1,
    score2: m.score2,
    setsWon1: m.setsWon1,
    setsWon2: m.setsWon2,
    setsHistory: Array.isArray(m.setsHistory) ? m.setsHistory : null,
    team1Label: m.team1Label,
    team2Label: m.team2Label,
    team1Players: (m.team1Players || []).map(compactPlayer),
    team2Players: (m.team2Players || []).map(compactPlayer),
    createdAt: toEpochMs(m.createdAt),
    finishedAt: toEpochMs(m.finishedAt),
  };
}

export function buildPublicLivePayload(snapshot) {
  const t = snapshot.tournament;
  return {
    v: 1,
    updatedAt: Date.now(),
    tournament: {
      id: t.id,
      name: t.name,
      status: t.status,
      currentRound: t.currentRound,
      tablesCount: t.tablesCount,
      disabledTables: Array.isArray(t.disabledTables) ? t.disabledTables : [],
      dypMode: t.dypMode || 'monster',
      useBuckets: Boolean(t.useBuckets),
      targetScore: t.targetScore,
      winByTwo: Boolean(t.winByTwo),
      maxScore: t.maxScore,
      playoffSize: t.playoffSize,
      thirdPlaceMatch: Boolean(t.thirdPlaceMatch),
      playoffFormat: t.playoffFormat,
      tableConfig: t.tableConfig || null,
      publicPath: t.publicPath || null,
      startedAt: toEpochMs(t.startedAt),
      finishedAt: toEpochMs(t.finishedAt),
    },
    timings: snapshot.timings || null,
    leaderboard: (snapshot.leaderboard || []).map((row) => ({
      rank: row.rank,
      playerId: row.playerId,
      name: row.name,
      initials: row.initials,
      dypRole: row.dypRole || null,
      games: row.games,
      wins: row.wins,
      losses: row.losses,
      points: row.points,
      diff: row.diff,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      ppm: row.ppm,
      fairPpm: row.fairPpm,
      winRate: row.winRate,
      byesCount: row.byesCount,
      isBelowGameThreshold: Boolean(row.isBelowGameThreshold),
      isActive: Boolean(row.isActive),
    })),
    currentRoundMatches: (snapshot.currentRoundMatches || []).map(compactMatch),
    playoffMatches: (snapshot.playoffMatches || []).map(compactMatch),
  };
}

function generateLivePath(tournamentId) {
  let rand;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    rand = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  } else {
    rand =
      Math.random().toString(36).slice(2, 10) +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 10);
  }
  return `kp_${tournamentId}_${rand}`;
}

/** Записывает (или очищает пустой строкой) Live-страницу в textdb.dev с одним повтором при сбое. */
async function writeTextdbPage(path, bodyStr) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(`${LIVE_STORE_BASE}/${encodeURIComponent(path)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: bodyStr,
      });
      await res.text();
      if (res.ok) return;
      lastErr = new Error(`Live store error HTTP ${res.status}`);
      if (res.status >= 400 && res.status < 500) break;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Live store error');
}

export async function deletePublicLivePage(publicPath, publicToken = null) {
  if (!publicPath) return;
  try {
    const pathStr = String(publicPath);
    if (pathStr.startsWith('kp_')) {
      await writeTextdbPage(pathStr, '');
      return;
    }
    // Старые страницы Telegraph: платформа до них больше не достаёт, чистим по возможности
    if (publicToken && publicToken !== 'textdb') {
      await fetchWithTimeout('https://api.telegra.ph/editPage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: publicToken,
          path: pathStr,
          title: 'Live-трансляция удалена',
          content: [{ tag: 'p', children: [''] }],
        }),
      });
    }
  } catch (err) {
    console.warn('deletePublicLivePage failed:', err?.message || err);
  }
}

export async function publishPublicLivePage(tournamentId, { createIfMissing = false } = {}) {
  const row = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();
  if (!row) return null;

  if (!row.publicPath && !createIfMissing) {
    return null;
  }

  const snapshot = await getTournamentSnapshot(tournamentId, 0);
  if (!snapshot) return null;

  // Существующий kp_* путь сохраняем; страницы Telegraph и новые трансляции получают новый непредсказуемый путь
  const existingPath = row.publicPath ? String(row.publicPath) : null;
  const path = existingPath && existingPath.startsWith('kp_') ? existingPath : generateLivePath(tournamentId);

  await writeTextdbPage(
    path,
    JSON.stringify(
      buildPublicLivePayload({
        ...snapshot,
        tournament: { ...snapshot.tournament, publicPath: path },
      })
    )
  );

  if (row.publicPath !== path || row.publicToken !== 'textdb') {
    await db
      .update(tournaments)
      .set({ publicToken: 'textdb', publicPath: path })
      .where(eq(tournaments.id, tournamentId));
  }

  return path;
}

export async function syncPublicLiveIfEnabled(tournamentId) {
  try {
    const row = await db
      .select({ publicToken: tournaments.publicToken, publicPath: tournaments.publicPath })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .get();
    if (!row?.publicPath) return;
    await publishPublicLivePage(tournamentId, { createIfMissing: false });
  } catch (err) {
    console.warn('syncPublicLiveIfEnabled failed:', err?.message || err);
  }
}
