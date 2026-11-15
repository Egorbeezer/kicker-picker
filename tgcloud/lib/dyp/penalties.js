import {
  OPPONENT_PENALTY,
  PARTNER_PENALTY,
  PARTIAL_BUCKET_PENALTY,
  SAME_BUCKET_PENALTY,
  pairKey,
  shuffleInPlace,
} from './config.js';

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

export function calcTeamBucketPenalty(id1, id2, rolesMap) {
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

export function calcArrangementPenalty(
  order,
  partnerCount,
  opponentCount,
  rolesMap = null,
  useBuckets = false
) {
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

export function pairRemainingPlayers(list, useBuckets, randomFn) {
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
