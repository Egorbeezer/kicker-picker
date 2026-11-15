import {
  OPPONENT_PENALTY,
  PARTNER_PENALTY,
  PARTIAL_BUCKET_PENALTY,
  SAME_BUCKET_PENALTY,
  pairKey,
  shuffleInPlace,
} from './config.js';
import { computeLeaderboard } from './standings.js';

export function buildPenaltyMaps(previousMatches) {
  const partnerCount = new Map();
  const opponentCount = new Map();

  const inc = (map, a, b) => {
    if (!a || !b || a === b) return;
    const key = pairKey(a, b);
    map.set(key, (map.get(key) || 0) + 1);
  };

  for (const m of previousMatches) {
    if (m.status === 'CANCELLED') continue;
    if (m.stage && m.stage !== 'QUALIFICATION') continue;
    const t1 = [m.team1Player1Id, m.team1Player2Id].filter(Boolean);
    const t2 = [m.team2Player1Id, m.team2Player2Id].filter(Boolean);

    if (t1.length === 2) inc(partnerCount, t1[0], t1[1]);
    if (t2.length === 2) inc(partnerCount, t2[0], t2[1]);

    for (const p1 of t1) {
      for (const p2 of t2) {
        inc(opponentCount, p1, p2);
      }
    }
  }

  return { partnerCount, opponentCount };
}

function calcTeamBucketPenalty(id1, id2, rolesMap) {
  const r1 = rolesMap.get(id1) || null;
  const r2 = rolesMap.get(id2) || null;
  if (r1 && r2) {
    return r1 === r2 ? SAME_BUCKET_PENALTY : 0;
  }
  if (r1 || r2) {
    return PARTIAL_BUCKET_PENALTY;
  }
  return 0;
}

function calcArrangementPenalty(order, partnerCount, opponentCount, rolesMap = null, useBuckets = false) {
  let total = 0;
  for (let i = 0; i < order.length; i += 4) {
    const a = order[i];
    const b = order[i + 1];
    const c = order[i + 2];
    const d = order[i + 3];

    total += (partnerCount.get(pairKey(a, b)) || 0) * PARTNER_PENALTY;
    total += (partnerCount.get(pairKey(c, d)) || 0) * PARTNER_PENALTY;

    if (useBuckets && rolesMap) {
      total += calcTeamBucketPenalty(a, b, rolesMap);
      total += calcTeamBucketPenalty(c, d, rolesMap);
    }

    total += (opponentCount.get(pairKey(a, c)) || 0) * OPPONENT_PENALTY;
    total += (opponentCount.get(pairKey(a, d)) || 0) * OPPONENT_PENALTY;
    total += (opponentCount.get(pairKey(b, c)) || 0) * OPPONENT_PENALTY;
    total += (opponentCount.get(pairKey(b, d)) || 0) * OPPONENT_PENALTY;
  }
  return total;
}

function pairRemainingPlayers(list, useBuckets, randomFn) {
  const shuffled = shuffleInPlace([...list], randomFn);
  if (!useBuckets) {
    const teams = [];
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      teams.push([shuffled[i], shuffled[i + 1]]);
    }
    return {
      teams,
      leftover: shuffled.length % 2 === 1 ? shuffled[shuffled.length - 1] : null,
    };
  }

  const bucketA = shuffled.filter((p) => p.dypRole === 'A');
  const bucketB = shuffled.filter((p) => p.dypRole === 'B');
  const neutral = shuffled.filter((p) => p.dypRole !== 'A' && p.dypRole !== 'B');
  const teams = [];

  while (bucketA.length > 0 && bucketB.length > 0) {
    teams.push([bucketA.pop(), bucketB.pop()]);
  }
  const restWithPreferred = [...bucketA, ...bucketB];
  while (restWithPreferred.length > 0 && neutral.length > 0) {
    teams.push([restWithPreferred.pop(), neutral.pop()]);
  }
  const pool = [...restWithPreferred, ...neutral];
  for (let i = 0; i + 1 < pool.length; i += 2) {
    teams.push([pool[i], pool[i + 1]]);
  }
  return {
    teams,
    leftover: pool.length % 2 === 1 ? pool[pool.length - 1] : null,
  };
}

function generateClassicDypRound({ active, previousMatches, usableTables, useBuckets, randomFn }) {
  const byId = new Map(active.map((p) => [p.id, p]));
  const assigned = new Set();
  const lockedTeams = [];

  const sortedPrev = [...previousMatches].sort((a, b) => (b.id || 0) - (a.id || 0));
  for (const m of sortedPrev) {
    if (m.status === 'CANCELLED') continue;
    if (m.stage && m.stage !== 'QUALIFICATION') continue;
    for (const [id1, id2] of [
      [m.team1Player1Id, m.team1Player2Id],
      [m.team2Player1Id, m.team2Player2Id],
    ]) {
      if (!id1 || !id2 || id1 === id2) continue;
      if (!byId.has(id1) || !byId.has(id2)) continue;
      if (assigned.has(id1) || assigned.has(id2)) continue;
      assigned.add(id1);
      assigned.add(id2);
      lockedTeams.push([byId.get(id1), byId.get(id2)]);
    }
  }

  const unassigned = active.filter((p) => !assigned.has(p.id));
  const { teams: newTeams, leftover } = pairRemainingPlayers(unassigned, useBuckets, randomFn);
  const allTeams = [...lockedTeams, ...newTeams];

  const rankedTeams = shuffleInPlace([...allTeams], randomFn).sort((tA, tB) => {
    const byesA = (tA[0].byesCount || 0) + (tA[1].byesCount || 0);
    const byesB = (tB[0].byesCount || 0) + (tB[1].byesCount || 0);
    return byesB - byesA;
  });

  const playingTeamCount = Math.min(usableTables.length * 2, Math.floor(rankedTeams.length / 2) * 2);
  if (playingTeamCount < 2) {
    throw new Error('Для генерации раунда нужно минимум 4 активных игрока');
  }

  const playingTeams = rankedTeams.slice(0, playingTeamCount);
  const restingTeams = rankedTeams.slice(playingTeamCount);
  const byePlayerIds = [
    ...restingTeams.flatMap((t) => [t[0].id, t[1].id]),
    ...(leftover ? [leftover.id] : []),
  ];

  const { opponentCount } = buildPenaltyMaps(previousMatches);
  const calcTeamOppPenalty = (teamsList) => {
    let total = 0;
    for (let i = 0; i < teamsList.length; i += 2) {
      const [a, b] = teamsList[i];
      const [c, d] = teamsList[i + 1];
      total += (opponentCount.get(pairKey(a.id, c.id)) || 0) * OPPONENT_PENALTY;
      total += (opponentCount.get(pairKey(a.id, d.id)) || 0) * OPPONENT_PENALTY;
      total += (opponentCount.get(pairKey(b.id, c.id)) || 0) * OPPONENT_PENALTY;
      total += (opponentCount.get(pairKey(b.id, d.id)) || 0) * OPPONENT_PENALTY;
    }
    return total;
  };

  let bestTeams = [...playingTeams];
  let bestPenalty = calcTeamOppPenalty(bestTeams);
  for (let iter = 0; iter < 250 && bestPenalty > 0; iter++) {
    const candidate = shuffleInPlace([...playingTeams], randomFn);
    const p = calcTeamOppPenalty(candidate);
    if (p < bestPenalty) {
      bestPenalty = p;
      bestTeams = candidate;
    }
  }

  const pairings = [];
  for (let i = 0; i < bestTeams.length; i += 2) {
    pairings.push({
      tableNumber: usableTables[i / 2],
      team1: [bestTeams[i][0].id, bestTeams[i][1].id],
      team2: [bestTeams[i + 1][0].id, bestTeams[i + 1][1].id],
    });
  }

  return {
    pairings,
    byePlayerIds,
    penalty: bestPenalty,
  };
}

function sortBySeedOrByes(list, preserveOrder, randomFn) {
  if (preserveOrder) {
    return [...list].sort((a, b) => {
      const byeDiff = (b.byesCount || 0) - (a.byesCount || 0);
      if (byeDiff !== 0) return byeDiff;
      return (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id);
    });
  }
  const shuffled = shuffleInPlace([...list], randomFn);
  shuffled.sort((a, b) => (b.byesCount || 0) - (a.byesCount || 0));
  return shuffled;
}

function generateSingleRandomRound({ active, usableTables, preserveOrder, randomFn }) {
  if (active.length < 2) {
    throw new Error('Для одиночного раунда 1×1 нужно минимум 2 активных игрока');
  }
  const ordered = sortBySeedOrByes(active, preserveOrder, randomFn);
  const playingCount = Math.min(usableTables.length * 2, Math.floor(ordered.length / 2) * 2);
  const playing = ordered.slice(0, playingCount);
  const resting = ordered.slice(playingCount);
  const pairings = [];
  for (let i = 0; i < playing.length; i += 2) {
    pairings.push({
      tableNumber: usableTables[i / 2],
      team1: [playing[i].id, null],
      team2: [playing[i + 1].id, null],
    });
  }
  return {
    pairings,
    byePlayerIds: resting.map((p) => p.id),
    penalty: 0,
  };
}

function generateRandomDypRound({ active, usableTables, teamFormat, preserveOrder, randomFn }) {
  if (teamFormat === 'single') {
    return generateSingleRandomRound({ active, usableTables, preserveOrder, randomFn });
  }
  const ordered = sortBySeedOrByes(active, preserveOrder, randomFn);
  const playingCount = Math.min(usableTables.length * 4, Math.floor(ordered.length / 4) * 4);
  if (playingCount < 4) {
    throw new Error('Для генерации раунда нужно минимум 4 активных игрока');
  }
  const playing = ordered.slice(0, playingCount);
  const resting = ordered.slice(playingCount);
  const pairings = [];
  for (let i = 0; i < playing.length; i += 4) {
    pairings.push({
      tableNumber: usableTables[i / 4],
      team1: [playing[i].id, playing[i + 1].id],
      team2: [playing[i + 2].id, playing[i + 3].id],
    });
  }
  return {
    pairings,
    byePlayerIds: resting.map((p) => p.id),
    penalty: 0,
  };
}

function buildRoundRobinPairings(units, roundNumber, totalLoops) {
  const list = [...units];
  if (list.length % 2 === 1) {
    list.push(null); // bye slot
  }
  const n = list.length;
  const roundsPerLoop = n - 1;
  const totalRounds = roundsPerLoop * Math.max(1, totalLoops || 1);
  if (roundNumber > totalRounds) {
    return { done: true, matches: [], byeUnits: [] };
  }

  const zeroIdx = roundNumber - 1;
  const loopIdx = Math.floor(zeroIdx / roundsPerLoop);
  const step = zeroIdx % roundsPerLoop;

  // Berger circle rotation keeping element 0 fixed
  const rotated = [list[0]];
  const rest = list.slice(1);
  const offset = (rest.length - (step % rest.length)) % rest.length;
  for (let i = 0; i < rest.length; i++) {
    rotated.push(rest[(i + offset) % rest.length]);
  }

  const matches = [];
  const byeUnits = [];
  for (let i = 0; i < n / 2; i++) {
    const u1 = rotated[i];
    const u2 = rotated[n - 1 - i];
    if (!u1 || !u2) {
      if (u1) byeUnits.push(u1);
      if (u2) byeUnits.push(u2);
      continue;
    }
    if (loopIdx % 2 === 1) {
      matches.push([u2, u1]);
    } else {
      matches.push([u1, u2]);
    }
  }
  return { done: false, matches, byeUnits };
}

function generateRoundRobinRound({
  active,
  previousMatches,
  usableTables,
  teamFormat,
  roundRobinLoops = 1,
  roundNumber = 1,
  useBuckets = false,
  preserveOrder = false,
  randomFn,
}) {
  if (teamFormat === 'single') {
    if (active.length < 2) {
      throw new Error('Для кругового турнира 1×1 нужно минимум 2 активных игрока');
    }
    const ordered = [...active].sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));
    const schedule = buildRoundRobinPairings(ordered, roundNumber, roundRobinLoops);
    if (schedule.done) {
      return { done: true, pairings: [], byePlayerIds: [], penalty: 0 };
    }
    const pairings = schedule.matches.map(([p1, p2], idx) => ({
      tableNumber: usableTables[idx % usableTables.length],
      team1: [p1.id, null],
      team2: [p2.id, null],
    }));
    return {
      done: false,
      pairings,
      byePlayerIds: schedule.byeUnits.map((p) => p.id),
      penalty: 0,
    };
  }

  // Fixed pairs round robin (2x2)
  const byId = new Map(active.map((p) => [p.id, p]));
  const assigned = new Set();
  const lockedTeams = [];
  const sortedPrev = [...previousMatches].sort((a, b) => (a.id || 0) - (b.id || 0));
  for (const m of sortedPrev) {
    if (m.status === 'CANCELLED') continue;
    if (m.stage && m.stage !== 'QUALIFICATION') continue;
    for (const [id1, id2] of [
      [m.team1Player1Id, m.team1Player2Id],
      [m.team2Player1Id, m.team2Player2Id],
    ]) {
      if (!id1 || !id2 || id1 === id2) continue;
      if (!byId.has(id1) || !byId.has(id2)) continue;
      if (assigned.has(id1) || assigned.has(id2)) continue;
      assigned.add(id1);
      assigned.add(id2);
      lockedTeams.push([byId.get(id1), byId.get(id2)]);
    }
  }

  const unassigned = active
    .filter((p) => !assigned.has(p.id))
    .sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));
  let newTeams = [];
  let leftover = null;
  if (preserveOrder && !useBuckets) {
    for (let i = 0; i + 1 < unassigned.length; i += 2) {
      newTeams.push([unassigned[i], unassigned[i + 1]]);
    }
    if (unassigned.length % 2 === 1) leftover = unassigned[unassigned.length - 1];
  } else {
    const paired = pairRemainingPlayers(unassigned, useBuckets, randomFn);
    newTeams = paired.teams;
    leftover = paired.leftover;
  }

  const allTeams = [...lockedTeams, ...newTeams].sort(
    (tA, tB) => (tA[0].sortOrder ?? tA[0].id) - (tB[0].sortOrder ?? tB[0].id)
  );
  if (allTeams.length < 2) {
    throw new Error('Для парного кругового турнира нужно минимум 4 активных игрока');
  }

  const schedule = buildRoundRobinPairings(allTeams, roundNumber, roundRobinLoops);
  if (schedule.done) {
    return { done: true, pairings: [], byePlayerIds: [], penalty: 0 };
  }
  const pairings = schedule.matches.map(([t1, t2], idx) => ({
    tableNumber: usableTables[idx % usableTables.length],
    team1: [t1[0].id, t1[1].id],
    team2: [t2[0].id, t2[1].id],
  }));
  const byePlayerIds = [
    ...schedule.byeUnits.flatMap((t) => [t[0].id, t[1].id]),
    ...(leftover ? [leftover.id] : []),
  ];
  return { done: false, pairings, byePlayerIds, penalty: 0 };
}

function generateSwissRound({
  active,
  previousMatches,
  usableTables,
  teamFormat,
  useBuckets,
  preserveOrder,
  randomFn,
}) {
  const { opponentCount, partnerCount } = buildPenaltyMaps(previousMatches);
  const leaderboard = computeLeaderboard({ players: active, matches: previousMatches });
  const rankMap = new Map(leaderboard.map((row) => [row.playerId, row]));

  const sortRanked = (list) => {
    const copy = [...list];
    if (previousMatches.length === 0 && !preserveOrder) {
      shuffleInPlace(copy, randomFn);
      return copy.sort((a, b) => (b.byesCount || 0) - (a.byesCount || 0));
    }
    return copy.sort((a, b) => {
      if (previousMatches.length === 0 && preserveOrder) {
        return (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id);
      }
      const ra = rankMap.get(a.id);
      const rb = rankMap.get(b.id);
      const ptsDiff = (rb?.points || 0) - (ra?.points || 0);
      if (ptsDiff !== 0) return ptsDiff;
      const diffGap = (rb?.diff || 0) - (ra?.diff || 0);
      if (diffGap !== 0) return diffGap;
      return (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id);
    });
  };

  if (teamFormat === 'single') {
    if (active.length < 2) {
      throw new Error('Для швейцарки 1×1 нужно минимум 2 активных игрока');
    }
    const ranked = sortRanked(active);
    const maxPlay = Math.min(usableTables.length * 2, Math.floor(ranked.length / 2) * 2);

    // If players rest, lowest ranked players without a bye rest first
    let resting = [];
    let pool = ranked;
    if (ranked.length > maxPlay) {
      const restCount = ranked.length - maxPlay;
      const byeCandidates = [...ranked].sort((a, b) => {
        const byeDiff = (a.byesCount || 0) - (b.byesCount || 0);
        if (byeDiff !== 0) return byeDiff;
        const ra = rankMap.get(a.id);
        const rb = rankMap.get(b.id);
        return (ra?.points || 0) - (rb?.points || 0);
      });
      resting = byeCandidates.slice(0, restCount);
      const restSet = new Set(resting.map((p) => p.id));
      pool = ranked.filter((p) => !restSet.has(p.id));
    }

    // Greedy + local 2-opt Swiss matching minimizing (rematches * 5000 + |rankIdxA - rankIdxB| * 100)
    const idxMap = new Map(pool.map((p, idx) => [p.id, idx]));
    const order = [...pool];
    const scorePairOrder = (arr) => {
      let cost = 0;
      for (let i = 0; i < arr.length; i += 2) {
        const a = arr[i];
        const b = arr[i + 1];
        const rematches = opponentCount.get(pairKey(a.id, b.id)) || 0;
        const rankDist = Math.abs((idxMap.get(a.id) || 0) - (idxMap.get(b.id) || 0));
        cost += rematches * 5000 + rankDist * 100;
      }
      return cost;
    };

    let bestCost = scorePairOrder(order);
    let improved = true;
    for (let pass = 0; pass < 6 && improved; pass++) {
      improved = false;
      for (let i = 0; i < order.length; i++) {
        for (let j = i + 1; j < order.length; j++) {
          if (Math.floor(i / 2) === Math.floor(j / 2)) continue;
          [order[i], order[j]] = [order[j], order[i]];
          const c = scorePairOrder(order);
          if (c < bestCost) {
            bestCost = c;
            improved = true;
          } else {
            [order[i], order[j]] = [order[j], order[i]];
          }
        }
      }
    }

    const pairings = [];
    for (let i = 0; i < order.length; i += 2) {
      pairings.push({
        tableNumber: usableTables[i / 2],
        team1: [order[i].id, null],
        team2: [order[i + 1].id, null],
      });
    }
    return {
      pairings,
      byePlayerIds: resting.map((p) => p.id),
      penalty: bestCost,
    };
  }

  // Swiss 2x2 DYP: prioritize pairing players in adjacent standings pods while minimizing repeat partners/opponents
  const ranked = sortRanked(active);
  const playingCount = Math.min(usableTables.length * 4, Math.floor(ranked.length / 4) * 4);
  if (playingCount < 4) {
    throw new Error('Для швейцарки 2×2 нужно минимум 4 активных игрока');
  }

  let resting = [];
  let pool = ranked;
  if (ranked.length > playingCount) {
    const restCount = ranked.length - playingCount;
    const byeCandidates = [...ranked].sort((a, b) => {
      const byeDiff = (a.byesCount || 0) - (b.byesCount || 0);
      if (byeDiff !== 0) return byeDiff;
      const ra = rankMap.get(a.id);
      const rb = rankMap.get(b.id);
      return (ra?.points || 0) - (rb?.points || 0);
    });
    resting = byeCandidates.slice(0, restCount);
    const restSet = new Set(resting.map((p) => p.id));
    pool = ranked.filter((p) => !restSet.has(p.id));
  }

  const rolesMap = new Map(active.map((p) => [p.id, p.dypRole || null]));
  const swissRankMap = new Map(pool.map((p, idx) => [p.id, idx]));

  const calcSwissPenalty = (orderIds) => {
    let total = calcArrangementPenalty(orderIds, partnerCount, opponentCount, rolesMap, useBuckets);
    for (let i = 0; i < orderIds.length; i += 4) {
      const r = [
        swissRankMap.get(orderIds[i]) || 0,
        swissRankMap.get(orderIds[i + 1]) || 0,
        swissRankMap.get(orderIds[i + 2]) || 0,
        swissRankMap.get(orderIds[i + 3]) || 0,
      ];
      const spread = Math.max(...r) - Math.min(...r);
      total += spread * 80;
    }
    return total;
  };

  // Seed order balancing pod [0,3 vs 1,2] for adjacent standings groups
  let bestOrder = [];
  for (let i = 0; i < pool.length; i += 4) {
    bestOrder.push(pool[i].id, pool[i + 3].id, pool[i + 1].id, pool[i + 2].id);
  }
  let bestPenalty = calcSwissPenalty(bestOrder);

  for (let pass = 0; pass < 5; pass++) {
    let improved = false;
    for (let i = 0; i < bestOrder.length; i++) {
      for (let j = i + 1; j < bestOrder.length; j++) {
        [bestOrder[i], bestOrder[j]] = [bestOrder[j], bestOrder[i]];
        const p = calcSwissPenalty(bestOrder);
        if (p < bestPenalty) {
          bestPenalty = p;
          improved = true;
        } else {
          [bestOrder[i], bestOrder[j]] = [bestOrder[j], bestOrder[i]];
        }
      }
    }
    if (!improved) break;
  }

  const pairings = [];
  for (let i = 0; i < bestOrder.length; i += 4) {
    pairings.push({
      tableNumber: usableTables[i / 4],
      team1: [bestOrder[i], bestOrder[i + 1]],
      team2: [bestOrder[i + 2], bestOrder[i + 3]],
    });
  }
  return {
    pairings,
    byePlayerIds: resting.map((p) => p.id),
    penalty: bestPenalty,
  };
}

export function generateDypRound({
  players,
  previousMatches = [],
  tablesCount = 2,
  activeTables = null,
  dypMode = 'monster',
  teamFormat = 'pairs',
  roundRobinLoops = 1,
  roundNumber = 1,
  losLives = 3,
  useBuckets = false,
  preserveOrder = false,
  randomFn = Math.random,
}) {
  let active = players.filter((p) => p.isActive);

  if (dypMode === 'last_one_standing') {
    active = active.filter((p) => (p.livesLeft ?? losLives) > 0);
    if (active.length <= 1) {
      return { done: true, pairings: [], byePlayerIds: [], penalty: 0 };
    }
  }

  const minNeeded =
    teamFormat === 'single' || (dypMode === 'last_one_standing' && active.length <= 3) ? 2 : 4;
  if (active.length < minNeeded) {
    throw new Error(
      minNeeded === 2
        ? 'Для генерации раунда нужно минимум 2 активных игрока'
        : 'Для генерации раунда нужно минимум 4 активных игрока'
    );
  }

  const usableTables = Array.isArray(activeTables)
    ? activeTables
    : Array.from({ length: Math.max(1, tablesCount) }, (_, i) => i + 1);

  if (usableTables.length === 0) {
    throw new Error('Нет активных столов — включите хотя бы один стол');
  }

  if (dypMode === 'classic') {
    return generateClassicDypRound({
      active,
      previousMatches,
      usableTables,
      useBuckets,
      randomFn,
    });
  }

  if (dypMode === 'random_dyp') {
    return generateRandomDypRound({
      active,
      usableTables,
      teamFormat,
      preserveOrder,
      randomFn,
    });
  }

  if (dypMode === 'round_robin') {
    return generateRoundRobinRound({
      active,
      previousMatches,
      usableTables,
      teamFormat,
      roundRobinLoops,
      roundNumber,
      useBuckets,
      preserveOrder,
      randomFn,
    });
  }

  if (dypMode === 'swiss') {
    return generateSwissRound({
      active,
      previousMatches,
      usableTables,
      teamFormat,
      useBuckets,
      preserveOrder,
      randomFn,
    });
  }

  if (dypMode === 'last_one_standing' && (teamFormat === 'single' || active.length <= 3)) {
    return generateSingleRandomRound({
      active,
      usableTables,
      preserveOrder,
      randomFn,
    });
  }

  if (teamFormat === 'single') {
    return generateSingleRandomRound({
      active,
      usableTables,
      preserveOrder,
      randomFn,
    });
  }

  const maxTables = usableTables.length;
  const playingCount = Math.min(maxTables * 4, Math.floor(active.length / 4) * 4);

  // Fair byes: players with more byes play first; ties broken randomly (or by sortOrder if preserveOrder)
  const shuffled = sortBySeedOrByes(active, preserveOrder, randomFn);

  const playing = shuffled.slice(0, playingCount);
  const resting = shuffled.slice(playingCount);
  const playingIds = playing.map((p) => p.id);
  const rolesMap = new Map(active.map((p) => [p.id, p.dypRole || null]));

  const { partnerCount, opponentCount } = buildPenaltyMaps(previousMatches);
  const partnerWeight = dypMode === 'whist' ? 5000 : PARTNER_PENALTY;
  const opponentWeight = dypMode === 'whist' ? 1500 : OPPONENT_PENALTY;

  const calcWeightedPenalty = (order) => {
    if (dypMode !== 'whist') {
      return calcArrangementPenalty(order, partnerCount, opponentCount, rolesMap, useBuckets);
    }
    let total = 0;
    for (let i = 0; i < order.length; i += 4) {
      const a = order[i];
      const b = order[i + 1];
      const c = order[i + 2];
      const d = order[i + 3];
      total += (partnerCount.get(pairKey(a, b)) || 0) * partnerWeight;
      total += (partnerCount.get(pairKey(c, d)) || 0) * partnerWeight;
      if (useBuckets && rolesMap) {
        total += calcTeamBucketPenalty(a, b, rolesMap);
        total += calcTeamBucketPenalty(c, d, rolesMap);
      }
      total += (opponentCount.get(pairKey(a, c)) || 0) * opponentWeight;
      total += (opponentCount.get(pairKey(a, d)) || 0) * opponentWeight;
      total += (opponentCount.get(pairKey(b, c)) || 0) * opponentWeight;
      total += (opponentCount.get(pairKey(b, d)) || 0) * opponentWeight;
    }
    return total;
  };

  let bestOrder = [...playingIds];
  let bestPenalty = calcWeightedPenalty(bestOrder);

  if (!preserveOrder) {
    const iterations = playingIds.length <= 8 ? 350 : 900;
    for (let iter = 0; iter < iterations; iter++) {
      const candidate = shuffleInPlace([...playingIds], randomFn);
      const penalty = calcWeightedPenalty(candidate);
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestOrder = candidate;
        if (bestPenalty === 0) break;
      }
    }

    // Local 2-opt swap refinement if penalty is still > 0
    if (bestPenalty > 0 && bestOrder.length > 4) {
      let improved = true;
      let passes = 0;
      while (improved && passes < 5) {
        improved = false;
        passes++;
        for (let i = 0; i < bestOrder.length; i++) {
          for (let j = i + 1; j < bestOrder.length; j++) {
            if (Math.floor(i / 4) === Math.floor(j / 4) && Math.floor(i / 2) === Math.floor(j / 2)) {
              continue;
            }
            [bestOrder[i], bestOrder[j]] = [bestOrder[j], bestOrder[i]];
            const p = calcWeightedPenalty(bestOrder);
            if (p < bestPenalty) {
              bestPenalty = p;
              improved = true;
            } else {
              [bestOrder[i], bestOrder[j]] = [bestOrder[j], bestOrder[i]];
            }
          }
        }
      }
    }
  }

  const pairings = [];
  for (let i = 0; i < bestOrder.length; i += 4) {
    pairings.push({
      tableNumber: usableTables[i / 4],
      team1: [bestOrder[i], bestOrder[i + 1]],
      team2: [bestOrder[i + 2], bestOrder[i + 3]],
    });
  }

  return {
    pairings,
    byePlayerIds: resting.map((p) => p.id),
    penalty: bestPenalty,
  };
}
