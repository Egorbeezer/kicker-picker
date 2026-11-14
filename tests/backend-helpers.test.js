import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMessageSpy = vi.fn().mockResolvedValue({ message_id: 777 });
const dbUpdateWhereSpy = vi.fn(() => {
  const p = Promise.resolve({});
  return Object.assign(p, { returning: vi.fn().mockResolvedValue([{ id: 1 }]) });
});
const dbUpdateSetSpy = vi.fn(() => ({ where: dbUpdateWhereSpy }));
const dbUpdateSpy = vi.fn(() => ({ set: dbUpdateSetSpy }));

vi.mock('sdk', () => ({
  db: { update: dbUpdateSpy },
  api: { sendMessage: sendMessageSpy },
  EndpointError: class EndpointError extends Error {
    constructor(msg, opts) {
      super(msg);
      this.parameters = opts;
    }
  },
}));

vi.mock('sdk/db', () => {
  const col = () => {
    const chain = {
      primaryKey: () => chain,
      unique: () => chain,
      notNull: () => chain,
      default: () => chain,
    };
    return chain;
  };
  return {
    table: vi.fn((name, cols) => cols),
    integer: vi.fn(col),
    text: vi.fn(col),
    boolean: vi.fn(col),
    json: vi.fn(col),
    index: vi.fn(() => ({ on: vi.fn() })),
    uniqueIndex: vi.fn(() => ({ on: vi.fn() })),
    eq: vi.fn((a, b) => ({ a, b })),
    and: vi.fn((...args) => args),
    desc: vi.fn((a) => a),
    inArray: vi.fn((a, b) => ({ a, b })),
    isNotNull: vi.fn((a) => a),
    sql: vi.fn((s) => s),
  };
});

const {
  isTournamentAdmin,
  sanitizeTournament,
  buildGlobalPlayerProfile,
  checkAndSendLongMatchReminders,
} = await import('../tgcloud/lib/helpers.js');

describe('isTournamentAdmin and sanitizeTournament', () => {
  it('recognizes creator and co-admins cleanly', () => {
    const t = { creatorTgId: 100, coAdminTgIds: [200, 300] };
    expect(isTournamentAdmin(t, 100)).toBe(true);
    expect(isTournamentAdmin(t, 200)).toBe(true);
    expect(isTournamentAdmin(t, 300)).toBe(true);
    expect(isTournamentAdmin(t, 999)).toBe(false);
  });

  it('sanitizes all new tournament modes and numeric bounds', () => {
    const clean = sanitizeTournament({
      id: 1,
      creatorTgId: 100,
      coAdminTgIds: [100, 200, 200, -5],
      dypMode: 'round_robin',
      teamFormat: 'single',
      roundRobinLoops: 5,
      losLives: 0,
      longMatchAlertMin: 20,
      scoreReminderMin: 4,
      tablesCount: 3,
      disabledTables: [2, 9],
      publicToken: 'secret',
    });
    expect(clean.publicToken).toBeUndefined();
    expect(clean.coAdminTgIds).toEqual([200]);
    expect(clean.dypMode).toBe('round_robin');
    expect(clean.teamFormat).toBe('single');
    expect(clean.roundRobinLoops).toBe(2);
    expect(clean.losLives).toBe(3); // 0 falls back cleanly to default 3
    expect(clean.longMatchAlertMin).toBe(20);
    expect(clean.scoreReminderMin).toBe(4);
    expect(clean.disabledTables).toEqual([2]);
  });
});

describe('buildGlobalPlayerProfile', () => {
  it('computes partner stats, toughest opponent, timeline in ДД.ММ.ГГГГ, and club badges', () => {
    const callerTgId = 1001;
    const myTournaments = [
      {
        id: 1,
        name: 'Кубок 1',
        status: 'FINISHED',
        finishedAt: new Date(2026, 9, 10).getTime(),
      },
      {
        id: 2,
        name: 'Кубок 2',
        status: 'FINISHED',
        finishedAt: new Date(2026, 9, 17).getTime(),
      },
      {
        id: 3,
        name: 'Кубок 3',
        status: 'FINISHED',
        finishedAt: new Date(2026, 9, 24).getTime(),
      },
    ];

    const allPlayers = [
      // T1
      { id: 1, tournamentId: 1, tgId: 1001, name: 'Егор', initials: 'ЕГ', isActive: true },
      { id: 2, tournamentId: 1, tgId: 1002, name: 'Макс', initials: 'МА', isActive: true },
      { id: 3, tournamentId: 1, tgId: 1003, name: 'Влад', initials: 'ВЛ', isActive: true },
      { id: 4, tournamentId: 1, tgId: 1004, name: 'Илья', initials: 'ИЛ', isActive: true },
      // T2
      { id: 11, tournamentId: 2, tgId: 1001, name: 'Егор', initials: 'ЕГ', isActive: true },
      { id: 12, tournamentId: 2, tgId: 1002, name: 'Макс', initials: 'МА', isActive: true },
      { id: 13, tournamentId: 2, tgId: 1003, name: 'Влад', initials: 'ВЛ', isActive: true },
      { id: 14, tournamentId: 2, tgId: 1005, name: 'Олег', initials: 'ОЛ', isActive: true },
      // T3
      { id: 21, tournamentId: 3, tgId: 1001, name: 'Егор', initials: 'ЕГ', isActive: true },
      { id: 22, tournamentId: 3, tgId: 1005, name: 'Олег', initials: 'ОЛ', isActive: true },
      { id: 23, tournamentId: 3, tgId: 1003, name: 'Влад', initials: 'ВЛ', isActive: true },
      { id: 24, tournamentId: 3, tgId: 1004, name: 'Илья', initials: 'ИЛ', isActive: true },
    ];

    const allMatches = [
      // T1: Егор + Макс beat Влад + Илья twice, + won final after comeback
      { id: 101, tournamentId: 1, stage: 'QUALIFICATION', status: 'FINISHED', team1Player1Id: 1, team1Player2Id: 2, team2Player1Id: 3, team2Player2Id: 4, score1: 5, score2: 0 },
      { id: 102, tournamentId: 1, stage: 'QUALIFICATION', status: 'FINISHED', team1Player1Id: 1, team1Player2Id: 2, team2Player1Id: 3, team2Player2Id: 4, score1: 5, score2: 0 },
      {
        id: 103,
        tournamentId: 1,
        stage: 'PLAYOFF',
        bracketSlot: 'FINAL',
        status: 'FINISHED',
        team1Player1Id: 1,
        team1Player2Id: 2,
        team2Player1Id: 3,
        team2Player2Id: 4,
        score1: 5,
        score2: 3,
        setsWon1: 2,
        setsWon2: 1,
        setsHistory: [
          { score1: 3, score2: 5 },
          { score1: 5, score2: 2 },
          { score1: 5, score2: 3 },
        ],
      },
      // T2: Егор + Макс lose to Влад + Олег
      { id: 201, tournamentId: 2, stage: 'QUALIFICATION', status: 'FINISHED', team1Player1Id: 11, team1Player2Id: 12, team2Player1Id: 13, team2Player2Id: 14, score1: 2, score2: 5 },
      { id: 202, tournamentId: 2, stage: 'QUALIFICATION', status: 'FINISHED', team1Player1Id: 11, team1Player2Id: 12, team2Player1Id: 13, team2Player2Id: 14, score1: 3, score2: 5 },
      // T3: Егор + Олег lose to Влад + Илья
      { id: 301, tournamentId: 3, stage: 'QUALIFICATION', status: 'FINISHED', team1Player1Id: 21, team1Player2Id: 22, team2Player1Id: 23, team2Player2Id: 24, score1: 1, score2: 5 },
    ];

    const profile = buildGlobalPlayerProfile({ callerTgId, myTournaments, allPlayers, allMatches });

    expect(profile.tournamentsPlayed).toBe(3);
    expect(profile.championCount).toBe(1);
    expect(profile.mostFrequentPartner?.name).toBe('Макс');
    expect(profile.mostFrequentPartner?.games).toBe(5);
    expect(profile.bestPartner?.name).toBe('Макс');
    expect(profile.toughestOpponent?.name).toBe('Олег'); // 2/2 losses (100% loss rate) vs Влад (3/6 = 50%)
    expect(profile.timeline.map((x) => x.dateLabel)).toEqual(['10.10.2026', '17.10.2026', '24.10.2026']);

    const badgeIds = profile.badges.map((b) => b.id);
    expect(badgeIds).toContain('champion');
    expect(badgeIds).toContain('qual_king');
    expect(badgeIds).toContain('comeback');
    expect(badgeIds).toContain('sniper');
    expect(badgeIds).toContain('veteran');
  });
});

describe('checkAndSendLongMatchReminders', () => {
  beforeEach(() => {
    sendMessageSpy.mockClear();
    dbUpdateWhereSpy.mockClear();
  });

  it('sends long-match alert at >=15 min and score reminder +3 min later', async () => {
    const now = 1_800_000_000_000;
    const tournament = {
      id: 42,
      name: 'Вечерний DYP',
      status: 'QUALIFICATION',
      creatorTgId: 500,
      coAdminTgIds: [501],
      longMatchAlertMin: 15,
      scoreReminderMin: 3,
    };
    const players = [
      { id: 1, tgId: 101, name: 'A' },
      { id: 2, tgId: 102, name: 'B' },
    ];

    const matchStage0 = {
      id: 90,
      status: 'PLAYING',
      tableNumber: 1,
      team1Player1Id: 1,
      team2Player1Id: 2,
      startedAt: new Date(now - 16 * 60000),
      reminderStage: 0,
      lastReminderAt: null,
    };

    const count1 = await checkAndSendLongMatchReminders({
      tournament,
      players,
      allMatches: [matchStage0],
      nowMs: now,
    });
    expect(count1).toBe(1);
    // 2 players + creator + coAdmin = 4 messages
    expect(sendMessageSpy).toHaveBeenCalledTimes(4);
    expect(sendMessageSpy.mock.calls[0][0].text).toContain('Долгий матч');

    sendMessageSpy.mockClear();
    // 3+ minutes after stage 1 -> stage 2 score reminder
    const matchStage1 = {
      ...matchStage0,
      reminderStage: 1,
      lastReminderAt: new Date(now - 4 * 60000),
    };
    const count2 = await checkAndSendLongMatchReminders({
      tournament,
      players,
      allMatches: [matchStage1],
      nowMs: now,
    });
    expect(count2).toBe(1);
    expect(sendMessageSpy.mock.calls[0][0].text).toContain('Напоминание: внесите счёт');
  });
});
