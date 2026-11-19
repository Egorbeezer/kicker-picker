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
  const text = `Присоединяйся к турниру по кикеру «${params.name}»!`;
  openTelegramShareUrl(inviteLink, text);
}

/** Открывает системное окно отправки Live-ссылки в Telegram без показа сырой ссылки в UI. */
export function shareLiveUrlInTelegram(params: { name: string; publicPath: string }): void {
  const liveUrl = buildPublicLiveUrl(params.publicPath);
  const text = `Live-трансляция турнира «${params.name}»`;
  openTelegramShareUrl(liveUrl, text);
}

export type ShareImageOutcome = 'shared' | 'copied' | 'downloaded' | 'cancelled' | 'unsupported';

/**
 * Делится изображением на стороне клиента (Web Share API → буфер обмена → скачивание)
 * без отправки фото пользователю в личные сообщения от бота.
 */
export async function shareImageFile(params: {
  blob: Blob;
  filename: string;
  title: string;
}): Promise<ShareImageOutcome> {
  const { blob, filename, title } = params;
  const mimeType = blob.type || 'image/png';
  const file = new File([blob], filename, { type: mimeType });

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const canShareFiles =
      typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] });
    if (canShareFiles) {
      try {
        await navigator.share({ files: [file], title });
        return 'shared';
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return 'cancelled';
        }
      }
    }
  }

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard?.write &&
    typeof ClipboardItem !== 'undefined'
  ) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ [mimeType]: blob })]);
      return 'copied';
    } catch {
      // ignore clipboard restrictions and try download fallback
    }
  }

  if (
    typeof document !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  ) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return 'downloaded';
    } catch {
      // ignore download fallback failure
    }
  }

  return 'unsupported';
}
