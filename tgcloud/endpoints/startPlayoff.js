import { db, EndpointError } from 'sdk';
import { eq, and, inArray } from 'sdk/db';
import { tournaments, tournamentPlayers, matches } from '../schema.js';
import { createPlayoffFirstRound, getTournamentSnapshot, isTournamentAdmin } from '../lib/helpers.js';
import { syncPublicLiveIfEnabled } from '../lib/publicLive.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  const tournamentId = Number(input?.tournamentId);
  const cancel = Boolean(input?.cancel);

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();

  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });
  if (!isTournamentAdmin(tournament, tgUser?.id)) {
    throw new EndpointError('Только организатор может управлять переходом в плей-офф', {
      code: 'FORBIDDEN',
    });
  }
  if (tournament.status === 'PLAYOFF' || tournament.status === 'FINISHED') {
    throw new EndpointError('Плей-офф уже запущен или завершен', { code: 'INVALID_STATE' });
  }

  if (cancel) {
    await db
      .update(tournaments)
      .set({ pendingPlayoff: false })
      .where(eq(tournaments.id, tournamentId));
    await syncPublicLiveIfEnabled(tournamentId);
    return await getTournamentSnapshot(tournamentId, tgUser.id);
  }

  const overrides = {};
  if (input?.playoffSize !== undefined && [2, 4, 8, 16, 32].includes(Number(input.playoffSize))) {
    overrides.playoffSize = Number(input.playoffSize);
  }
  if (input?.thirdPlaceMatch !== undefined) {
    overrides.thirdPlaceMatch = Boolean(input.thirdPlaceMatch);
  }

  const players = await db
    .select()
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, tournamentId))
    .all();

  const activePlayers = players.filter((p) => p.isActive);
  const minPlayers = tournament.teamFormat === 'single' ? 2 : 4;
  if (activePlayers.length < minPlayers) {
    throw new EndpointError(`Для плей-офф нужно минимум ${minPlayers} присутствующих участника`, {
      code: 'CANNOT_START_PLAYOFF',
    });
  }

  const allMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId))
    .all();

  const hasActiveMatches = allMatches.some(
    (m) => m.status !== 'FINISHED' && m.status !== 'CANCELLED'
  );

  if (hasActiveMatches) {
    // Schedule transition to playoff after current round finishes and disable autoRounds
    const scheduled = await db
      .update(tournaments)
      .set({
        autoRounds: false,
        pendingPlayoff: true,
        ...(overrides.playoffSize !== undefined ? { playoffSize: overrides.playoffSize } : {}),
        ...(overrides.thirdPlaceMatch !== undefined ? { thirdPlaceMatch: overrides.thirdPlaceMatch } : {}),
      })
      .where(and(eq(tournaments.id, tournamentId), inArray(tournaments.status, ['REGISTRATION', 'QUALIFICATION'])))
      .returning();

    if (!Array.isArray(scheduled) || scheduled.length === 0) {
      throw new EndpointError('Статус турнира уже изменён', { code: 'CONFLICT' });
    }

    await syncPublicLiveIfEnabled(tournamentId);
    return await getTournamentSnapshot(tournamentId, tgUser.id);
  }

  await createPlayoffFirstRound(tournament, { overrides });
  await syncPublicLiveIfEnabled(tournamentId);

  return await getTournamentSnapshot(tournamentId, tgUser.id);
}
