import { db, EndpointError } from 'sdk';
import { and, eq, gt } from 'sdk/db';
import { clientErrors } from '../schema.js';

export default async function (input, ctx) {
  const tgUser = ctx.initData?.user;
  if (!tgUser?.id) {
    throw new EndpointError('Необходима авторизация Telegram', { code: 'UNAUTHORIZED' });
  }

  const rawMessage = String(input?.message || '').trim().slice(0, 400);
  if (!rawMessage) {
    return { ok: false, skipped: 'empty' };
  }

  const stack = input?.stack ? String(input.stack).slice(0, 2000) : null;
  const fingerprint = rawMessage.slice(0, 120);
  const cutoffSec = Math.floor(Date.now() / 1000) - 30 * 60;

  const recent = await db
    .select({ id: clientErrors.id })
    .from(clientErrors)
    .where(and(eq(clientErrors.fingerprint, fingerprint), gt(clientErrors.createdAt, cutoffSec)))
    .get();

  if (recent) {
    return { ok: true, deduplicated: true };
  }

  await db.insert(clientErrors).values({
    tgId: tgUser.id,
    fingerprint,
    message: rawMessage,
    stack,
  });

  console.error('[CLIENT_ERROR]', { tgId: tgUser.id, message: rawMessage });
  return { ok: true, deduplicated: false };
}
