import { describe, it, expect } from 'vitest';
import {
  generateDypRound,
  computeLeaderboard,
  generatePlayoffFirstRound,
  getNextPlayoffMatches,
} from '../tgcloud/lib/dyp.js';

function makePlayers(count, extra = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Игрок ${i + 1}`,
    initials: `P${i + 1}`,
    isActive: true,
    isGuest: false,
    byesCount: 0,
    sortOrder: i + 1,
    ...extra,
  }));
}

describe('Buchholz and Sonneborn-Berger tie-breakers', () => {
  it('computes buchholz, avgBuchholz and sonnebornBerger accurately and sorts by them', () => {
    const players = makePlayers(4);
    // Single 1x1 matches:
    // P1 beats P2 (5:0), P1 loses to P3 (2:5) => P1=2 pts, opponents P2(0) & P3(4) -> BH=4, SB=0
    // P2 loses to P1 (0:5), P2 loses to P4 (1:5) => P2=0 pts
    // P3 beats P1 (5:2), P3 beats P4 (5:3) => P3=4 pts, BH=4, SB=4
    // P4 beats P2 (5:1), P4 loses to P3 (3:5) => P4=2 pts, opponents P2(0) & P3(4) -> BH=4, SB=0
    // Wait let's make P1 beat strong opp and lose to weak, vs P4 beat weak and lose to strong!
    const matches = [
      { id: 1, stage: 'QUALIFICATION', status: 'FINISHED', team1Player1Id: 1, team1Player2Id: null, team2Player1Id: 3, team2Player2Id: null, score1: 5, score2: 2 }, // P1 beats P3 (strong)
      { id: 2, stage: 'QUALIFICATION', status: 'FINISHED', team1Player1Id: 1, team1Player2Id: null, team2Player1Id: 2, team2Player2Id: null, score1: 2, score2: 5 }, // P1 loses to P2 (weak)
      { id: 3, stage: 'QUALIFICATION', status: 'FINISHED', team1Player1Id: 3, team1Player2Id: null, team2Player1Id: 2, team2Player2Id: null, score1: 5, score2: 1 }, // P3 beats P2
      { id: 4, stage: 'QUALIFICATION', status: 'FINISHED', team1Player1Id: 3, team1Player2Id: null, team2Player1Id: 4, team2Player2Id: null, score1: 5, score2: 0 }, // P3 beats P4
      { id: 5, stage: 'QUALIFICATION', status: 'FINISHED', team1Player1Id: 4, team1Player2Id: null, team2Player1Id: 2, team2Player2Id: null, score1: 5, score2: 2 }, // P4 beats P2
    ];
    // Points:
    // P3: 2 wins (beat P2, P4) + lost P1 => 4 pts
    // P1: 1 win (beat P3=4pts), 1 loss (lost to P2=2pts) => 2 pts, BH=6, avgBH=3, SB=4
    // P2: 1 win (beat P1=2pts), 2 losses (P3=4, P4=2) => 2 pts, BH=8, avgBH=2.67, SB=2
    // P4: 1 win (beat P2=2pts), 1 loss (lost P3=4pts) => 2 pts, BH=6, avgBH=3, SB=2
    const lb = computeLeaderboard({
      players,
      matches,
      tableConfig: [
        { key: 'points', sort: true, visible: true },
        { key: 'sonnebornBerger', sort: true, visible: true },
        { key: 'buchholz', sort: true, visible: true },
        { key: 'avgBuchholz', sort: false, visible: true },
      ],
    });

    const p1 = lb.find((r) => r.playerId === 1);
    const p2 = lb.find((r) => r.playerId === 2);
    const p4 = lb.find((r) => r.playerId === 4);

    expect(p1.buchholz).toBe(6);
    expect(p1.avgBuchholz).toBe(3);
    expect(p1.sonnebornBerger).toBe(4);
    expect(p4.buchholz).toBe(6);
    expect(p4.sonnebornBerger).toBe(2);
    expect(p2.buchholz).toBe(8);

    // P3 first (4 pts), then P1 beats P4 & P2 due to SB=4 > SB=2
    expect(lb[0].playerId).toBe(3);
    expect(lb[1].playerId).toBe(1);
  });
});

describe('Additional tournament modes in generateDypRound', () => {
  it('supports random_dyp in both pairs and single formats with fair byes', () => {
    const players = makePlayers(5);
    players[0].byesCount = 1;
    const singleRound = generateDypRound({
      players,
      tablesCount: 2,
      dypMode: 'random_dyp',
      teamFormat: 'single',
    });
    expect(singleRound.pairings).toHaveLength(2);
    expect(singleRound.pairings[0].team1[1]).toBeNull();
    expect(singleRound.byePlayerIds).not.toContain(1);

    const pairsRound = generateDypRound({
      players: makePlayers(8),
      tablesCount: 2,
      dypMode: 'random_dyp',
      teamFormat: 'pairs',
    });
    expect(pairsRound.pairings).toHaveLength(2);
    expect(pairsRound.byePlayerIds).toHaveLength(0);
  });

  it('supports swiss 1x1 pairing leaders together without rematches', () => {
    const players = makePlayers(4);
    const r1Matches = [
      { id: 1, stage: 'QUALIFICATION', status: 'FINISHED', team1Player1Id: 1, team2Player1Id: 2, score1: 5, score2: 1 },
      { id: 2, stage: 'QUALIFICATION', status: 'FINISHED', team1Player1Id: 3, team2Player1Id: 4, score1: 5, score2: 2 },
    ];
    // Winners: 1 & 3 (2 pts), Losers: 2 & 4 (0 pts)
    const r2 = generateDypRound({
      players,
      previousMatches: r1Matches,
      tablesCount: 2,
      dypMode: 'swiss',
      teamFormat: 'single',
    });
    expect(r2.pairings).toHaveLength(2);
    const pairSets = r2.pairings.map((p) => new Set([p.team1[0], p.team2[0]]));
    expect(pairSets.some((s) => s.has(1) && s.has(3))).toBe(true);
    expect(pairSets.some((s) => s.has(2) && s.has(4))).toBe(true);
  });

  it('supports swiss 2x2 mode cleanly', () => {
    const players = makePlayers(8);
    const r1 = generateDypRound({
      players,
      tablesCount: 2,
      dypMode: 'swiss',
      teamFormat: 'pairs',
    });
    expect(r1.pairings).toHaveLength(2);
    const allIds = r1.pairings.flatMap((p) => [...p.team1, ...p.team2]);
    expect(new Set(allIds).size).toBe(8);
  });

  it('supports round_robin for 1x1 (single) with 1 and 2 loops and detects completion', () => {
    const players = makePlayers(4);
    const seenPairs = new Set();
    for (let r = 1; r <= 3; r++) {
      const res = generateDypRound({
        players,
        tablesCount: 2,
        dypMode: 'round_robin',
        teamFormat: 'single',
        roundRobinLoops: 1,
        roundNumber: r,
      });
      expect(res.done).toBe(false);
      expect(res.pairings).toHaveLength(2);
      for (const m of res.pairings) {
        const key = [m.team1[0], m.team2[0]].sort((a, b) => a - b).join('-');
        seenPairs.add(key);
      }
    }
    expect(seenPairs.size).toBe(6); // C(4,2) = 6 unique matches

    const r4 = generateDypRound({
      players,
      tablesCount: 2,
      dypMode: 'round_robin',
      teamFormat: 'single',
      roundRobinLoops: 1,
      roundNumber: 4,
    });
    expect(r4.done).toBe(true);

    // 2nd loop with roundRobinLoops = 2 should continue for rounds 4..6
    const loop2r4 = generateDypRound({
      players,
      tablesCount: 2,
      dypMode: 'round_robin',
      teamFormat: 'single',
      roundRobinLoops: 2,
      roundNumber: 4,
    });
    expect(loop2r4.done).toBe(false);
    expect(loop2r4.pairings).toHaveLength(2);
  });

  it('supports round_robin for fixed pairs (8 players -> 4 teams -> 3 rounds)', () => {
    const players = makePlayers(8);
    const r1 = generateDypRound({
      players,
      tablesCount: 2,
      dypMode: 'round_robin',
      teamFormat: 'pairs',
      roundRobinLoops: 1,
      roundNumber: 1,
      preserveOrder: true,
    });
    expect(r1.done).toBe(false);
    expect(r1.pairings).toHaveLength(2);
    const r4 = generateDypRound({
      players,
      tablesCount: 2,
      dypMode: 'round_robin',
      teamFormat: 'pairs',
      roundRobinLoops: 1,
      roundNumber: 4,
    });
    expect(r4.done).toBe(true);
  });

  it('supports whist mode minimizing partner repeats across 3 rounds of 8 players', () => {
    const players = makePlayers(8);
    const prev = [];
    for (let r = 1; r <= 3; r++) {
      const round = generateDypRound({
        players,
        previousMatches: prev,
        tablesCount: 2,
        dypMode: 'whist',
        teamFormat: 'pairs',
      });
      expect(round.penalty).toBe(0);
      round.pairings.forEach((p, idx) => {
        prev.push({
          id: prev.length + idx + 1,
          stage: 'QUALIFICATION',
          status: 'FINISHED',
          team1Player1Id: p.team1[0],
          team1Player2Id: p.team1[1],
          team2Player1Id: p.team2[0],
          team2Player2Id: p.team2[1],
          score1: 5,
          score2: 2,
        });
      });
    }
  });

  it('supports last_one_standing eliminating 0-life players and collapsing to 1x1 finale', () => {
    const players = makePlayers(4, { livesLeft: 1 });
    players[0].livesLeft = 0;
    players[1].livesLeft = 0;
    // 2 alive survivors -> automatic 1x1 duel
    const duel = generateDypRound({
      players,
      tablesCount: 2,
      dypMode: 'last_one_standing',
      teamFormat: 'pairs',
    });
    expect(duel.done).toBeUndefined();
    expect(duel.pairings).toHaveLength(1);
    expect([duel.pairings[0].team1[0], duel.pairings[0].team2[0]].sort((a, b) => a - b)).toEqual([
      3,
      4,
    ]);
    expect(duel.pairings[0].team1[1]).toBeNull();
    expect(duel.pairings[0].team2[1]).toBeNull();

    // Only 1 survivor -> tournament done
    players[2].livesLeft = 0;
    const finished = generateDypRound({
      players,
      tablesCount: 2,
      dypMode: 'last_one_standing',
      teamFormat: 'pairs',
    });
    expect(finished.done).toBe(true);
  });
});

describe('Singles playoff seeding & bracket progression', () => {
  it('supports single-player playoffs (Top-4 and Top-16 -> Final)', () => {
    const lb = makePlayers(16).map((p, i) => ({ playerId: p.id, rank: i + 1 }));
    const ef = generatePlayoffFirstRound({
      leaderboard: lb,
      playoffSize: 16,
      tablesCount: 2,
      teamFormat: 'single',
    });
    expect(ef).toHaveLength(8);
    expect(ef[0].team1[1]).toBeNull();
    expect(ef[0].bracketSlot).toBe('EF1');

    const qfInput = ef.map((m, i) => ({
      ...m,
      id: i + 1,
      status: 'FINISHED',
      team1Player1Id: m.team1[0],
      team1Player2Id: null,
      team2Player1Id: m.team2[0],
      team2Player2Id: null,
      score1: 5,
      score2: 2,
      setsWon1: 1,
      setsWon2: 0,
    }));
    const qf = getNextPlayoffMatches({ currentRoundMatches: qfInput, tablesCount: 2 });
    expect(qf.nextMatches).toHaveLength(4);
    expect(qf.nextMatches[0].bracketSlot).toBe('QF1');
    expect(qf.nextMatches[0].team1).toHaveLength(1);
  });
});
