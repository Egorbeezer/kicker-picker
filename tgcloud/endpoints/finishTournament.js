import { db, EndpointError } from 'sdk';
import { eq, and, inArray } from 'sdk/db';
import { tournaments, matches } from '../schema.js';
import { getTournamentSnapshot, isTournamentAdmin } from '../lib/helpers.js';
import { syncPublicLiveIfEnabled } from '../lib/publicLive.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация', { code: 'UNAUTHORIZED' });

  const tournamentId = Number(input?.tournamentId);
  const reopen = Boolean(input?.reopen);

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();

  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });
  if (!isTournamentAdmin(tournament, tgUser.id)) {
    throw new EndpointError('Только организатор может завершать турнир', { code: 'FORBIDDEN' });
  }

  const allMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId))
    .all();

  if (reopen) {
    if (tournament.status !== 'FINISHED') {
      return await getTournamentSnapshot(tournamentId, tgUser.id);
    }
    const hasPlayoff = allMatches.some((m) => m.stage === 'PLAYOFF');
    await db
      .update(tournaments)
      .set({
        status: hasPlayoff ? 'PLAYOFF' : tournament.currentRound > 0 ? 'QUALIFICATION' : 'REGISTRATION',
        finishedAt: null,
      })
      .where(and(eq(tournaments.id, tournamentId), eq(tournaments.status, 'FINISHED')))
      .returning();

    await syncPublicLiveIfEnabled(tournamentId);
    return await getTournamentSnapshot(tournamentId, tgUser.id);
  }

  if (tournament.status === 'REGISTRATION') {
    throw new EndpointError('Турнир ещё не начался', { code: 'INVALID_STATE' });
  }

  if (tournament.status === 'FINISHED') {
    return await getTournamentSnapshot(tournamentId, tgUser.id);
  }

  if (tournament.status === 'PLAYOFF') {
    const playoffMatches = allMatches.filter((m) => m.stage === 'PLAYOFF');
    const finalMatch = playoffMatches.find((m) => m.bracketSlot === 'FINAL');
    if (!finalMatch || finalMatch.status !== 'FINISHED') {
      throw new EndpointError('Сначала необходимо завершить финальный матч', {
        code: 'FINAL_NOT_FINISHED',
      });
    }

    const thirdPlaceMatch = playoffMatches.find((m) => m.bracketSlot === 'THIRD_PLACE');
    if (thirdPlaceMatch && thirdPlaceMatch.status !== 'FINISHED') {
      throw new EndpointError('Сначала необходимо завершить матч за 3-е место', {
        code: 'THIRD_PLACE_NOT_FINISHED',
      });
    }

    const currentRoundOpen = playoffMatches.some(
      (m) =>
        m.roundNumber === tournament.currentRound &&
        m.status !== 'FINISHED' &&
        m.status !== 'CANCELLED'
    );
    if (currentRoundOpen) {
      throw new EndpointError('Сначала завершите все матчи текущего раунда плей-офф', {
        code: 'ROUND_IN_PROGRESS',
      });
    }
  } else if (tournament.status === 'QUALIFICATION') {
    if (tournament.currentRound <= 0) {
      throw new EndpointError('Сыграйте хотя бы один раунд перед завершением', {
        code: 'INVALID_STATE',
      });
    }
    const roundOpen = allMatches.some(
      (m) =>
        m.stage === 'QUALIFICATION' &&
        m.roundNumber === tournament.currentRound &&
        m.status !== 'FINISHED' &&
        m.status !== 'CANCELLED'
    );
    if (roundOpen) {
      throw new EndpointError('Сначала завершите все матчи текущего раунда', {
        code: 'ROUND_IN_PROGRESS',
      });
    }
  }

  await db
    .update(tournaments)
    .set({
      status: 'FINISHED',
      finishedAt: new Date(),
      pendingPlayoff: false,
    })
    .where(and(eq(tournaments.id, tournamentId), inArray(tournaments.status, ['QUALIFICATION', 'PLAYOFF'])))
    .returning();

  await syncPublicLiveIfEnabled(tournamentId);
  return await getTournamentSnapshot(tournamentId, tgUser.id);
}
