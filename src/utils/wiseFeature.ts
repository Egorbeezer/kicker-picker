export const WISE_V2_USERNAMES = ['egor_beezer'] as const;

/**
 * Возвращает true только для пользователей, включённых в канареечный rollout нового Wise UI.
 */
export function isWiseV2User(username?: string | null): boolean {
  const fallbackUsername =
    typeof window !== 'undefined'
      ? window.Telegram?.WebApp?.initDataUnsafe?.user?.username
      : undefined;
  const normalized = String(username ?? fallbackUsername ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
  if (!normalized) return false;
  return (WISE_V2_USERNAMES as readonly string[]).includes(normalized);
}
