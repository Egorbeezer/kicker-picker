import type { MatchItem } from '../types';

function toValidDate(val?: string | number | Date | null): Date | null {
  if (!val) return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const ms = val < 1e12 ? val * 1000 : val;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(val).trim();
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
