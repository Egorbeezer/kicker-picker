import { db } from 'sdk';
import { eq, desc, inArray } from 'sdk/db';
import { users, tournaments, tournamentPlayers, matches } from '../../schema.js';
import { computeLeaderboard, computeTournamentTimings } from '../dyp.js';
import { getActiveTablesList, isTournamentAdmin, sanitizeTournament } from './access.js';

export async function getTournamentSnapshot(tournamentId, callerTgId) {
  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();
  if (!tournament) return null;

  const players = (
    await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournamentId))
      .all()
  ).sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id));

  const allMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId))
    .orderBy(desc(matches.id))
    .all();

  const playersById = new Map(players.map((p) => [p.id, p]));
  const tgIds = [...new Set(players.map((p) => p.tgId).filter(Boolean))];
  const userRows = tgIds.length
    ? await db
        .select({ tgId: users.tgId, photoUrl: users.photoUrl })
        .from(users)
        .where(inArray(users.tgId, tgIds))
        .all()
    : [];
  const avatarByTgId = new Map(
    userRows.map((u) => [u.tgId, u.photoUrl && u.photoUrl.length > 0 ? u.photoUrl : null])
  );
  const getAvatar = (p) => (p?.tgId ? avatarByTgId.get(p.tgId) || null : null);

  const myPlayer = players.find((p) => p.tgId === callerTgId) || null;
  const leaderboard = computeLeaderboard({
    players,
    matches: allMatches,
    tableConfig: tournament.tableConfig,
  }).map((row) => ({
    ...row,
    avatarUrl: row.tgId ? avatarByTgId.get(row.tgId) || null : null,
  }));

  const enrichMatch = (m) => {
    const t1 = [playersById.get(m.team1Player1Id), playersById.get(m.team1Player2Id)].filter(Boolean);
    const t2 = [playersById.get(m.team2Player1Id), playersById.get(m.team2Player2Id)].filter(Boolean);
    const myTeam = myPlayer
      ? t1.some((p) => p.id === myPlayer.id)
        ? 1
        : t2.some((p) => p.id === myPlayer.id)
          ? 2
          : null
      : null;

    return {
      ...m,
      team1Players: t1.map((p) => ({
        id: p.id,
        name: p.name,
        initials: p.initials,
        isGuest: p.isGuest,
        avatarUrl: getAvatar(p),
      })),
      team2Players: t2.map((p) => ({
        id: p.id,
        name: p.name,
        initials: p.initials,
        isGuest: p.isGuest,
        avatarUrl: getAvatar(p),
      })),
      team1Label: t1.map((p) => p.name).join(' & '),
      team2Label: t2.map((p) => p.name).join(' & '),
      myTeam,
    };
  };

  const enrichedMatches = allMatches.map(enrichMatch);

  const currentStage = tournament.status === 'PLAYOFF' ? 'PLAYOFF' : 'QUALIFICATION';
  const currentRoundMatches = enrichedMatches
    .filter((m) => m.stage === currentStage && m.roundNumber === tournament.currentRound)
    .sort((a, b) => a.tableNumber - b.tableNumber);

  const myCurrentMatch =
    myPlayer
      ? enrichedMatches.find(
          (m) => m.myTeam !== null && m.status !== 'FINISHED' && m.status !== 'CANCELLED'
        ) || null
      : null;

  const myHistory = myPlayer
    ? enrichedMatches.filter((m) => m.myTeam !== null && m.status === 'FINISHED')
    : [];

  const activeTables = getActiveTablesList(tournament);
  const timings = computeTournamentTimings({
    tournament,
    matches: allMatches,
    activeTablesCount: activeTables.length,
  });

  return {
    tournament: sanitizeTournament(tournament),
    isAdmin: isTournamentAdmin(tournament, callerTgId),
    isCreator: Number(tournament.creatorTgId) === Number(callerTgId),
    myPlayerId: myPlayer?.id || null,
    players: players.map((p) => ({
      ...p,
      avatarUrl: getAvatar(p),
      points: leaderboard.find((l) => l.playerId === p.id)?.points || 0,
    })),
    leaderboard,
    timings,
    currentRoundMatches,
    playoffMatches: enrichedMatches.filter((m) => m.stage === 'PLAYOFF'),
    myCurrentMatch,
    myHistory,
  };
}

function formatDateRuShort(epochOrDate) {
  const d =
    epochOrDate instanceof Date
      ? epochOrDate
      : typeof epochOrDate === 'number'
        ? new Date(epochOrDate < 1e12 ? epochOrDate * 1000 : epochOrDate)
        : new Date();
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function buildGlobalPlayerProfile({ callerTgId, myTournaments = [], allPlayers = [], allMatches = [] }) {
  const playersById = new Map(allPlayers.map((p) => [p.id, p]));
  const playersByTournament = new Map();
  for (const p of allPlayers) {
    if (!playersByTournament.has(p.tournamentId)) playersByTournament.set(p.tournamentId, []);
    playersByTournament.get(p.tournamentId).push(p);
  }
  const matchesByTournament = new Map();
  for (const m of allMatches) {
    if (!matchesByTournament.has(m.tournamentId)) matchesByTournament.set(m.tournamentId, []);
    matchesByTournament.get(m.tournamentId).push(m);
  }

  let tournamentsPlayed = 0;
  let finishedTournaments = 0;
  let championCount = 0;
  let podiumCount = 0;
  let qualFirstCount = 0;
  let comebackCount = 0;
  let sniperCount = 0;
  let totalMatches = 0;
  let totalWins = 0;
  let totalGoalsFor = 0;

  const partnerMap = new Map(); // key: tgId || name -> { name, tgId, games, wins }
  const opponentMap = new Map(); // key: tgId || name -> { name, tgId, games, wins, losses }
  const timeline = [];

  const sortedTournaments = [...myTournaments].sort((a, b) => a.id - b.id);

  for (const t of sortedTournaments) {
    const tPlayers = playersByTournament.get(t.id) || [];
    const myPlayer = tPlayers.find((p) => Number(p.tgId) === Number(callerTgId));
    if (!myPlayer) continue;

    const tMatches = matchesByTournament.get(t.id) || [];
    const finishedMatches = tMatches.filter((m) => m.status === 'FINISHED');
    const myFinished = finishedMatches.filter((m) =>
      [m.team1Player1Id, m.team1Player2Id, m.team2Player1Id, m.team2Player2Id].includes(myPlayer.id)
    );
    if (myFinished.length > 0) tournamentsPlayed += 1;

    const lb = computeLeaderboard({ players: tPlayers, matches: tMatches, tableConfig: t.tableConfig });
    const myQualRow = lb.find((r) => r.playerId === myPlayer.id);
    if (myQualRow && myQualRow.rank === 1 && myQualRow.games > 0) {
      qualFirstCount += 1;
    }

    let tourneyGames = 0;
    let tourneyWins = 0;
    let tourneyGoals = 0;
    let tourneyOppGoals = 0;

    for (const m of myFinished) {
      const inT1 = m.team1Player1Id === myPlayer.id || m.team1Player2Id === myPlayer.id;
      const myTeamIds = inT1
        ? [m.team1Player1Id, m.team1Player2Id].filter(Boolean)
        : [m.team2Player1Id, m.team2Player2Id].filter(Boolean);
      const oppTeamIds = inT1
        ? [m.team2Player1Id, m.team2Player2Id].filter(Boolean)
        : [m.team1Player1Id, m.team1Player2Id].filter(Boolean);

      const t1Won =
        m.stage === 'PLAYOFF'
          ? m.setsWon1 > m.setsWon2 || (m.setsWon1 === m.setsWon2 && m.score1 > m.score2)
          : m.score1 > m.score2;
      const iWon = (inT1 && t1Won) || (!inT1 && !t1Won);

      totalMatches += 1;
      tourneyGames += 1;
      if (iWon) {
        totalWins += 1;
        tourneyWins += 1;
      }

      const myGoals = inT1 ? m.score1 : m.score2;
      const oppGoals = inT1 ? m.score2 : m.score1;
      totalGoalsFor += myGoals;
      tourneyGoals += myGoals;
      tourneyOppGoals += oppGoals;

      // Detect comeback: won a playoff match after trailing in setsHistory, or winning from lower qual seed by 1 goal
      if (iWon && Array.isArray(m.setsHistory) && m.setsHistory.length >= 2) {
        const s0 = m.setsHistory[0];
        const lostFirstSet = inT1 ? s0.score1 < s0.score2 : s0.score2 < s0.score1;
        if (lostFirstSet) comebackCount += 1;
      }

      for (const pid of myTeamIds) {
        if (pid === myPlayer.id) continue;
        const p = playersById.get(pid);
        if (!p) continue;
        const key = p.tgId ? `tg:${p.tgId}` : `name:${p.name.toLowerCase()}`;
        const cur = partnerMap.get(key) || { name: p.name, tgId: p.tgId ?? null, games: 0, wins: 0 };
        cur.games += 1;
        if (iWon) cur.wins += 1;
        partnerMap.set(key, cur);
      }

      for (const oid of oppTeamIds) {
        const o = playersById.get(oid);
        if (!o) continue;
        const key = o.tgId ? `tg:${o.tgId}` : `name:${o.name.toLowerCase()}`;
        const cur = opponentMap.get(key) || {
          name: o.name,
          tgId: o.tgId ?? null,
          games: 0,
          wins: 0,
          losses: 0,
        };
        cur.games += 1;
        if (iWon) cur.wins += 1;
        else cur.losses += 1;
        opponentMap.set(key, cur);
      }
    }

    if (tourneyGames >= 2 && tourneyGoals - tourneyOppGoals >= 10) {
      sniperCount += 1;
    }

    if (t.status === 'FINISHED') {
      finishedTournaments += 1;
      const finalMatch = finishedMatches.find((m) => m.stage === 'PLAYOFF' && m.bracketSlot === 'FINAL');
      const thirdMatch = finishedMatches.find((m) => m.stage === 'PLAYOFF' && m.bracketSlot === 'THIRD_PLACE');
      if (finalMatch) {
        const t1Won =
          finalMatch.setsWon1 > finalMatch.setsWon2 ||
          (finalMatch.setsWon1 === finalMatch.setsWon2 && finalMatch.score1 > finalMatch.score2);
        const winnerIds = t1Won
          ? [finalMatch.team1Player1Id, finalMatch.team1Player2Id].filter(Boolean)
          : [finalMatch.team2Player1Id, finalMatch.team2Player2Id].filter(Boolean);
        const runnerIds = t1Won
          ? [finalMatch.team2Player1Id, finalMatch.team2Player2Id].filter(Boolean)
          : [finalMatch.team1Player1Id, finalMatch.team1Player2Id].filter(Boolean);
        let thirdIds = [];
        if (thirdMatch) {
          const t3Won =
            thirdMatch.setsWon1 > thirdMatch.setsWon2 ||
            (thirdMatch.setsWon1 === thirdMatch.setsWon2 && thirdMatch.score1 > thirdMatch.score2);
          thirdIds = t3Won
            ? [thirdMatch.team1Player1Id, thirdMatch.team1Player2Id].filter(Boolean)
            : [thirdMatch.team2Player1Id, thirdMatch.team2Player2Id].filter(Boolean);
        }
        if (winnerIds.includes(myPlayer.id)) {
          championCount += 1;
          podiumCount += 1;
        } else if (runnerIds.includes(myPlayer.id) || thirdIds.includes(myPlayer.id)) {
          podiumCount += 1;
        }
      } else if (myQualRow) {
        if (myQualRow.rank === 1) championCount += 1;
        if (myQualRow.rank <= 3) podiumCount += 1;
      }
    }

    if (tourneyGames > 0) {
      timeline.push({
        tournamentId: t.id,
        tournamentName: t.name,
        dateLabel: formatDateRuShort(t.finishedAt || t.startedAt || t.createdAt),
        avgPoints: myQualRow ? myQualRow.ppm : Number(((tourneyWins * 2) / tourneyGames).toFixed(2)),
        wins: tourneyWins,
        games: tourneyGames,
        rank: myQualRow?.rank ?? null,
      });
    }
  }

  const partners = Array.from(partnerMap.values()).map((p) => ({
    ...p,
    winRate: p.games > 0 ? Math.round((p.wins / p.games) * 100) : 0,
  }));

  const mostFrequentPartner =
    partners.length > 0
      ? [...partners].sort((a, b) => b.games - a.games || b.winRate - a.winRate)[0]
      : null;

  const minGamesForBest = partners.some((p) => p.games >= 2) ? 2 : 1;
  const bestPartnerCandidates = partners.filter((p) => p.games >= minGamesForBest);
  const bestPartner =
    bestPartnerCandidates.length > 0
      ? [...bestPartnerCandidates].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || b.games - a.games)[0]
      : null;

  const opponents = Array.from(opponentMap.values()).map((o) => ({
    ...o,
    lossRate: o.games > 0 ? Math.round((o.losses / o.games) * 100) : 0,
  }));
  const minGamesForOpp = opponents.some((o) => o.games >= 2) ? 2 : 1;
  const oppCandidates = opponents.filter((o) => o.games >= minGamesForOpp && o.losses > 0);
  const toughestOpponent =
    oppCandidates.length > 0
      ? [...oppCandidates].sort((a, b) => b.lossRate - a.lossRate || b.losses - a.losses || b.games - a.games)[0]
      : null;

  const badges = [];
  if (championCount > 0) {
    badges.push({
      id: 'champion',
      emoji: '🏆',
      title: 'Победитель турнира',
      description: 'Победа в финале или 1-е место по итогам турнира',
      count: championCount,
    });
  }
  if (podiumCount > 0) {
    badges.push({
      id: 'podium',
      emoji: '🥇',
      title: 'Призёр клуба',
      description: 'Финиш в топ-3 турнира',
      count: podiumCount,
    });
  }
  if (qualFirstCount > 0) {
    badges.push({
      id: 'qual_king',
      emoji: '👑',
      title: 'Лучший в квалификации',
      description: '1-е место по итогам отборочных раундов',
      count: qualFirstCount,
    });
  }
  if (comebackCount > 0) {
    badges.push({
      id: 'comeback',
      emoji: '🔥',
      title: 'Камбэк дня',
      description: 'Волевая победа в серии после проигранного первого сета',
      count: comebackCount,
    });
  }
  if (sniperCount > 0) {
    badges.push({
      id: 'sniper',
      emoji: '🎯',
      title: 'Снайпер',
      description: 'Разница мячей +10 и выше за турнир',
      count: sniperCount,
    });
  }
  if (tournamentsPlayed >= 3) {
    badges.push({
      id: 'veteran',
      emoji: '⚡',
      title: 'Постоянный игрок',
      description: 'Участие в 3 и более турнирах',
      count: tournamentsPlayed,
    });
  }

  return {
    tournamentsPlayed,
    finishedTournaments,
    championCount,
    podiumCount,
    totalMatches,
    totalWins,
    winRate: totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0,
    avgGoalsPerMatch: totalMatches > 0 ? Number((totalGoalsFor / totalMatches).toFixed(1)) : 0,
    mostFrequentPartner,
    bestPartner,
    toughestOpponent,
    timeline: timeline.slice(-10),
    badges,
  };
}
