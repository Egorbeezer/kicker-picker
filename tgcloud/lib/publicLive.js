import { db, fetch } from 'sdk';
import { eq } from 'sdk/db';
import { tournaments } from '../schema.js';
import { getTournamentSnapshot } from './helpers.js';

const LIVE_STORE_BASE = 'https://textdb.dev/api/data';

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
    const buf = new Uint8Array(12);
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

async function writeLivePayload(path, bodyStr) {
  const res = await fetch(`${LIVE_STORE_BASE}/${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: bodyStr,
  });
  await res.text();
  if (!res.ok) {
    throw new Error(`Live store error HTTP ${res.status}`);
  }
}

async function writeTelegraphFallback(row, bodyStr) {
  let token = row.publicToken && row.publicToken !== 'textdb' ? row.publicToken : null;
  if (!token) {
    const accRes = await fetch('https://api.telegra.ph/createAccount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        short_name: 'KickerPicker',
        author_name: 'Kicker Picker Bot',
      }),
    });
    const accJson = await accRes.json();
    if (!accJson?.ok || !accJson?.result?.access_token) {
      throw new Error('Telegraph fallback: failed to create account');
    }
    token = accJson.result.access_token;
  }

  const content = [{ tag: 'p', children: [bodyStr] }];
  const hasTelegraphPath = row.publicPath && !String(row.publicPath).startsWith('kp_');

  if (hasTelegraphPath) {
    const editRes = await fetch('https://api.telegra.ph/editPage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        path: row.publicPath,
        title: `Live: ${row.name}`,
        content,
      }),
    });
    const editJson = await editRes.json();
    if (editJson?.ok && editJson?.result?.path) {
      return { token, path: editJson.result.path };
    }
  }

  const createRes = await fetch('https://api.telegra.ph/createPage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: token,
      title: `Live: ${row.name}`,
      content,
    }),
  });
  const createJson = await createRes.json();
  if (!createJson?.ok || !createJson?.result?.path) {
    throw new Error('Telegraph fallback: failed to publish page');
  }
  return { token, path: createJson.result.path };
}

export async function deletePublicLivePage(publicPath, publicToken = null) {
  if (!publicPath) return;
  try {
    const pathStr = String(publicPath);
    if (pathStr.startsWith('kp_')) {
      await writeLivePayload(pathStr, '');
      return;
    }
    if (publicToken && publicToken !== 'textdb') {
      await fetch('https://api.telegra.ph/editPage', {
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

  let path = row.publicPath && String(row.publicPath).startsWith('kp_') ? row.publicPath : null;
  if (!path && !row.publicPath) {
    if (!createIfMissing) return null;
    path = generateLivePath(tournamentId);
  }

  const snapshot = await getTournamentSnapshot(tournamentId, 0);
  if (!snapshot) return null;

  const bodyPath = path || row.publicPath || generateLivePath(tournamentId);
  const payload = buildPublicLivePayload({
    ...snapshot,
    tournament: { ...snapshot.tournament, publicPath: bodyPath },
  });
  const bodyStr = JSON.stringify(payload);

  // Primary free store: textdb.dev (if path is kp_* or missing); automatic fallback to telegra.ph on error
  if (bodyPath.startsWith('kp_')) {
    try {
      await writeLivePayload(bodyPath, bodyStr);
      if (row.publicToken !== 'textdb' || bodyPath !== row.publicPath) {
        await db
          .update(tournaments)
          .set({ publicToken: 'textdb', publicPath: bodyPath })
          .where(eq(tournaments.id, tournamentId));
      }
      return bodyPath;
    } catch (err) {
      console.warn('Primary live store failed, switching to telegra.ph fallback:', err?.message || err);
    }
  }

  const tgFallback = await writeTelegraphFallback(row, bodyStr);
  if (row.publicToken !== tgFallback.token || tgFallback.path !== row.publicPath) {
    await db
      .update(tournaments)
      .set({ publicToken: tgFallback.token, publicPath: tgFallback.path })
      .where(eq(tournaments.id, tournamentId));
  }
  return tgFallback.path;
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
