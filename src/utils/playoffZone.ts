/**
 * Returns the set of active participant IDs currently inside the playoff qualification zone.
 * Absent (`isActive === false`) players are skipped so lower-ranked active players move up.
 */
export function getPlayoffQualifiedIds<T extends { playerId: number; isActive?: boolean }>(
  leaderboard: readonly T[],
  playoffSize: number
): Set<number> {
  const qualified = new Set<number>();
  if (!playoffSize || playoffSize <= 0) return qualified;

  for (const row of leaderboard) {
    if (row.isActive === false) continue;
    qualified.add(row.playerId);
    if (qualified.size >= playoffSize) break;
  }
  return qualified;
}
