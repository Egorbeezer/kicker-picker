import { describe, it, expect } from 'vitest';
import {
  validateMatchScore,
  generateDypRound,
  computeLeaderboard,
  computeTournamentTimings,
  generatePlayoffFirstRound,
  getNextPlayoffMatches,
} from '../tgcloud/lib/dyp.js';

describe('validateMatchScore', () => {
  it('validates standard targetScore=5 without winByTwo', () => {
    expect(validateMatchScore(5, 3, { targetScore: 5, winByTwo: false }).valid).toBe(true);
    expect(validateMatchScore(5, 4, { targetScore: 5, winByTwo: false }).valid).toBe(true);
    expect(validateMatchScore(6, 4, { targetScore: 5, winByTwo: false }).valid).toBe(false);
    expect(validateMatchScore(4, 3, { targetScore: 5, winByTwo: false }).valid).toBe(false);
    expect(validateMatchScore(5, 5, { targetScore: 5, winByTwo: false }).valid).toBe(false);
  });

  it('validates winByTwo (deuce) with maxScore=7', () => {
    const rules = { targetScore: 5, winByTwo: true, maxScore: 7 };
    expect(validateMatchScore(5, 3, rules).valid).toBe(true);
    expect(validateMatchScore(5, 4, rules).valid).toBe(false);
    expect(validateMatchScore(6, 4, rules).valid).toBe(true);
    expect(validateMatchScore(6, 5, rules).valid).toBe(false);
    expect(validateMatchScore(7, 6, rules).valid).toBe(true); // hard cap reached
    expect(validateMatchScore(8, 6, rules).valid).toBe(false);
  });
});

describe('generateDypRound', () => {
  it('avoids repeating partners when possible and distributes byes fairly', () => {
    const players = Array.from({ length: 9 }, (_, i) => ({
      id: i + 1,
      name: `P${i + 1}`,
      isActive: true,
      byesCount: i === 0 ? 1 : 0, // player 1 already rested once
    }));

    const round1 = generateDypRound({
      players,
      previousMatches: [],
      tablesCount: 2,
    });

    expect(round1.pairings).toHaveLength(2);
    expect(round1.byePlayerIds).toHaveLength(1);
    // Player 1 had byesCount=1 so should NOT be resting again
    expect(round1.byePlayerIds).not.toContain(1);
    expect(round1.penalty).toBe(0);

    // Record round 1 as previous matches and generate round 2
    const prevMatches = round1.pairings.map((p, idx) => ({
      id: idx + 1,
      stage: 'QUALIFICATION',
      team1Player1Id: p.team1[0],
      team1Player2Id: p.team1[1],
      team2Player1Id: p.team2[0],
      team2Player2Id: p.team2[1],
    }));

    const round2 = generateDypRound({
      players: players.map((p) => ({
        ...p,
        byesCount: round1.byePlayerIds.includes(p.id) ? p.byesCount + 1 : p.byesCount,
      })),
      previousMatches: prevMatches,
      tablesCount: 2,
    });

    expect(round2.pairings).toHaveLength(2);
    // With 9 players across 2 tables, round 2 should have low or zero partner repeats
    expect(round2.penalty).toBeLessThan(1000);
  });
});

describe('computeLeaderboard & Playoff', () => {
  it('computes points, GD, PPM and seeds Top-4 / Top-8', () => {
    const players = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({
      id,
      name: `Player ${id}`,
      initials: `P${id}`,
      isActive: true,
      isGuest: false,
      byesCount: 0,
    }));

    const matches = [
      {
        id: 1,
        stage: 'QUALIFICATION',
        status: 'FINISHED',
        team1Player1Id: 1,
        team1Player2Id: 2,
        team2Player1Id: 3,
        team2Player2Id: 4,
        score1: 5,
        score2: 1,
      },
      {
        id: 2,
        stage: 'QUALIFICATION',
        status: 'FINISHED',
        team1Player1Id: 5,
        team1Player2Id: 6,
        team2Player1Id: 7,
        team2Player2Id: 8,
        score1: 5,
        score2: 4,
      },
    ];

    const lb = computeLeaderboard({ players, matches });
    expect(lb[0].points).toBe(2);
    expect(lb[0].diff).toBe(4);
    expect([1, 2]).toContain(lb[0].playerId);

    const sf = generatePlayoffFirstRound({ leaderboard: lb, playoffSize: 8, tablesCount: 2 });
    expect(sf).toHaveLength(2);
    expect(sf[0].bracketSlot).toBe('SF1');
    expect(sf[1].bracketSlot).toBe('SF2');

    // Finish SFs and advance to Final + 3rd place
    const finishedSf = sf.map((m, i) => ({
      ...m,
      team1Player1Id: m.team1[0],
      team1Player2Id: m.team1[1],
      team2Player1Id: m.team2[0],
      team2Player2Id: m.team2[1],
      status: 'FINISHED',
      score1: 5,
      score2: 2,
      setsWon1: 1,
      setsWon2: 0,
      roundNumber: 1,
    }));

    const next = getNextPlayoffMatches({
      currentRoundMatches: finishedSf,
      thirdPlaceMatch: true,
      tablesCount: 2,
    });
    expect(next.done).toBe(false);
    expect(next.nextMatches.map((m) => m.bracketSlot)).toEqual(['FINAL', 'THIRD_PLACE']);
  });

  it('uses default sort priority: wins -> ppm -> diff -> games', () => {
    const players = [1, 2, 3, 4].map((id) => ({
      id,
      name: `P${id}`,
      initials: `P${id}`,
      isActive: true,
      isGuest: false,
      byesCount: 0,
    }));
    // P1 & P2 play 1 game and win 5:0 (wins=1, ppm=2, diff=+5, games=1)
    // P3 & P4 play 2 games: win 5:0 and lose 0:5 (wins=1, ppm=1, diff=0, games=2)
    // P1/P2 must rank above P3/P4 on PPM after tying on wins
    const matches = [
      {
        id: 1,
        stage: 'QUALIFICATION',
        status: 'FINISHED',
        team1Player1Id: 1,
        team1Player2Id: 2,
        team2Player1Id: 3,
        team2Player2Id: 4,
        score1: 5,
        score2: 0,
      },
      {
        id: 2,
        stage: 'QUALIFICATION',
        status: 'FINISHED',
        team1Player1Id: 3,
        team1Player2Id: 4,
        team2Player1Id: 99,
        team2Player2Id: 98,
        score1: 5,
        score2: 0,
      },
    ];
    const lb = computeLeaderboard({ players, matches });
    expect(lb.map((r) => r.playerId)).toEqual([1, 2, 3, 4]);
    expect(lb[0].wins).toBe(1);
    expect(lb[0].ppm).toBe(2);
    expect(lb[2].ppm).toBe(1);
  });

  it('seeds Top-32 (1/8 finals) and advances EF -> QF -> SF -> FINAL', () => {
    const lb = Array.from({ length: 32 }, (_, i) => ({
      playerId: i + 1,
      rank: i + 1,
    }));

    const ef = generatePlayoffFirstRound({ leaderboard: lb, playoffSize: 32, tablesCount: 4 });
    expect(ef).toHaveLength(8);
    expect(ef.map((m) => m.bracketSlot)).toEqual([
      'EF1',
      'EF2',
      'EF3',
      'EF4',
      'EF5',
      'EF6',
      'EF7',
      'EF8',
    ]);

    const finishedEf = ef.map((m) => ({
      ...m,
      team1Player1Id: m.team1[0],
      team1Player2Id: m.team1[1],
      team2Player1Id: m.team2[0],
      team2Player2Id: m.team2[1],
      status: 'FINISHED',
      score1: 5,
      score2: 2,
      setsWon1: 2,
      setsWon2: 0,
      roundNumber: 1,
    }));

    const qfStep = getNextPlayoffMatches({
      currentRoundMatches: finishedEf,
      thirdPlaceMatch: true,
      tablesCount: 4,
    });
    expect(qfStep.done).toBe(false);
    expect(qfStep.nextMatches.map((m) => m.bracketSlot)).toEqual(['QF1', 'QF2', 'QF3', 'QF4']);
  });
});

describe('DYP formats, buckets, activeTables & extended stats', () => {
  it('prefers A+B pairs when useBuckets=true in Monster DYP', () => {
    const players = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({
      id,
      name: `P${id}`,
      isActive: true,
      byesCount: 0,
      dypRole: id <= 4 ? 'A' : 'B',
    }));

    const round = generateDypRound({
      players,
      previousMatches: [],
      tablesCount: 2,
      dypMode: 'monster',
      useBuckets: true,
    });

    expect(round.pairings).toHaveLength(2);
    const roleMap = new Map(players.map((p) => [p.id, p.dypRole]));
    for (const m of round.pairings) {
      expect(new Set(m.team1.map((id) => roleMap.get(id)))).toEqual(new Set(['A', 'B']));
      expect(new Set(m.team2.map((id) => roleMap.get(id)))).toEqual(new Set(['A', 'B']));
    }
  });

  it('keeps Round 1 pairs fixed across rounds in Classic DYP', () => {
    const players = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({
      id,
      name: `P${id}`,
      isActive: true,
      byesCount: 0,
      dypRole: null,
    }));

    const round1Matches = [
      {
        id: 1,
        stage: 'QUALIFICATION',
        roundNumber: 1,
        status: 'FINISHED',
        team1Player1Id: 1,
        team1Player2Id: 2,
        team2Player1Id: 3,
        team2Player2Id: 4,
        score1: 5,
        score2: 2,
      },
      {
        id: 2,
        stage: 'QUALIFICATION',
        roundNumber: 1,
        status: 'FINISHED',
        team1Player1Id: 5,
        team1Player2Id: 6,
        team2Player1Id: 7,
        team2Player2Id: 8,
        score1: 5,
        score2: 3,
      },
    ];

    const round2 = generateDypRound({
      players,
      previousMatches: round1Matches,
      tablesCount: 2,
      dypMode: 'classic',
    });

    expect(round2.pairings).toHaveLength(2);
    const key = (t) => [...t].sort((a, b) => a - b).join('-');
    const round2Teams = new Set(round2.pairings.flatMap((m) => [key(m.team1), key(m.team2)]));
    expect(round2Teams).toEqual(new Set(['1-2', '3-4', '5-6', '7-8']));
  });

  it('assigns matches only to activeTables in qualification and playoff', () => {
    const players = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({
      id,
      name: `P${id}`,
      isActive: true,
      byesCount: 0,
    }));

    const qual = generateDypRound({
      players,
      previousMatches: [],
      tablesCount: 3,
      activeTables: [1, 3],
    });
    expect(qual.pairings.map((p) => p.tableNumber)).toEqual([1, 3]);

    const lb = players.map((p, idx) => ({ playerId: p.id, rank: idx + 1 }));
    const po = generatePlayoffFirstRound({
      leaderboard: lb,
      playoffSize: 8,
      tablesCount: 3,
      activeTables: [1, 3],
    });
    expect(po.map((p) => p.tableNumber)).toEqual([1, 3]);
  });

  it('ignores CANCELLED matches and calculates fairPpm, losses, winRate', () => {
    const players = [1, 2, 3, 4].map((id) => ({
      id,
      name: `P${id}`,
      initials: `P${id}`,
      isActive: true,
      isGuest: false,
      byesCount: 0,
    }));

    const matches = [
      {
        id: 1,
        stage: 'QUALIFICATION',
        status: 'FINISHED',
        team1Player1Id: 1,
        team1Player2Id: 2,
        team2Player1Id: 3,
        team2Player2Id: 4,
        score1: 5,
        score2: 2,
      },
      {
        id: 2,
        stage: 'QUALIFICATION',
        status: 'FINISHED',
        team1Player1Id: 1,
        team1Player2Id: 3,
        team2Player1Id: 99,
        team2Player2Id: 98,
        score1: 5,
        score2: 1,
      },
      {
        id: 3,
        stage: 'QUALIFICATION',
        status: 'CANCELLED',
        team1Player1Id: 2,
        team1Player2Id: 4,
        team2Player1Id: 99,
        team2Player2Id: 98,
        score1: 0,
        score2: 5,
      },
    ];

    const lb = computeLeaderboard({ players, matches });
    const p1 = lb.find((r) => r.playerId === 1);
    const p2 = lb.find((r) => r.playerId === 2);

    expect(p1.games).toBe(2);
    expect(p1.wins).toBe(2);
    expect(p1.losses).toBe(0);
    expect(p1.winRate).toBe(100);
    expect(p1.fairPpm).toBe(2);
    expect(p1.isBelowGameThreshold).toBe(false);

    // P2 has 1 game (cancelled match ignored) while maxGames=2 -> threshold=ceil(1.5)=2 -> fairPpm = 2/2 = 1
    expect(p2.games).toBe(1);
    expect(p2.losses).toBe(0);
    expect(p2.isBelowGameThreshold).toBe(true);
    expect(p2.fairPpm).toBe(1);
  });

  it('computes live tournament timings cleanly', () => {
    const t0 = 1_700_000_000_000;
    const timings = computeTournamentTimings({
      tournament: { status: 'QUALIFICATION', tablesCount: 2, startedAt: t0 },
      matches: [
        { id: 1, status: 'FINISHED', createdAt: t0, finishedAt: t0 + 240_000 },
        { id: 2, status: 'FINISHED', createdAt: t0, finishedAt: t0 + 360_000 },
        { id: 3, status: 'PLAYING', createdAt: t0 + 360_000, finishedAt: null },
        { id: 4, status: 'CANCELLED', createdAt: t0, finishedAt: t0 + 10_000 },
      ],
      activeTablesCount: 2,
      nowMs: t0 + 600_000,
    });

    expect(timings.playedCount).toBe(2);
    expect(timings.openCount).toBe(1);
    expect(timings.totalCount).toBe(3);
    expect(timings.progressPercent).toBe(67);
    expect(timings.avgMatchSeconds).toBe(300);
    expect(timings.avgMatchMinutes).toBe(5);
    expect(timings.elapsedMinutes).toBe(10);
    expect(timings.remainingMinutes).toBe(5);
    expect(timings.estimatedEndAt).toBe(t0 + 900_000);
  });

  it('skips absent (isActive: false) players in playoff seeding and promotes #9/#10 into top-8', () => {
    const leaderboard = Array.from({ length: 12 }, (_, idx) => ({
      playerId: idx + 1,
      rank: idx + 1,
      isActive: idx + 1 !== 5 && idx + 1 !== 7,
    }));

    const matches = generatePlayoffFirstRound({
      leaderboard,
      playoffSize: 8,
      tablesCount: 2,
      teamFormat: 'pairs',
    });

    const seededIds = matches.flatMap((m) => [...m.team1, ...m.team2]);
    expect(seededIds).toHaveLength(8);
    expect(seededIds).not.toContain(5);
    expect(seededIds).not.toContain(7);
    expect(new Set(seededIds)).toEqual(new Set([1, 2, 3, 4, 6, 8, 9, 10]));

    // With rank 5 absent and everyone else present -> takes 1..4 and 6..9 (8 players)
    const oneAbsentBoard = Array.from({ length: 10 }, (_, idx) => ({
      playerId: idx + 1,
      rank: idx + 1,
      isActive: idx + 1 !== 5,
    }));
    const oneAbsentMatches = generatePlayoffFirstRound({
      leaderboard: oneAbsentBoard,
      playoffSize: 8,
      tablesCount: 2,
      teamFormat: 'pairs',
    });
    const oneAbsentIds = oneAbsentMatches.flatMap((m) => [...m.team1, ...m.team2]);
    expect(oneAbsentIds).not.toContain(5);
    expect(oneAbsentIds).toContain(9);
    expect(new Set(oneAbsentIds)).toEqual(new Set([1, 2, 3, 4, 6, 7, 8, 9]));

    // Single format also skips absent ranked players
    const singleMatches = generatePlayoffFirstRound({
      leaderboard: [
        { playerId: 1, rank: 1, isActive: true },
        { playerId: 2, rank: 2, isActive: false },
        { playerId: 3, rank: 3, isActive: true },
        { playerId: 4, rank: 4, isActive: true },
        { playerId: 5, rank: 5, isActive: true },
      ],
      playoffSize: 4,
      tablesCount: 2,
      teamFormat: 'single',
    });
    const singleIds = singleMatches.flatMap((m) => [...m.team1, ...m.team2]).filter(Boolean);
    expect(new Set(singleIds)).toEqual(new Set([1, 3, 4, 5]));

    expect(() =>
      generatePlayoffFirstRound({
        leaderboard: [
          { playerId: 1, rank: 1, isActive: true },
          { playerId: 2, rank: 2, isActive: false },
          { playerId: 3, rank: 3, isActive: true },
          { playerId: 4, rank: 4, isActive: true },
        ],
        playoffSize: 4,
        tablesCount: 1,
        teamFormat: 'pairs',
      })
    ).toThrow(/минимум 4 присутствующих/);
  });
});
