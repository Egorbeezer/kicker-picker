import { db, EndpointError } from 'sdk';
import { and, eq, gt, lt } from 'sdk/db';
import { clientErrors } from '../schema.js';
import { notifyBotOwnerAlert } from '../lib/helpers.js';

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
  const source = input?.source ? String(input.source).trim().slice(0, 80) : 'miniapp';
  const context = input?.context ? String(input.context).trim().slice(0, 300) : null;
  const fingerprint = rawMessage.slice(0, 120);
  const nowSec = Math.floor(Date.now() / 1000);
  const cutoffSec = nowSec - 30 * 60;
  const rateLimitCutoffSec = nowSec - 10 * 60;

  const recentUserErrors = await db
    .select({ id: clientErrors.id })
    .from(clientErrors)
    .where(and(eq(clientErrors.tgId, tgUser.id), gt(clientErrors.createdAt, rateLimitCutoffSec)))
    .all();

  if (recentUserErrors.length >= 10) {
    return { ok: true, deduplicated: false, rateLimited: true };
  }

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

  // Автоматическая ротация: удаляем записи старше 30 дней, чтобы не копить мусор в client_errors
  const retentionCutoffSec = nowSec - 30 * 24 * 60 * 60;
  await db.delete(clientErrors).where(lt(clientErrors.createdAt, retentionCutoffSec));

  console.error('[CLIENT_ERROR]', { tgId: tgUser.id, source, message: rawMessage });
  await notifyBotOwnerAlert({
    source,
    message: rawMessage,
    stack,
    tgUser,
    context,
  });

  return { ok: true, deduplicated: false };
}
