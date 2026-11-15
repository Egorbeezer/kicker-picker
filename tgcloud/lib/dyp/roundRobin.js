import { pairRemainingPlayers } from './penalties.js';

export function buildRoundRobinPairings(units, roundNumber, totalLoops) {
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

export function generateRoundRobinRound({
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
