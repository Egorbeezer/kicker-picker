import { buildPublicLiveUrl } from '../api/client';

export const BOT_USERNAME = 'kickerpickerbot';

export function getTournamentInviteLink(tournamentId: number): string {
  return `https://t.me/${BOT_USERNAME}?startapp=${tournamentId}`;
}

function openTelegramShareUrl(url: string, text: string): void {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

  const tgWebApp = window.Telegram?.WebApp;
  if (tgWebApp?.openTelegramLink) {
    tgWebApp.openTelegramLink(shareUrl);
    return;
  }

  window.open(shareUrl, '_blank', 'noopener,noreferrer');
}

export function shareTournamentInTelegram(params: { id: number; name: string }): void {
  const inviteLink = getTournamentInviteLink(params.id);
  const text = `⚽ Присоединяйся к турниру по кикеру «${params.name}»!`;
  openTelegramShareUrl(inviteLink, text);
}

/** Открывает системное окно отправки Live-ссылки в Telegram без показа сырой ссылки в UI. */
export function shareLiveUrlInTelegram(params: { name: string; publicPath: string }): void {
  const liveUrl = buildPublicLiveUrl(params.publicPath);
  const text = `📡 Live-трансляция турнира «${params.name}»`;
  openTelegramShareUrl(liveUrl, text);
}
