/**
 * Pure Monster DYP tournament engine:
 * - Penalty-matrix round pairing + fair byes
 * - Leaderboard & configurable tie-breakers (default: Wins, PPM, GD, Games)
 * - Playoff seeding & bracket progression
 * - Score validation (targetScore, winByTwo, maxScore)
 */

export const DEFAULT_TABLE_COLUMNS = [
  { key: 'wins', label: 'Выиграно игр', shortLabel: 'Поб', sort: true, visible: true },
  { key: 'ppm', label: 'Среднее кол-во очков', shortLabel: 'Ср.очк', sort: true, visible: true },
  { key: 'diff', label: 'Разница голов', shortLabel: '+/-', sort: true, visible: true },
  { key: 'games', label: 'Количество игр', shortLabel: 'Игр', sort: true, visible: true },
  { key: 'name', label: 'Название команды', shortLabel: 'Игрок', sort: false, visible: true },
  { key: 'fairPpm', label: 'Справедливые ср. очки', shortLabel: 'ØОч*', sort: false, visible: false },
  { key: 'points', label: 'Очки', shortLabel: 'Очк', sort: false, visible: false },
  { key: 'losses', label: 'Поражения', shortLabel: 'Пор', sort: false, visible: false },
  { key: 'goalsFor', label: 'Забито голов', shortLabel: 'Заб', sort: false, visible: false },
  { key: 'goalsAgainst', label: 'Пропущено голов', shortLabel: 'Проп', sort: false, visible: false },
  { key: 'winRate', label: 'Процент побед', shortLabel: '%Поб', sort: false, visible: false },
  { key: 'buchholz', label: 'Бухгольц (сумма очков соперников)', shortLabel: 'BH₁', sort: false, visible: false },
  { key: 'avgBuchholz', label: 'Средний Бухгольц соперников', shortLabel: 'ØBH', sort: false, visible: false },
  { key: 'sonnebornBerger', label: 'Зоннеборн–Бергер', shortLabel: 'SB', sort: false, visible: false },
];

export function normalizeTableConfig(rawConfig) {
  const defaultsMap = new Map(DEFAULT_TABLE_COLUMNS.map((c) => [c.key, c]));
  if (!Array.isArray(rawConfig) || rawConfig.length === 0) {
    return DEFAULT_TABLE_COLUMNS.map((c) => ({ ...c }));
  }

  const result = [];
  const seen = new Set();
  for (const item of rawConfig) {
    const key = String(item?.key || '');
    const def = defaultsMap.get(key);
    if (!def || seen.has(key)) continue;
    seen.add(key);
    result.push({
      ...def,
      sort: typeof item?.sort === 'boolean' ? item.sort : def.sort,
      visible: typeof item?.visible === 'boolean' ? item.visible : def.visible,
    });
  }
  for (const def of DEFAULT_TABLE_COLUMNS) {
    if (!seen.has(def.key)) {
      result.push({ ...def });
    }
  }
  return result;
}

const PARTNER_PENALTY = 1000;
const OPPONENT_PENALTY = 500;
const SAME_BUCKET_PENALTY = 3000;
const PARTIAL_BUCKET_PENALTY = 300;

function shuffleInPlace(arr, randomFn = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pairKey(idA, idB) {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

export function validateMatchScore(score1, score2, rules) {
  if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0) {
    return { valid: false, reason: 'Счет должен быть целым неотрицательным числом' };
  }
  if (score1 === score2) {
    return { valid: false, reason: 'В кикере не может быть ничьей' };
  }

  const winnerScore = Math.max(score1, score2);
  const loserScore = Math.min(score1, score2);
  const target = rules.targetScore ?? 5;
  const winByTwo = Boolean(rules.winByTwo);
  const maxScore = Math.max(target, rules.maxScore ?? target + 2);

  if (winnerScore < target) {
    return { valid: false, reason: `Победитель должен набрать минимум ${target} голов` };
  }

  if (!winByTwo) {
    if (winnerScore > target) {
      return { valid: false, reason: `При игре без баланса максимум голов — ${target}` };
    }
    return { valid: true, winner: score1 > score2 ? 1 : 2 };
  }

  if (winnerScore > maxScore) {
    return { valid: false, reason: `Жесткий лимит голов — ${maxScore}` };
  }

  const diff = winnerScore - loserScore;
  if (winnerScore === maxScore) {
    if (diff < 1) {
      return { valid: false, reason: 'Некорректный счет на лимите' };
    }
    return { valid: true, winner: score1 > score2 ? 1 : 2 };
  }

  if (winnerScore === target && diff >= 2) {
    return { valid: true, winner: score1 > score2 ? 1 : 2 };
  }

  if (winnerScore > target && diff === 2) {
    return { valid: true, winner: score1 > score2 ? 1 : 2 };
  }

  return {
    valid: false,
    reason: `При включенном балансе нужна разница в 2 мяча (или достижение лимита ${maxScore})`,
  };
}

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

/**
 * Balanced Monster DYP playoff seeding:
 * Top-4  -> 2 teams  -> Final (1+4 vs 2+3)
 * Top-8  -> 4 teams  -> Semifinals: (1+8 vs 4+5) and (2+7 vs 3+6)
 * Top-16 -> 8 teams  -> Quarterfinals: QF1..QF4
 * Top-32 -> 16 teams -> 1/8 Finals: EF1..EF8
 */
function pickTableNumber(idx, tablesCount, activeTables) {
  if (Array.isArray(activeTables) && activeTables.length > 0) {
    return activeTables[idx % activeTables.length];
  }
  return (idx % Math.max(1, tablesCount || 1)) + 1;
}

export function generatePlayoffFirstRound({
  leaderboard,
  playoffSize = 8,
  tablesCount = 2,
  activeTables = null,
  teamFormat = 'pairs',
}) {
  // Absent participants (isActive === false) stay in standings for stats,
  // but are skipped during playoff seeding so lower-ranked active players move up.
  const eligible = (leaderboard || []).filter((row) => row && row.isActive !== false);

  if (teamFormat === 'single') {
    const validSingleSizes = [2, 4, 8, 16, 32];
    const requested = validSingleSizes.includes(playoffSize) ? playoffSize : 4;
    let effectiveSize = 0;
    for (const candidate of validSingleSizes) {
      if (candidate <= requested && candidate <= eligible.length) {
        effectiveSize = candidate;
      }
    }
    if (effectiveSize < 2) {
      throw new Error('Для плей-офф 1×1 нужно минимум 2 присутствующих участника');
    }
    const top = eligible.slice(0, effectiveSize);
    const teams = top.map((p, idx) => ({
      seed: idx + 1,
      players: [p.playerId, null],
    }));

    const teamCount = teams.length;
    let matchPairs = [];
    let prefix = 'FINAL';
    if (teamCount === 2) {
      matchPairs = [[teams[0], teams[1]]];
      prefix = 'FINAL';
    } else if (teamCount === 4) {
      matchPairs = [
        [teams[0], teams[3]],
        [teams[1], teams[2]],
      ];
      prefix = 'SF';
    } else if (teamCount === 8) {
      matchPairs = [
        [teams[0], teams[7]],
        [teams[3], teams[4]],
        [teams[1], teams[6]],
        [teams[2], teams[5]],
      ];
      prefix = 'QF';
    } else if (teamCount === 16) {
      matchPairs = [
        [teams[0], teams[15]],
        [teams[7], teams[8]],
        [teams[3], teams[12]],
        [teams[4], teams[11]],
        [teams[1], teams[14]],
        [teams[6], teams[9]],
        [teams[2], teams[13]],
        [teams[5], teams[10]],
      ];
      prefix = 'EF';
    } else {
      // 32 single players -> 16 matches (R32_1 .. R32_16)
      for (let i = 0; i < 16; i++) {
        matchPairs.push([teams[i], teams[31 - i]]);
      }
      prefix = 'R32_';
    }

    return matchPairs.map(([t1, t2], idx) => ({
      stage: 'PLAYOFF',
      roundNumber: 1,
      bracketSlot: prefix === 'FINAL' ? 'FINAL' : `${prefix}${idx + 1}`,
      tableNumber: pickTableNumber(idx, tablesCount, activeTables),
      team1: t1.players,
      team2: t2.players,
    }));
  }

  const validSize = [4, 8, 16, 32].includes(playoffSize) ? playoffSize : 8;
  const effectiveSize = Math.min(validSize, Math.floor(eligible.length / 4) * 4);
  if (effectiveSize < 4) {
    throw new Error('Для плей-офф нужно минимум 4 присутствующих участника');
  }

  const top = eligible.slice(0, effectiveSize);
  const teamCount = effectiveSize / 2;
  const teams = [];
  for (let i = 0; i < teamCount; i++) {
    teams.push({
      seed: i + 1,
      players: [top[i].playerId, top[effectiveSize - 1 - i].playerId],
    });
  }

  let matchPairs;
  let roundNumber = 1;
  let prefix = 'QF';

  if (teamCount === 2) {
    matchPairs = [[teams[0], teams[1]]];
    roundNumber = 1;
    prefix = 'FINAL';
  } else if (teamCount === 4) {
    matchPairs = [
      [teams[0], teams[3]],
      [teams[1], teams[2]],
    ];
    prefix = 'SF';
  } else if (teamCount === 8) {
    // 8 teams -> QF
    matchPairs = [
      [teams[0], teams[7]],
      [teams[3], teams[4]],
      [teams[1], teams[6]],
      [teams[2], teams[5]],
    ];
    prefix = 'QF';
  } else {
    // 16 teams -> 1/8 Finals (EF1..EF8)
    matchPairs = [
      [teams[0], teams[15]],
      [teams[7], teams[8]],
      [teams[3], teams[12]],
      [teams[4], teams[11]],
      [teams[1], teams[14]],
      [teams[6], teams[9]],
      [teams[2], teams[13]],
      [teams[5], teams[10]],
    ];
    prefix = 'EF';
  }

  return matchPairs.map(([t1, t2], idx) => ({
    stage: 'PLAYOFF',
    roundNumber,
    bracketSlot: prefix === 'FINAL' ? 'FINAL' : `${prefix}${idx + 1}`,
    tableNumber: pickTableNumber(idx, tablesCount, activeTables),
    team1: t1.players,
    team2: t2.players,
  }));
}

export function getNextPlayoffMatches({ currentRoundMatches, thirdPlaceMatch = true, tablesCount = 2, activeTables = null }) {
  if (!currentRoundMatches.length || currentRoundMatches.some((m) => m.status !== 'FINISHED')) {
    return { done: false, nextMatches: [] };
  }

  const slots = currentRoundMatches.map((m) => m.bracketSlot || '');
  if (slots.includes('FINAL')) {
    return { done: true, nextMatches: [] };
  }

  const currentRound = currentRoundMatches[0].roundNumber;
  const nextRound = currentRound + 1;

  const getWinnerAndLoser = (m) => {
    const t1Won = m.setsWon1 > m.setsWon2 || (m.setsWon1 === m.setsWon2 && m.score1 > m.score2);
    const t1 = [m.team1Player1Id, m.team1Player2Id].filter(Boolean);
    const t2 = [m.team2Player1Id, m.team2Player2Id].filter(Boolean);
    return {
      winner: t1Won ? t1 : t2,
      loser: t1Won ? t2 : t1,
    };
  };

  const slotIndex = (s) => {
    const num = Number(String(s || '').replace(/\D+/g, ''));
    return Number.isFinite(num) && num > 0 ? num : 0;
  };
  const sorted = [...currentRoundMatches].sort(
    (a, b) => slotIndex(a.bracketSlot) - slotIndex(b.bracketSlot)
  );

  if (sorted.length === 2) {
    // Semifinals -> Final (+ optional 3rd place)
    const sf1 = getWinnerAndLoser(sorted[0]);
    const sf2 = getWinnerAndLoser(sorted[1]);
    const nextMatches = [
      {
        stage: 'PLAYOFF',
        roundNumber: nextRound,
        bracketSlot: 'FINAL',
        tableNumber: pickTableNumber(0, tablesCount, activeTables),
        team1: sf1.winner,
        team2: sf2.winner,
      },
    ];
    if (thirdPlaceMatch) {
      nextMatches.push({
        stage: 'PLAYOFF',
        roundNumber: nextRound,
        bracketSlot: 'THIRD_PLACE',
        tableNumber: pickTableNumber(1, tablesCount, activeTables),
        team1: sf1.loser,
        team2: sf2.loser,
      });
    }
    return { done: false, nextMatches };
  }

  // R32 (16 matches) -> EF (8 matches), EF -> QF (4 matches), QF -> SF (2 matches)
  const nextPrefix = sorted.length >= 16 ? 'EF' : sorted.length >= 8 ? 'QF' : 'SF';
  const nextMatches = [];
  for (let i = 0; i < sorted.length; i += 2) {
    const r1 = getWinnerAndLoser(sorted[i]);
    const r2 = getWinnerAndLoser(sorted[i + 1]);
    nextMatches.push({
      stage: 'PLAYOFF',
      roundNumber: nextRound,
      bracketSlot: `${nextPrefix}${i / 2 + 1}`,
      tableNumber: pickTableNumber(i / 2, tablesCount, activeTables),
      team1: r1.winner,
      team2: r2.winner,
    });
  }

  return { done: false, nextMatches };
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
