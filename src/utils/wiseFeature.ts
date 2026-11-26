export const WISE_V2_USERNAMES = ['egor_beezer'] as const;

/**
 * Дизайн Wise v2 включён для всех пользователей (100% rollout).
 */
export function isWiseV2User(_username?: string | null): boolean {
  void _username;
  return true;
}
