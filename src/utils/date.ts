import type { MatchItem } from '../types';

function toValidDate(val?: string | number | Date | null): Date | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return null;
    const ms = val < 1e12 ? val * 1000 : val;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(val).trim();
  if (!s) return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (ymd) {
    return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateRu(val?: string | number | Date | null): string {
  const d = toValidDate(val);
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function formatTimeHm(val?: string | number | Date | null): string {
  const d = toValidDate(val);
  if (!d) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatTimeHms(val?: string | number | Date | null): string {
  const d = toValidDate(val);
  if (!d) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export interface PodiumPlaces {
  first: string | null;
  second: string | null;
  third: string | null;
}

function getWinnerTeam(m: MatchItem): 1 | 2 {
  const t1Won =
    m.setsWon1 > m.setsWon2 || (m.setsWon1 === m.setsWon2 && m.score1 > m.score2);
  return t1Won ? 1 : 2;
}

export function getPlayoffPodium(playoffMatches: MatchItem[]): PodiumPlaces {
  const finalMatch = playoffMatches.find(
    (m) => m.bracketSlot === 'FINAL' && m.status === 'FINISHED'
  );
  const thirdMatch = playoffMatches.find(
    (m) => m.bracketSlot === 'THIRD_PLACE' && m.status === 'FINISHED'
  );

  let first: string | null = null;
  let second: string | null = null;
  let third: string | null = null;

  if (finalMatch) {
    const w = getWinnerTeam(finalMatch);
    first = w === 1 ? finalMatch.team1Label : finalMatch.team2Label;
    second = w === 1 ? finalMatch.team2Label : finalMatch.team1Label;
  }

  if (thirdMatch) {
    const w = getWinnerTeam(thirdMatch);
    third = w === 1 ? thirdMatch.team1Label : thirdMatch.team2Label;
  }

  return { first, second, third };
}

export interface PlayerPlayoffResult {
  participated: boolean;
  place: 1 | 2 | 3 | 4 | null;
  isPodium: boolean;
  headline: string;
  wins: number;
  losses: number;
}

function isMatchParticipant(m: MatchItem, playerId: number): boolean {
  if (m.myTeam === 1 || m.myTeam === 2) return true;
  return (
    m.team1Players.some((p) => p.id === playerId) ||
    m.team2Players.some((p) => p.id === playerId)
  );
}

function getPlayerMatchTeam(m: MatchItem, playerId: number): 1 | 2 | null {
  if (m.myTeam === 1 || m.myTeam === 2) return m.myTeam;
  if (m.team1Players.some((p) => p.id === playerId)) return 1;
  if (m.team2Players.some((p) => p.id === playerId)) return 2;
  return null;
}

function getPlayoffStageHeadline(slot: string | null): string {
  if (!slot) return 'Участие в плей-офф';
  if (slot.startsWith('SF')) return 'Дошли до полуфинала';
  if (slot.startsWith('QF')) return 'Дошли до четвертьфинала';
  if (slot.startsWith('EF')) return 'Дошли до 1/8 финала';
  if (slot.startsWith('R32_')) return 'Дошли до 1/16 финала';
  return 'Участие в плей-офф';
}

function getSlotDepthWeight(slot: string | null): number {
  if (!slot) return 0;
  if (slot === 'FINAL') return 6;
  if (slot === 'THIRD_PLACE') return 5;
  if (slot.startsWith('SF')) return 4;
  if (slot.startsWith('QF')) return 3;
  if (slot.startsWith('EF')) return 2;
  if (slot.startsWith('R32_')) return 1;
  return 0;
}

export function getPlayerPlayoffResult(
  playoffMatches: MatchItem[],
  myPlayerId: number | null
): PlayerPlayoffResult | null {
  if (myPlayerId == null || playoffMatches.length === 0) return null;

  const myMatches = playoffMatches.filter(
    (m) => m.status !== 'CANCELLED' && isMatchParticipant(m, myPlayerId)
  );

  if (myMatches.length === 0) {
    return {
      participated: false,
      place: null,
      isPodium: false,
      headline: 'Не прошли в плей-офф',
      wins: 0,
      losses: 0,
    };
  }

  let wins = 0;
  let losses = 0;
  for (const m of myMatches) {
    if (m.status !== 'FINISHED') continue;
    const team = getPlayerMatchTeam(m, myPlayerId);
    if (!team) continue;
    if (getWinnerTeam(m) === team) wins += 1;
    else losses += 1;
  }

  const finalMatch = myMatches.find(
    (m) => m.bracketSlot === 'FINAL' && m.status === 'FINISHED'
  );
  if (finalMatch) {
    const won = getWinnerTeam(finalMatch) === getPlayerMatchTeam(finalMatch, myPlayerId);
    const place = won ? 1 : 2;
    return {
      participated: true,
      place,
      isPodium: true,
      headline: `Вы заняли ${place} место в плей-офф`,
      wins,
      losses,
    };
  }

  const thirdMatch = myMatches.find(
    (m) => m.bracketSlot === 'THIRD_PLACE' && m.status === 'FINISHED'
  );
  if (thirdMatch) {
    const won = getWinnerTeam(thirdMatch) === getPlayerMatchTeam(thirdMatch, myPlayerId);
    if (won) {
      return {
        participated: true,
        place: 3,
        isPodium: true,
        headline: 'Вы заняли 3 место в плей-офф',
        wins,
        losses,
      };
    }
    return {
      participated: true,
      place: 4,
      isPodium: false,
      headline: 'Вы заняли 4 место в плей-офф',
      wins,
      losses,
    };
  }

  const deepestMatch = [...myMatches].sort(
    (a, b) => getSlotDepthWeight(b.bracketSlot) - getSlotDepthWeight(a.bracketSlot)
  )[0];

  return {
    participated: true,
    place: null,
    isPodium: false,
    headline: getPlayoffStageHeadline(deepestMatch?.bracketSlot ?? null),
    wins,
    losses,
  };
}
