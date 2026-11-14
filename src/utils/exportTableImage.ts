import type { TableColumnConfig, TableColumnKey, TournamentSnapshot } from '../types';
import { canvasToPngResult, loadCanvasImage } from './canvasImage';
import { currentTheme } from './theme';

const COLUMN_META: Record<TableColumnKey, { label: string; width: number }> = {
  wins: { label: 'Поб', width: 58 },
  ppm: { label: 'Ср.очк', width: 78 },
  fairPpm: { label: 'Ч.очк', width: 74 },
  points: { label: 'Очки', width: 58 },
  diff: { label: '+/-', width: 62 },
  games: { label: 'Игр', width: 54 },
  losses: { label: 'Пор', width: 54 },
  goalsFor: { label: 'Зб', width: 52 },
  goalsAgainst: { label: 'Пр', width: 52 },
  winRate: { label: 'Поб%', width: 66 },
  buchholz: { label: 'BH₁', width: 58 },
  avgBuchholz: { label: 'ØBH', width: 60 },
  sonnebornBerger: { label: 'SB', width: 58 },
  name: { label: 'Игрок', width: 0 },
};

function formatTodayRu(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

export async function renderLeaderboardToPng(params: {
  snapshot: TournamentSnapshot;
  activeConfig: TableColumnConfig[];
}): Promise<{ dataUrl: string; base64: string; blob: Blob }> {
  const { snapshot, activeConfig } = params;
  const { tournament, leaderboard, myPlayerId } = snapshot;
  const isLight = currentTheme() === 'light';

  const palette = isLight
    ? {
        bg: '#eef1f5',
        card: '#ffffff',
        cardZone: '#f5f8fc',
        cardMe: '#e6f3ff',
        border: '#d6e0ea',
        borderMe: '#0b74d1',
        text: '#12212e',
        muted: '#63788c',
        accent: '#0b74d1',
        lime: '#4e9e14',
        gold: '#b8860b',
        green: '#16a34a',
        red: '#dc2626',
        badgeBg: '#e4e9f0',
      }
    : {
        bg: '#17212b',
        card: '#232e3c',
        cardZone: '#283647',
        cardMe: '#1e3a56',
        border: 'rgba(255,255,255,0.1)',
        borderMe: '#2ea6ff',
        text: '#f5f7fa',
        muted: '#8ea0b2',
        accent: '#2ea6ff',
        lime: '#96f84d',
        gold: '#eab308',
        green: '#4ade80',
        red: '#f87171',
        badgeBg: '#1c2632',
      };

  const nameVisible = activeConfig.find((c) => c.key === 'name')?.visible !== false;
  const visibleStatCols = activeConfig.filter((c) => c.key !== 'name' && c.visible).reverse();
  const primarySortKey = activeConfig.find((c) => c.sort && c.key !== 'name')?.key || 'wins';

  const padX = 24;
  const headerH = 98;
  const colHeaderH = 32;
  const rowH = 48;
  const rowGap = 6;
  const footerH = 38;
  const statsWidth = visibleStatCols.reduce((acc, c) => acc + (COLUMN_META[c.key]?.width || 60), 0);
  const width = Math.max(520, padX * 2 + 34 + (nameVisible ? 200 : 32) + statsWidth);
  const rowsCount = Math.max(1, leaderboard.length);
  const hasCutoff =
    tournament.playoffSize > 0 && leaderboard.length > tournament.playoffSize;
  const cutoffExtra = hasCutoff ? 14 : 0;
  const height = headerH + colHeaderH + rowsCount * (rowH + rowGap) + cutoffExtra + footerH + 16;

  const scale = 1.5;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D недоступен');

  ctx.scale(scale, scale);

  // Preload unique avatar URLs safely (CORS + timeout)
  const avatarCache = new Map<number, HTMLImageElement | null>();
  await Promise.all(
    leaderboard.map(async (row) => {
      if (row.avatarUrl) {
        avatarCache.set(row.playerId, await loadCanvasImage(row.avatarUrl));
      }
    })
  );

  // Background
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, width, height);

  // Header panel
  drawRoundedRect(ctx, padX, 16, width - padX * 2, 70, 16);
  ctx.fillStyle = palette.card;
  ctx.fill();
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  const stageLabel =
    tournament.status === 'FINISHED'
      ? 'Турнир завершен'
      : tournament.status === 'PLAYOFF'
        ? `Плей-офф • Раунд ${tournament.currentRound}`
        : tournament.status === 'QUALIFICATION'
          ? `Квалификация • Раунд ${tournament.currentRound}`
          : 'Регистрация';

  ctx.textBaseline = 'middle';
  ctx.font = '700 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = palette.text;
  ctx.fillText(fitText(ctx, tournament.name, width - padX * 2 - 175), padX + 16, 39);

  ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = palette.muted;
  ctx.fillText(`${stageLabel} • ${formatTodayRu()}`, padX + 16, 63);

  // Top-N badge
  const badgeText = `Топ-${tournament.playoffSize} в плей-офф`;
  ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const badgeW = ctx.measureText(badgeText).width + 20;
  drawRoundedRect(ctx, width - padX - 14 - badgeW, 36, badgeW, 28, 8);
  ctx.fillStyle = palette.badgeBg;
  ctx.fill();
  ctx.strokeStyle = palette.border;
  ctx.stroke();
  ctx.fillStyle = palette.accent;
  ctx.textAlign = 'center';
  ctx.fillText(badgeText, width - padX - 14 - badgeW / 2, 50);
  ctx.textAlign = 'left';

  // Column header
  let curX = padX + 10;
  const colY = headerH + 10;
  ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = palette.muted;
  ctx.textAlign = 'center';
  ctx.fillText('#', curX + 14, colY);
  curX += 34;

  ctx.textAlign = 'left';
  if (nameVisible) {
    ctx.fillText('ИГРОК', curX + 4, colY);
  }

  let statRight = width - padX - 10;
  const statCenters: Array<{ key: TableColumnKey; centerX: number }> = [];
  for (let i = visibleStatCols.length - 1; i >= 0; i--) {
    const col = visibleStatCols[i];
    const meta = COLUMN_META[col.key];
    const w = meta?.width || 60;
    const center = statRight - w / 2;
    statCenters.unshift({ key: col.key, centerX: center });
    statRight -= w;
  }

  ctx.textAlign = 'center';
  for (const item of statCenters) {
    ctx.fillText(COLUMN_META[item.key].label.toUpperCase(), item.centerX, colY);
  }
  ctx.textAlign = 'left';

  // Rows
  let y = headerH + colHeaderH;
  if (leaderboard.length === 0) {
    ctx.fillStyle = palette.muted;
    ctx.textAlign = 'center';
    ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Пока нет участников', width / 2, y + 24);
    ctx.textAlign = 'left';
  } else {
    for (let i = 0; i < leaderboard.length; i++) {
      const row = leaderboard[i];
      const isMe = row.playerId === myPlayerId;
      const inPlayoffZone = row.rank <= tournament.playoffSize;

      if (hasCutoff && i === tournament.playoffSize) {
        ctx.strokeStyle = palette.accent;
        ctx.globalAlpha = 0.45;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(padX + 8, y + 3);
        ctx.lineTo(width - padX - 8, y + 3);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        y += cutoffExtra;
      }

      drawRoundedRect(ctx, padX, y, width - padX * 2, rowH, 12);
      ctx.fillStyle = isMe ? palette.cardMe : inPlayoffZone ? palette.cardZone : palette.card;
      ctx.fill();
      ctx.strokeStyle = isMe ? palette.borderMe : palette.border;
      ctx.lineWidth = isMe ? 1.5 : 1;
      ctx.stroke();

      const midY = y + rowH / 2;
      const rankX = padX + 24;
      ctx.font = '700 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = row.rank <= 3 ? palette.gold : inPlayoffZone ? palette.text : palette.muted;
      ctx.textAlign = 'center';
      ctx.fillText(String(row.rank), rankX, midY);
      ctx.textAlign = 'left';

      // Avatar circle
      const avX = padX + 46;
      const avSize = 30;
      const avCenterX = avX + avSize / 2;
      const avImg = avatarCache.get(row.playerId);
      ctx.save();
      ctx.beginPath();
      ctx.arc(avCenterX, midY, avSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      let drawnAvatar = false;
      if (avImg) {
        try {
          ctx.drawImage(avImg, avX, midY - avSize / 2, avSize, avSize);
          drawnAvatar = true;
        } catch {
          drawnAvatar = false;
        }
      }
      if (!drawnAvatar) {
        ctx.fillStyle = isMe ? palette.accent : palette.badgeBg;
        ctx.fillRect(avX, midY - avSize / 2, avSize, avSize);
        ctx.fillStyle = isMe ? '#ffffff' : palette.text;
        ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(row.initials || 'П', avCenterX, midY + 1);
        ctx.textAlign = 'left';
      }
      ctx.restore();

      // Player Name
      if (nameVisible) {
        const nameX = avX + avSize + 10;
        const maxNameW = Math.max(80, statRight - nameX - 10);
        const displayName = row.name + (isMe ? ' (Вы)' : '') + (!row.isActive ? ' • пауза' : '');
        ctx.font = isMe
          ? '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          : '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = isMe ? palette.accent : row.isActive ? palette.text : palette.muted;
        ctx.fillText(fitText(ctx, displayName, maxNameW), nameX, midY);
      }

      // Stats
      ctx.textAlign = 'center';
      for (const item of statCenters) {
        const isPrimary = item.key === primarySortKey;
        let valText = '';
        let color = isPrimary ? palette.text : palette.muted;
        if (item.key === 'wins') valText = String(row.wins);
        else if (item.key === 'ppm') valText = String(row.ppm);
        else if (item.key === 'fairPpm') {
          valText = `${row.fairPpm ?? row.ppm}${row.isBelowGameThreshold ? '*' : ''}`;
        } else if (item.key === 'points') valText = String(row.points);
        else if (item.key === 'games') valText = String(row.games);
        else if (item.key === 'losses') valText = String(row.losses ?? Math.max(0, row.games - row.wins));
        else if (item.key === 'goalsFor') valText = String(row.goalsFor);
        else if (item.key === 'goalsAgainst') valText = String(row.goalsAgainst);
        else if (item.key === 'winRate') {
          valText = `${row.winRate ?? (row.games > 0 ? Math.round((row.wins / row.games) * 100) : 0)}%`;
        } else if (item.key === 'buchholz') {
          valText = String(row.buchholz ?? 0);
        } else if (item.key === 'avgBuchholz') {
          valText = String(row.avgBuchholz ?? 0);
        } else if (item.key === 'sonnebornBerger') {
          valText = String(row.sonnebornBerger ?? 0);
        } else if (item.key === 'diff') {
          valText = row.diff > 0 ? `+${row.diff}` : String(row.diff);
          color = row.diff > 0 ? palette.green : row.diff < 0 ? palette.red : palette.muted;
        }
        ctx.font = isPrimary
          ? '800 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          : '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(valText, item.centerX, midY);
      }
      ctx.textAlign = 'left';

      y += rowH + rowGap;
    }
  }

  // Footer Brand
  const footerY = height - 20;
  ctx.font = '800 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const kickerW = ctx.measureText('кикер').width;
  const sepW = ctx.measureText(' ').width;
  const pickerW = ctx.measureText('пикер').width;
  const totalBrandW = kickerW + sepW + pickerW;
  let bx = width / 2 - totalBrandW / 2;
  ctx.fillStyle = palette.accent;
  ctx.fillText('кикер', bx, footerY);
  bx += kickerW + sepW;
  ctx.fillStyle = palette.lime;
  ctx.fillText('пикер', bx, footerY);

  return canvasToPngResult(canvas);
}
