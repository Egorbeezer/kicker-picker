import {
  OPPONENT_PENALTY,
  PARTNER_PENALTY,
  pairKey,
  shuffleInPlace,
} from './config.js';
import {
  buildPenaltyMaps,
  calcArrangementPenalty,
  calcTeamBucketPenalty,
  pairRemainingPlayers,
} from './penalties.js';
import { generateRoundRobinRound } from './roundRobin.js';
import { generateSwissRound } from './swiss.js';

export { buildPenaltyMaps };

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

/**
 * @param {{
 *   players: any[];
 *   previousMatches?: any[];
 *   tablesCount?: number;
 *   activeTables?: number[] | null;
 *   dypMode?: string;
 *   teamFormat?: string;
 *   roundRobinLoops?: number;
 *   roundNumber?: number;
 *   losLives?: number;
 *   useBuckets?: boolean;
 *   preserveOrder?: boolean;
 *   randomFn?: () => number;
 * }} params
 */
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
