export const BOT_USERNAME = 'kickerpickerbot';

export function getTournamentInviteLink(tournamentId: number): string {
  return `https://t.me/${BOT_USERNAME}?startapp=${tournamentId}`;
}

export function shareTournamentInTelegram(params: { id: number; name: string }): void {
  const inviteLink = getTournamentInviteLink(params.id);
  const text = `⚽ Присоединяйся к турниру по кикеру «${params.name}»!`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`;

  const tgWebApp = window.Telegram?.WebApp;
  if (tgWebApp?.openTelegramLink) {
    tgWebApp.openTelegramLink(shareUrl);
    return;
  }

  window.open(shareUrl, '_blank', 'noopener,noreferrer');
}
