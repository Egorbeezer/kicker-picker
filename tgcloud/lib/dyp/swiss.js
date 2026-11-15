import { pairKey, shuffleInPlace } from './config.js';
import { buildPenaltyMaps, calcArrangementPenalty } from './penalties.js';
import { computeLeaderboard } from './standings.js';

export function generateSwissRound({
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

  // Swiss 2x2 DYP: prioritize pairing players in adjacent standings pods
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
