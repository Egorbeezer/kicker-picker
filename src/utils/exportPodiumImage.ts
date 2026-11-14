import { MatchItem, MatchPlayerInfo, TournamentSnapshot } from '../types';
import { formatDateRu } from './date';
import { currentTheme, Theme } from './theme';

export interface PodiumImageResult {
  dataUrl: string;
  base64: string;
  blob: Blob;
}

interface PodiumEntry {
  place: 1 | 2 | 3;
  teamLabel: string;
  players: MatchPlayerInfo[];
  subtitle: string;
}

interface Palette {
  bgTop: string;
  bgBottom: string;
  cardBg: string;
  cardBorder: string;
  textPrimary: string;
  textMuted: string;
  pillBg: string;
  pillText: string;
  avatarBg: string;
  avatarBorder: string;
  footerLine: string;
}

const PALETTES: Record<Theme, Palette> = {
  dark: {
    bgTop: '#1b2634',
    bgBottom: '#101822',
    cardBg: '#232e3c',
    cardBorder: '#334155',
    textPrimary: '#f8fafc',
    textMuted: '#94a3b8',
    pillBg: 'rgba(15, 23, 42, 0.55)',
    pillText: '#cbd5e1',
    avatarBg: '#2b5278',
    avatarBorder: '#475569',
    footerLine: 'rgba(148, 163, 184, 0.18)',
  },
  light: {
    bgTop: '#ffffff',
    bgBottom: '#eef2f7',
    cardBg: '#ffffff',
    cardBorder: '#dbe3ee',
    textPrimary: '#0f172a',
    textMuted: '#64748b',
    pillBg: '#f1f5f9',
    pillText: '#334155',
    avatarBg: '#3b82f6',
    avatarBorder: '#cbd5e1',
    footerLine: 'rgba(15, 23, 42, 0.1)',
  },
};

const PLACE_STYLES: Record<
  1 | 2 | 3,
  { medal: string; label: string; accent: string; softBgDark: string; softBgLight: string }
> = {
  1: {
    medal: '🥇',
    label: '1 место · Чемпион',
    accent: '#f59e0b',
    softBgDark: 'rgba(245, 158, 11, 0.13)',
    softBgLight: 'rgba(245, 158, 11, 0.10)',
  },
  2: {
    medal: '🥈',
    label: '2 место · Серебро',
    accent: '#94a3b8',
    softBgDark: 'rgba(148, 163, 184, 0.12)',
    softBgLight: 'rgba(100, 116, 139, 0.08)',
  },
  3: {
    medal: '🥉',
    label: '3 место · Бронза',
    accent: '#d97706',
    softBgDark: 'rgba(217, 119, 6, 0.12)',
    softBgLight: 'rgba(217, 119, 6, 0.08)',
  },
};

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 1800);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

function formatMatchOutcome(match: MatchItem | undefined, prefix: string): string {
  if (!match || match.status !== 'FINISHED') return '';
  if (match.setsWon1 > 0 || match.setsWon2 > 0) {
    const setsText = `${match.setsWon1} : ${match.setsWon2}`;
    if (Array.isArray(match.setsHistory) && match.setsHistory.length > 0) {
      const setsScores = match.setsHistory.map((s) => `${s.score1}:${s.score2}`).join(', ');
      return `${prefix}: ${setsText} (${setsScores})`;
    }
    return `${prefix}: ${setsText}`;
  }
  return `${prefix}: ${match.score1} : ${match.score2}`;
}

function getWinnerAndLoser(match: MatchItem): {
  winner: { label: string; players: MatchPlayerInfo[] };
  loser: { label: string; players: MatchPlayerInfo[] };
} {
  const t1Won =
    match.setsWon1 !== match.setsWon2 ? match.setsWon1 > match.setsWon2 : match.score1 >= match.score2;
  return {
    winner: {
      label: t1Won ? match.team1Label : match.team2Label,
      players: t1Won ? match.team1Players || [] : match.team2Players || [],
    },
    loser: {
      label: t1Won ? match.team2Label : match.team1Label,
      players: t1Won ? match.team2Players || [] : match.team1Players || [],
    },
  };
}

function buildPodiumEntries(snapshot: TournamentSnapshot): PodiumEntry[] {
  const finalMatch = (snapshot.playoffMatches || []).find(
    (m) => m.bracketSlot === 'FINAL' && m.status === 'FINISHED',
  );
  const thirdMatch = (snapshot.playoffMatches || []).find(
    (m) => m.bracketSlot === 'THIRD_PLACE' && m.status === 'FINISHED',
  );

  const entries: PodiumEntry[] = [];
  if (finalMatch) {
    const { winner, loser } = getWinnerAndLoser(finalMatch);
    entries.push({
      place: 1,
      teamLabel: winner.label,
      players: winner.players,
      subtitle: formatMatchOutcome(finalMatch, 'Финал'),
    });
    entries.push({
      place: 2,
      teamLabel: loser.label,
      players: loser.players,
      subtitle: 'Финалист турнира',
    });
  }
  if (thirdMatch) {
    const { winner } = getWinnerAndLoser(thirdMatch);
    entries.push({
      place: 3,
      teamLabel: winner.label,
      players: winner.players,
      subtitle: formatMatchOutcome(thirdMatch, 'Матч за 3 место'),
    });
  }

  if (entries.length > 0) return entries;

  return (snapshot.leaderboard || []).slice(0, 3).map((row, idx) => ({
    place: (idx + 1) as 1 | 2 | 3,
    teamLabel: row.name,
    players: [
      {
        id: row.playerId,
        name: row.name,
        initials: row.initials,
        avatarUrl: row.avatarUrl,
      },
    ],
    subtitle: `${row.wins} поб. · ${row.points} очк. · разн. ${row.diff >= 0 ? `+${row.diff}` : row.diff}`,
  }));
}

async function drawPlayerAvatars(
  ctx: CanvasRenderingContext2D,
  players: MatchPlayerInfo[],
  startX: number,
  centerY: number,
  size: number,
  palette: Palette,
  loadedImages: Map<string, HTMLImageElement | null>,
): Promise<number> {
  const list = players.slice(0, 2);
  if (list.length === 0) return 0;

  const overlap = Math.round(size * 0.28);
  const step = size - overlap;

  for (let i = 0; i < list.length; i += 1) {
    const p = list[i];
    const cx = startX + size / 2 + i * step;
    const cy = centerY;
    const r = size / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = palette.avatarBg;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = palette.cardBg;
    ctx.stroke();
    ctx.restore();

    const img = p.avatarUrl ? loadedImages.get(p.avatarUrl) || null : null;
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, cx - r + 2, cy - r + 2, (r - 2) * 2, (r - 2) * 2);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.round(size * 0.36)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.initials || '?', cx, cy + 1);
      ctx.restore();
    }
  }

  return size + (list.length - 1) * step;
}

export async function renderPodiumToPng(
  snapshot: TournamentSnapshot,
  themeOverride?: Theme,
): Promise<PodiumImageResult> {
  const theme = themeOverride ?? currentTheme();
  const palette = PALETTES[theme];
  const entries = buildPodiumEntries(snapshot);
  const { tournament } = snapshot;

  const avatarUrls = new Set<string>();
  for (const entry of entries) {
    for (const p of entry.players) {
      if (p.avatarUrl) avatarUrls.add(p.avatarUrl);
    }
  }
  const loadedImages = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    Array.from(avatarUrls).map(async (url) => {
      loadedImages.set(url, await loadImage(url));
    }),
  );

  const W = 960;
  const PADDING_X = 48;
  const HEADER_H = 196;
  const CARD_H = 148;
  const CARD_GAP = 18;
  const FOOTER_H = 84;
  const H =
    HEADER_H +
    (entries.length > 0 ? entries.length * CARD_H + (entries.length - 1) * CARD_GAP : 120) +
    FOOTER_H +
    36;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable');
  }

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, palette.bgTop);
  bgGrad.addColorStop(1, palette.bgBottom);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle celebratory gold radial glow at top
  const glow = ctx.createRadialGradient(W / 2, 40, 10, W / 2, 40, 460);
  glow.addColorStop(0, theme === 'dark' ? 'rgba(245, 158, 11, 0.20)' : 'rgba(245, 158, 11, 0.16)');
  glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 380);

  // Top Pill: ИТОГИ ТУРНИРА
  ctx.font = '800 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const badgeText = '🏆  ИТОГИ ТУРНИРА';
  const badgeW = ctx.measureText(badgeText).width + 44;
  const badgeX = (W - badgeW) / 2;
  drawRoundedRect(ctx, badgeX, 42, badgeW, 42, 21);
  ctx.fillStyle = theme === 'dark' ? 'rgba(245, 158, 11, 0.18)' : 'rgba(245, 158, 11, 0.14)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
  ctx.stroke();

  ctx.fillStyle = theme === 'dark' ? '#fbbf24' : '#b45309';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, W / 2, 64);

  // Tournament Title
  ctx.fillStyle = palette.textPrimary;
  ctx.font = '800 40px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(fitText(ctx, tournament.name || 'Турнир', W - PADDING_X * 2), W / 2, 126);

  // Date & Format subtitle
  const dateLabel = formatDateRu(
    tournament.finishedAt ??
      (tournament.status === 'FINISHED' ? (tournament.startedAt ?? tournament.createdAt) : null) ??
      Date.now(),
  );
  const formatLabel = tournament.dypMode === 'classic' ? 'Classic DYP' : 'Monster DYP';
  const subTitle = [dateLabel, formatLabel, `${snapshot.players.length} игр.`]
    .filter(Boolean)
    .join('  ·  ');
  ctx.fillStyle = palette.textMuted;
  ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(subTitle, W / 2, 168);

  // Podium Cards
  let y = HEADER_H + 14;
  const cardW = W - PADDING_X * 2;

  for (const entry of entries) {
    const style = PLACE_STYLES[entry.place];
    drawRoundedRect(ctx, PADDING_X, y, cardW, CARD_H, 24);
    ctx.fillStyle = palette.cardBg;
    ctx.fill();

    // Accent tinted overlay
    drawRoundedRect(ctx, PADDING_X, y, cardW, CARD_H, 24);
    ctx.fillStyle = theme === 'dark' ? style.softBgDark : style.softBgLight;
    ctx.fill();

    ctx.lineWidth = entry.place === 1 ? 2.5 : 1.5;
    ctx.strokeStyle = entry.place === 1 ? style.accent : palette.cardBorder;
    ctx.stroke();

    // Left accent strip
    drawRoundedRect(ctx, PADDING_X + 12, y + 18, 6, CARD_H - 36, 3);
    ctx.fillStyle = style.accent;
    ctx.fill();

    // Place pill at top-left
    const pillX = PADDING_X + 34;
    const pillY = y + 20;
    ctx.font = '800 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const placeLabel = `${style.medal}  ${style.label.toUpperCase()}`;
    const placePillW = ctx.measureText(placeLabel).width + 26;
    drawRoundedRect(ctx, pillX, pillY, placePillW, 34, 17);
    ctx.fillStyle = palette.pillBg;
    ctx.fill();

    ctx.fillStyle = style.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(placeLabel, pillX + 13, pillY + 18);

    // Avatars
    const avatarSize = 60;
    const avatarsW = await drawPlayerAvatars(
      ctx,
      entry.players,
      pillX,
      y + 98,
      avatarSize,
      palette,
      loadedImages,
    );

    const textX = pillX + (avatarsW > 0 ? avatarsW + 18 : 0);
    const maxTextW = PADDING_X + cardW - 28 - textX;

    // Team / winner name
    ctx.fillStyle = palette.textPrimary;
    ctx.font = `800 ${entry.place === 1 ? 30 : 26}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitText(ctx, entry.teamLabel, maxTextW), textX, y + 86);

    // Match score / subtitle
    ctx.fillStyle = palette.textMuted;
    ctx.font = '600 19px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(fitText(ctx, entry.subtitle, maxTextW), textX, y + 120);

    y += CARD_H + CARD_GAP;
  }

  // Footer separator
  const footerY = H - FOOTER_H;
  ctx.strokeStyle = palette.footerLine;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PADDING_X, footerY);
  ctx.lineTo(W - PADDING_X, footerY);
  ctx.stroke();

  // Brand footer
  ctx.fillStyle = palette.textPrimary;
  ctx.font = '800 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚽ кикер пикер', PADDING_X, footerY + FOOTER_H / 2);

  const playedMatches = snapshot.timings?.playedCount;
  const rightFooter =
    playedMatches && playedMatches > 0 ? `Сыграно матчей: ${playedMatches}` : 'Турнир завершён';
  ctx.fillStyle = palette.textMuted;
  ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(rightFooter, W - PADDING_X, footerY + FOOTER_H / 2);

  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1] || '';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Failed to encode PNG'));
    }, 'image/png');
  });

  return { dataUrl, base64, blob };
}
