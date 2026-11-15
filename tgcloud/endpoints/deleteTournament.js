import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { tournaments, tournamentPlayers, tournamentAdmins, matches } from '../schema.js';
import { deletePublicLivePage } from '../lib/publicLive.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  const tournamentId = Number(input?.tournamentId);

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();

  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });
  if (tournament.creatorTgId !== tgUser?.id) {
    throw new EndpointError('Только организатор может удалить турнир', { code: 'FORBIDDEN' });
  }

  if (tournament.publicPath) {
    await deletePublicLivePage(tournament.publicPath, tournament.publicToken);
  }

  // Delete children before parent (SQLite FKs are off in tgcloud)
  await db.delete(matches).where(eq(matches.tournamentId, tournamentId));
  await db.delete(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, tournamentId));
  await db.delete(tournamentAdmins).where(eq(tournamentAdmins.tournamentId, tournamentId));
  await db.delete(tournaments).where(eq(tournaments.id, tournamentId));

  return { ok: true, deletedId: tournamentId };
}
