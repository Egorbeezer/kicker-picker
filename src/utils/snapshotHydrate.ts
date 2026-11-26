import type { MatchItem, MatchPlayerInfo, TournamentSnapshot } from '../types';

function hydratePlayerList(
  list: MatchPlayerInfo[] | undefined,
  avatarById: Map<number, string | null>
): MatchPlayerInfo[] {
  if (!Array.isArray(list)) return [];
  return list.map((p) =>
    p.avatarUrl !== undefined
      ? p
      : {
          ...p,
          avatarUrl: avatarById.get(p.id) ?? null,
        }
  );
}

function hydrateMatch(
  m: MatchItem,
  avatarById: Map<number, string | null>
): MatchItem {
  return {
    ...m,
    team1Players: hydratePlayerList(m.team1Players, avatarById),
    team2Players: hydratePlayerList(m.team2Players, avatarById),
  };
}

/**
 * Восстанавливает дедуплицированные `avatarUrl` из `players[]` в `leaderboard` и матчи,
 * чтобы не передавать повторяющиеся Base64-строки по сети в каждом опросе.
 */
export function hydrateSnapshotAvatars(
  snap: TournamentSnapshot | null | undefined
): TournamentSnapshot | null {
  if (!snap) return null;
  const avatarById = new Map<number, string | null>();
  for (const p of snap.players || []) {
    avatarById.set(p.id, p.avatarUrl ?? null);
  }
  if (avatarById.size === 0) return snap;

  return {
    ...snap,
    leaderboard: (snap.leaderboard || []).map((row) =>
      row.avatarUrl !== undefined
        ? row
        : {
            ...row,
            avatarUrl: avatarById.get(row.playerId) ?? null,
          }
    ),
    currentRoundMatches: (snap.currentRoundMatches || []).map((m) =>
      hydrateMatch(m, avatarById)
    ),
    playoffMatches: (snap.playoffMatches || []).map((m) => hydrateMatch(m, avatarById)),
    ...(snap.allMatches
      ? { allMatches: snap.allMatches.map((m) => hydrateMatch(m, avatarById)) }
      : {}),
    myCurrentMatch: snap.myCurrentMatch ? hydrateMatch(snap.myCurrentMatch, avatarById) : null,
    myHistory: (snap.myHistory || []).map((m) => hydrateMatch(m, avatarById)),
  };
}
