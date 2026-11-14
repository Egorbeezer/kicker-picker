import { MatchItem, TournamentSnapshot } from '../types';
import { canvasToPngResult } from './canvasImage';
import { formatDateRu } from './date';
import { currentTheme, Theme } from './theme';

export interface PlayoffImageResult {
  dataUrl: string;
  base64: string;
  shareBase64?: string;
  blob: Blob;
}

interface RoundSpec {
  prefix: 'EF' | 'QF' | 'SF' | 'FINAL';
  title: string;
  matchCount: number;
}

interface Palette {
  bg: string;
  cardBg: string;
  cardBorder: string;
  rowBg: string;
  rowWinBg: string;
  text: string;
  muted: string;
  accent: string;
  lime: string;
  gold: string;
  green: string;
  lineMuted: string;
}

const PALETTES: Record<Theme, Palette> = {
  dark: {
    bg: '#17212b',
    cardBg: '#232e3c',
    cardBorder: '#334155',
    rowBg: 'rgba(15, 23, 42, 0.42)',
    rowWinBg: 'rgba(52, 199, 89, 0.16)',
    text: '#ffffff',
    muted: '#8b9bab',
    accent: '#2ea6ff',
    lime: '#96f84d',
    gold: '#eab308',
    green: '#34c759',
    lineMuted: 'rgba(148, 163, 184, 0.35)',
  },
  light: {
    bg: '#eef1f5',
    cardBg: '#ffffff',
    cardBorder: '#d7e0ea',
    rowBg: '#f1f5f9',
    rowWinBg: 'rgba(30, 158, 74, 0.14)',
    text: '#12212e',
    muted: '#63788c',
    accent: '#0b74d1',
    lime: '#4e9e14',
    gold: '#b45309',
    green: '#1e9e4a',
    lineMuted: 'rgba(100, 116, 139, 0.35)',
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

function getBracketRounds(matches: MatchItem[], playoffSize: number): RoundSpec[] {
  const slots = matches.map((m) => m.bracketSlot || '');
  const hasEF = slots.some((s) => s.startsWith('EF'));
  const hasQF = slots.some((s) => s.startsWith('QF'));
  const hasSF = slots.some((s) => s.startsWith('SF'));

  let startDepth: 'EF' | 'QF' | 'SF' | 'FINAL' = 'FINAL';
  if (hasEF || (!matches.length && playoffSize >= 32)) startDepth = 'EF';
  else if (hasQF || (!matches.length && playoffSize >= 16)) startDepth = 'QF';
  else if (hasSF || (!matches.length && playoffSize >= 8)) startDepth = 'SF';

  const all: RoundSpec[] = [
    { prefix: 'EF', title: '1/8 финала', matchCount: 8 },
    { prefix: 'QF', title: 'Четвертьфинал', matchCount: 4 },
    { prefix: 'SF', title: 'Полуфинал', matchCount: 2 },
    { prefix: 'FINAL', title: 'Финал', matchCount: 1 },
  ];

  const startIndex = all.findIndex((r) => r.prefix === startDepth);
  return all.slice(startIndex === -1 ? all.length - 1 : startIndex);
}

function isTeamWinner(match: MatchItem, team: 1 | 2): boolean {
  if (match.status !== 'FINISHED') return false;
  const t1Won =
    match.setsWon1 > match.setsWon2 ||
    (match.setsWon1 === match.setsWon2 && match.score1 > match.score2);
  return team === 1 ? t1Won : !t1Won;
}

function formatScoreChip(match: MatchItem, team: 1 | 2): string {
  if (match.status === 'PLAYING' && match.setsWon1 === 0 && match.setsWon2 === 0) {
    return '—';
  }
  const hasSeries =
    (match.setsWon1 > 0 || match.setsWon2 > 0) &&
    (match.setsWon1 + match.setsWon2 > 1 || (match.setsHistory && match.setsHistory.length > 1));
  if (hasSeries) {
    return String(team === 1 ? match.setsWon1 : match.setsWon2);
  }
  return String(team === 1 ? match.score1 : match.score2);
}

function getSlotKey(prefix: RoundSpec['prefix'], idx: number): string {
  return prefix === 'FINAL' ? 'FINAL' : `${prefix}${idx + 1}`;
}

function getSlotTitle(prefix: RoundSpec['prefix'], idx: number): string {
  if (prefix === 'FINAL') return 'Финал';
  if (prefix === 'SF') return `Полуфинал ${idx + 1}`;
  if (prefix === 'QF') return `Четвертьфинал ${idx + 1}`;
  return `1/8 финала ${idx + 1}`;
}

function drawMatchCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  match: MatchItem | null,
  slotLabel: string,
  palette: Palette,
  isFinal = false,
): void {
  drawRoundedRect(ctx, x, y, w, h, 20);
  ctx.fillStyle = palette.cardBg;
  ctx.fill();

  const isFinished = match?.status === 'FINISHED';
  const strokeColor = !match
    ? palette.cardBorder
    : isFinished
      ? isFinal
        ? palette.gold
        : palette.green
      : match.status === 'WAITING_CONFIRM'
        ? palette.accent
        : palette.cardBorder;

  ctx.save();
  if (!match) ctx.setLineDash([5, 4]);
  ctx.lineWidth = isFinal && isFinished ? 2 : 1.5;
  ctx.strokeStyle = strokeColor;
  ctx.stroke();
  ctx.restore();

  if (!match) {
    ctx.fillStyle = palette.muted;
    ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(slotLabel.toUpperCase(), x + 14, y + 18);

    ctx.textAlign = 'right';
    ctx.fillText('ОЖИДАНИЕ', x + w - 14, y + 18);

    ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Победитель пары 1', x + 14, y + 52);
    ctx.fillText('Победитель пары 2', x + 14, y + 84);
    return;
  }

  // Card header
  ctx.fillStyle = isFinal ? palette.gold : palette.muted;
  ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${slotLabel} • Ст. ${match.tableNumber}`, x + 12, y + 17);

  ctx.textAlign = 'right';
  if (isFinished) {
    ctx.fillStyle = palette.green;
    ctx.fillText('✓', x + w - 12, y + 17);
  } else if (match.status === 'WAITING_CONFIRM') {
    ctx.fillStyle = palette.accent;
    ctx.fillText('⏳', x + w - 12, y + 17);
  }

  const rowH = 34;
  const rowW = w - 20;
  const rows = [
    {
      y: y + 31,
      label: match.team1Label,
      win: isTeamWinner(match, 1),
      score: formatScoreChip(match, 1),
    },
    {
      y: y + 70,
      label: match.team2Label,
      win: isTeamWinner(match, 2),
      score: formatScoreChip(match, 2),
    },
  ];

  for (const row of rows) {
    drawRoundedRect(ctx, x + 10, row.y, rowW, rowH, 12);
    ctx.fillStyle = row.win ? palette.rowWinBg : palette.rowBg;
    ctx.fill();

    ctx.font = `${row.win ? '700' : '500'} 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = row.win ? palette.text : isFinished ? palette.muted : palette.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitText(ctx, row.label, rowW - 44), x + 20, row.y + rowH / 2);

    ctx.font = '800 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = row.win ? palette.green : palette.muted;
    ctx.textAlign = 'right';
    ctx.fillText(row.score, x + rowW, row.y + rowH / 2);
  }
}

export async function renderPlayoffToPng(
  snapshot: TournamentSnapshot,
  themeOverride?: Theme,
): Promise<PlayoffImageResult> {
  const theme = themeOverride ?? currentTheme();
  const palette = PALETTES[theme];
  const { tournament, playoffMatches } = snapshot;

  const bySlot = new Map<string, MatchItem>();
  for (const m of playoffMatches || []) {
    if (m.bracketSlot) bySlot.set(m.bracketSlot, m);
  }

  const rounds = getBracketRounds(playoffMatches || [], tournament.playoffSize || 8);
  const thirdMatch = bySlot.get('THIRD_PLACE') || null;
  const finalMatch = bySlot.get('FINAL') || null;
  const championLabel =
    finalMatch && finalMatch.status === 'FINISHED'
      ? isTeamWinner(finalMatch, 1)
        ? finalMatch.team1Label
        : finalMatch.team2Label
      : null;

  const PADDING = 28;
  const COL_W = 256;
  const GAP_W = 34;
  const CARD_H = 112;
  const BASE_ROW_H = 130;
  const HDR_H = championLabel ? 132 : 84;
  const ROUND_HDR_H = 28;
  const FOOTER_H = 44;
  const showThirdCard = Boolean((tournament.thirdPlaceMatch || thirdMatch) && rounds.length >= 2);
  const THIRD_SECTION_H = showThirdCard ? 150 : 0;

  const firstCount = rounds[0]?.matchCount || 1;
  const treeW = rounds.length * COL_W + Math.max(0, rounds.length - 1) * GAP_W;
  const treeH = firstCount * BASE_ROW_H;

  const logicalW = Math.max(600, treeW + PADDING * 2);
  const logicalH = HDR_H + ROUND_HDR_H + treeH + THIRD_SECTION_H + FOOTER_H + 16;

  const SCALE = 1.5;
  const canvas = document.createElement('canvas');
  canvas.width = logicalW * SCALE;
  canvas.height = logicalH * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable');
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, logicalW, logicalH);

  // Title & subtitle
  ctx.fillStyle = palette.text;
  ctx.font = '800 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    fitText(ctx, `🏆 ${tournament.name || 'Турнир'}`, logicalW - PADDING * 2),
    PADDING,
    30,
  );

  const dateText = formatDateRu(
    tournament.finishedAt ?? tournament.startedAt ?? tournament.createdAt ?? Date.now(),
  );
  ctx.fillStyle = palette.muted;
  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`Сетка плей-офф  •  ${dateText}`, PADDING, 56);

  if (championLabel) {
    drawRoundedRect(ctx, PADDING, 78, logicalW - PADDING * 2, 40, 20);
    ctx.fillStyle = theme === 'dark' ? 'rgba(234, 179, 8, 0.14)' : 'rgba(234, 179, 8, 0.12)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.45)';
    ctx.stroke();

    ctx.fillStyle = palette.gold;
    ctx.font = '800 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(
      fitText(ctx, `🥇 Победители: ${championLabel}`, logicalW - PADDING * 2 - 28),
      PADDING + 14,
      98,
    );
  }

  const startX = Math.max(PADDING, (logicalW - treeW) / 2);
  const roundHdrY = HDR_H + 10;
  const treeY = HDR_H + ROUND_HDR_H;

  // Round headers
  for (let rIdx = 0; rIdx < rounds.length; rIdx += 1) {
    const r = rounds[rIdx];
    const colX = startX + rIdx * (COL_W + GAP_W);
    ctx.fillStyle = palette.muted;
    ctx.font = '700 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.title.toUpperCase(), colX + 4, roundHdrY);
  }

  const getCenterY = (roundIdx: number, matchIdx: number) =>
    treeY + (matchIdx + 0.5) * Math.pow(2, roundIdx) * BASE_ROW_H;

  // Connectors
  for (let rIdx = 0; rIdx < rounds.length - 1; rIdx += 1) {
    const round = rounds[rIdx];
    const nextRound = rounds[rIdx + 1];
    const x1 = startX + rIdx * (COL_W + GAP_W) + COL_W;
    const x2 = startX + (rIdx + 1) * (COL_W + GAP_W);
    const midX = x1 + GAP_W / 2;

    for (let nextIdx = 0; nextIdx < nextRound.matchCount; nextIdx += 1) {
      const topIdx = nextIdx * 2;
      const botIdx = nextIdx * 2 + 1;
      const yTop = getCenterY(rIdx, topIdx);
      const yBot = getCenterY(rIdx, botIdx);
      const yNext = getCenterY(rIdx + 1, nextIdx);

      const topDone = bySlot.get(getSlotKey(round.prefix, topIdx))?.status === 'FINISHED';
      const botDone = bySlot.get(getSlotKey(round.prefix, botIdx))?.status === 'FINISHED';

      ctx.lineWidth = topDone ? 2 : 1.5;
      ctx.strokeStyle = topDone ? palette.accent : palette.lineMuted;
      ctx.beginPath();
      ctx.moveTo(x1, yTop);
      ctx.lineTo(midX, yTop);
      ctx.lineTo(midX, yNext);
      ctx.stroke();

      ctx.lineWidth = botDone ? 2 : 1.5;
      ctx.strokeStyle = botDone ? palette.accent : palette.lineMuted;
      ctx.beginPath();
      ctx.moveTo(x1, yBot);
      ctx.lineTo(midX, yBot);
      ctx.lineTo(midX, yNext);
      ctx.stroke();

      ctx.lineWidth = topDone && botDone ? 2 : 1.5;
      ctx.strokeStyle = topDone && botDone ? palette.accent : palette.lineMuted;
      ctx.beginPath();
      ctx.moveTo(midX, yNext);
      ctx.lineTo(x2, yNext);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(midX, yNext, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = topDone && botDone ? palette.accent : palette.lineMuted;
      ctx.fill();
    }
  }

  // Bracket cards
  for (let rIdx = 0; rIdx < rounds.length; rIdx += 1) {
    const round = rounds[rIdx];
    const left = startX + rIdx * (COL_W + GAP_W);
    for (let mIdx = 0; mIdx < round.matchCount; mIdx += 1) {
      const slotKey = getSlotKey(round.prefix, mIdx);
      const match = bySlot.get(slotKey) || null;
      const top = getCenterY(rIdx, mIdx) - CARD_H / 2;
      drawMatchCard(
        ctx,
        left,
        top,
        COL_W,
        CARD_H,
        match,
        getSlotTitle(round.prefix, mIdx),
        palette,
        round.prefix === 'FINAL',
      );
    }
  }

  // 3rd place match card
  if (showThirdCard) {
    const thirdY = treeY + treeH + 8;
    ctx.fillStyle = palette.muted;
    ctx.font = '700 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('МАТЧ ЗА 3-Е МЕСТО', startX + 4, thirdY + 8);
    drawMatchCard(ctx, startX, thirdY + 24, COL_W, CARD_H, thirdMatch, 'За 3-е место', palette);
  }

  // Brand footer
  const footerY = logicalH - 22;
  ctx.font = '800 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const kickerW = ctx.measureText('кикер').width;
  const sepW = ctx.measureText(' ').width;
  const pickerW = ctx.measureText('пикер').width;
  const totalBrandW = kickerW + sepW + pickerW;
  let bx = logicalW / 2 - totalBrandW / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.accent;
  ctx.fillText('кикер', bx, footerY);
  bx += kickerW + sepW;
  ctx.fillStyle = palette.lime;
  ctx.fillText('пикер', bx, footerY);

  return canvasToPngResult(canvas);
}
