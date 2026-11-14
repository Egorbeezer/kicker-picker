import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { tournaments } from '../schema.js';
import { getTournamentSnapshot, isTournamentAdmin } from '../lib/helpers.js';
import { deletePublicLivePage, publishPublicLivePage } from '../lib/publicLive.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) throw new EndpointError('Необходима авторизация', { code: 'UNAUTHORIZED' });

  const tournamentId = Number(input?.tournamentId);
  const enabled = input?.enabled !== false;

  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .get();
  if (!tournament) throw new EndpointError('Турнир не найден', { code: 'NOT_FOUND' });
  if (!isTournamentAdmin(tournament, tgUser.id)) {
    throw new EndpointError('Только организатор может управлять Live-ссылкой', { code: 'FORBIDDEN' });
  }

  if (enabled) {
    try {
      const path = await publishPublicLivePage(tournamentId, { createIfMissing: true });
      if (!path) throw new Error('Empty live path');
    } catch (err) {
      console.error('publishLive failed:', err);
      throw new EndpointError(
        'Не удалось опубликовать Live-ссылку. Попробуйте ещё раз через несколько секунд.',
        { code: 'LIVE_PUBLISH_FAILED' }
      );
    }
  } else {
    await deletePublicLivePage(tournament.publicPath);
    await db
      .update(tournaments)
      .set({ publicToken: null, publicPath: null })
      .where(eq(tournaments.id, tournamentId));
  }

  return await getTournamentSnapshot(tournamentId, tgUser.id);
}
