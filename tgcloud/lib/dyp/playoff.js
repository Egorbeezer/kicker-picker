import { pickTableNumber } from './config.js';

/**
 * Balanced Monster DYP playoff seeding:
 * Top-4  -> 2 teams  -> Final (1+4 vs 2+3)
 * Top-8  -> 4 teams  -> Semifinals: (1+8 vs 4+5) and (2+7 vs 3+6)
 * Top-16 -> 8 teams  -> Quarterfinals: QF1..QF4
 * Top-32 -> 16 teams -> 1/8 Finals: EF1..EF8
 * @param {{ leaderboard: any[]; playoffSize?: number; tablesCount?: number; activeTables?: number[] | null; teamFormat?: string }} params
 */
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

/**
 * @param {{ currentRoundMatches: any[]; thirdPlaceMatch?: boolean; tablesCount?: number; activeTables?: number[] | null }} params
 */
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
