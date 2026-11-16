import { normalizeTableConfig } from './config.js';

export function computeLeaderboard({ players, matches, tableConfig = null }) {
  const statsMap = new Map();

  for (const p of players) {
    statsMap.set(p.id, {
      playerId: p.id,
      tgId: p.tgId ?? null,
      name: p.name,
      initials: p.initials,
      isActive: Boolean(p.isActive),
      isGuest: Boolean(p.isGuest),
      dypRole: p.dypRole ?? null,
      byesCount: p.byesCount || 0,
      sortOrder: p.sortOrder ?? null,
      livesLeft: p.livesLeft ?? null,
      games: 0,
      wins: 0,
      losses: 0,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      diff: 0,
      ppm: 0,
      fairPpm: 0,
      winRate: 0,
      buchholz: 0,
      avgBuchholz: 0,
      sonnebornBerger: 0,
      isBelowGameThreshold: false,
    });
  }

  const finishedQual = matches.filter(
    (m) => m.status === 'FINISHED' && (!m.stage || m.stage === 'QUALIFICATION')
  );

  // Track each player's match history for Buchholz & Sonneborn-Berger
  const matchLogs = new Map();
  const addMatchLog = (id, oppIds, won) => {
    if (!matchLogs.has(id)) matchLogs.set(id, []);
    matchLogs.get(id).push({ oppIds, won });
  };

  for (const m of finishedQual) {
    const t1 = [m.team1Player1Id, m.team1Player2Id].filter(Boolean);
    const t2 = [m.team2Player1Id, m.team2Player2Id].filter(Boolean);
    const t1Won = m.score1 > m.score2;

    for (const id of t1) {
      const s = statsMap.get(id);
      if (!s) continue;
      s.games += 1;
      s.goalsFor += m.score1;
      s.goalsAgainst += m.score2;
      if (t1Won) {
        s.wins += 1;
        s.points += 2;
      } else {
        s.losses += 1;
      }
      addMatchLog(id, t2, t1Won);
    }

    for (const id of t2) {
      const s = statsMap.get(id);
      if (!s) continue;
      s.games += 1;
      s.goalsFor += m.score2;
      s.goalsAgainst += m.score1;
      if (!t1Won) {
        s.wins += 1;
        s.points += 2;
      } else {
        s.losses += 1;
      }
      addMatchLog(id, t1, !t1Won);
    }
  }

  let maxGames = 0;
  for (const s of statsMap.values()) {
    if (s.games > maxGames) maxGames = s.games;
  }
  const minFairThreshold = maxGames >= 2 ? Math.ceil(maxGames * 0.75) : 1;

  for (const s of statsMap.values()) {
    s.diff = s.goalsFor - s.goalsAgainst;
    s.ppm = s.games > 0 ? Number((s.points / s.games).toFixed(2)) : 0;
    const fairDenom = s.games > 0 ? Math.max(s.games, minFairThreshold) : 1;
    s.fairPpm = s.games > 0 ? Number((s.points / fairDenom).toFixed(2)) : 0;
    s.winRate = s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0;
    s.isBelowGameThreshold = maxGames >= 2 && s.games > 0 && s.games < minFairThreshold;
  }

  // Compute Buchholz & Sonneborn-Berger after all players' points are totaled
  for (const s of statsMap.values()) {
    const logs = matchLogs.get(s.playerId) || [];
    let bhSum = 0;
    let sbSum = 0;
    for (const entry of logs) {
      if (!entry.oppIds.length) continue;
      const oppAvgPts =
        entry.oppIds.reduce((sum, oppId) => sum + (statsMap.get(oppId)?.points || 0), 0) /
        entry.oppIds.length;
      bhSum += oppAvgPts;
      if (entry.won) {
        sbSum += oppAvgPts;
      }
    }
    s.buchholz = Number(bhSum.toFixed(2));
    s.avgBuchholz = s.games > 0 ? Number((bhSum / s.games).toFixed(2)) : 0;
    s.sonnebornBerger = Number(sbSum.toFixed(2));
  }

  const columns = normalizeTableConfig(tableConfig);
  const sortOrder = columns.filter((c) => c.sort).map((c) => c.key);

  const list = Array.from(statsMap.values());
  list.sort((a, b) => {
    for (const key of sortOrder) {
      if (key === 'wins' && b.wins !== a.wins) return b.wins - a.wins;
      if (key === 'ppm' && b.ppm !== a.ppm) return b.ppm - a.ppm;
      if (key === 'fairPpm' && b.fairPpm !== a.fairPpm) return b.fairPpm - a.fairPpm;
      if (key === 'points' && b.points !== a.points) return b.points - a.points;
      if (key === 'diff' && b.diff !== a.diff) return b.diff - a.diff;
      if (key === 'games' && b.games !== a.games) return b.games - a.games;
      if (key === 'losses' && a.losses !== b.losses) return a.losses - b.losses;
      if (key === 'goalsFor' && b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      if (key === 'goalsAgainst' && a.goalsAgainst !== b.goalsAgainst) return a.goalsAgainst - b.goalsAgainst;
      if (key === 'winRate' && b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (key === 'buchholz' && b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
      if (key === 'avgBuchholz' && b.avgBuchholz !== a.avgBuchholz) return b.avgBuchholz - a.avgBuchholz;
      if (key === 'sonnebornBerger' && b.sonnebornBerger !== a.sonnebornBerger) {
        return b.sonnebornBerger - a.sonnebornBerger;
      }
      if (key === 'name') {
        const cmp = a.name.localeCompare(b.name);
        if (cmp !== 0) return cmp;
      }
    }
    return a.playerId - b.playerId;
  });

  return list.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}

export function toEpochMs(val) {
  if (!val) return null;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val < 1e12 ? val * 1000 : val;
  }
  return null;
}

/**
 * Рассчитывает тайминги и прогресс турнира по истории матчей.
 */
/**
 * @param {{ tournament: any; matches?: any[]; activeTablesCount?: number | null; nowMs?: number }} params
 */
export function computeTournamentTimings({ tournament, matches = [], activeTablesCount = null, nowMs = Date.now() }) {
  const nonCancelled = matches.filter((m) => m.status !== 'CANCELLED');
  const finished = nonCancelled.filter((m) => m.status === 'FINISHED');
  const open = nonCancelled.filter((m) => m.status === 'PLAYING' || m.status === 'WAITING_CONFIRM');

  const durationsSec = [];
  for (const m of finished) {
    const startMs = toEpochMs(m.startedAt ?? m.createdAt);
    const endMs = toEpochMs(m.finishedAt);
    if (startMs && endMs && endMs > startMs) {
      const sec = Math.round((endMs - startMs) / 1000);
      // Игнорируем аномально длинные простои свыше 2 часов
      if (sec > 0 && sec <= 7200) {
        durationsSec.push(sec);
      }
    }
  }

  const avgMatchSeconds =
    durationsSec.length > 0
      ? Math.round(durationsSec.reduce((a, b) => a + b, 0) / durationsSec.length)
      : null;
  const avgMatchMinutes = avgMatchSeconds !== null ? Math.round((avgMatchSeconds / 60) * 10) / 10 : null;

  const startAnchor =
    toEpochMs(tournament?.startedAt) ||
    (nonCancelled.length > 0
      ? Math.min(...nonCancelled.map((m) => toEpochMs(m.startedAt ?? m.createdAt) || nowMs))
      : null);

  const endAnchor =
    tournament?.status === 'FINISHED' ? toEpochMs(tournament?.finishedAt) || nowMs : nowMs;
  const elapsedMinutes = startAnchor ? Math.max(0, Math.round((endAnchor - startAnchor) / 60000)) : 0;

  const tables = Math.max(1, activeTablesCount || tournament?.tablesCount || 1);

  const remainingMatchesEstimate = open.length;

  let remainingMinutes = null;
  let estimatedEndAt = null;
  if (tournament?.status === 'FINISHED') {
    remainingMinutes = 0;
    estimatedEndAt = toEpochMs(tournament?.finishedAt) || nowMs;
  } else if (avgMatchSeconds !== null && remainingMatchesEstimate > 0) {
    const waves = Math.ceil(remainingMatchesEstimate / tables);
    remainingMinutes = Math.max(1, Math.round((waves * avgMatchSeconds) / 60));
    estimatedEndAt = nowMs + remainingMinutes * 60000;
  }

  const playedCount = finished.length;
  const openCount = open.length;
  const totalCount = playedCount + openCount;
  const progressPercent =
    tournament?.status === 'FINISHED'
      ? 100
      : totalCount > 0
        ? Math.round((playedCount / totalCount) * 100)
        : 0;

  return {
    playedCount,
    openCount,
    totalCount,
    progressPercent,
    avgMatchSeconds,
    avgMatchMinutes,
    elapsedMinutes,
    remainingMinutes,
    estimatedEndAt,
    activeTablesCount: tables,
  };
}
