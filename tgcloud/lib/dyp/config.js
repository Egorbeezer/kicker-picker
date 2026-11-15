/**
 * Pure Monster DYP tournament engine:
 * - Penalty-matrix round pairing + fair byes
 * - Leaderboard & configurable tie-breakers (default: Wins, PPM, GD, Games)
 * - Playoff seeding & bracket progression
 * - Score validation (targetScore, winByTwo, maxScore)
 */

export const DEFAULT_TABLE_COLUMNS = [
  { key: 'wins', label: 'Выиграно игр', shortLabel: 'Поб', sort: true, visible: true },
  { key: 'ppm', label: 'Среднее кол-во очков', shortLabel: 'Ср.очк', sort: true, visible: true },
  { key: 'diff', label: 'Разница голов', shortLabel: '+/-', sort: true, visible: true },
  { key: 'games', label: 'Количество игр', shortLabel: 'Игр', sort: true, visible: true },
  { key: 'name', label: 'Название команды', shortLabel: 'Игрок', sort: false, visible: true },
  { key: 'fairPpm', label: 'Справедливые ср. очки', shortLabel: 'ØОч*', sort: false, visible: false },
  { key: 'points', label: 'Очки', shortLabel: 'Очк', sort: false, visible: false },
  { key: 'losses', label: 'Поражения', shortLabel: 'Пор', sort: false, visible: false },
  { key: 'goalsFor', label: 'Забито голов', shortLabel: 'Заб', sort: false, visible: false },
  { key: 'goalsAgainst', label: 'Пропущено голов', shortLabel: 'Проп', sort: false, visible: false },
  { key: 'winRate', label: 'Процент побед', shortLabel: '%Поб', sort: false, visible: false },
  { key: 'buchholz', label: 'Бухгольц (сумма очков соперников)', shortLabel: 'BH₁', sort: false, visible: false },
  { key: 'avgBuchholz', label: 'Средний Бухгольц соперников', shortLabel: 'ØBH', sort: false, visible: false },
  { key: 'sonnebornBerger', label: 'Зоннеборн–Бергер', shortLabel: 'SB', sort: false, visible: false },
];

export function normalizeTableConfig(rawConfig) {
  const defaultsMap = new Map(DEFAULT_TABLE_COLUMNS.map((c) => [c.key, c]));
  if (!Array.isArray(rawConfig) || rawConfig.length === 0) {
    return DEFAULT_TABLE_COLUMNS.map((c) => ({ ...c }));
  }

  const result = [];
  const seen = new Set();
  for (const item of rawConfig) {
    const key = String(item?.key || '');
    const def = defaultsMap.get(key);
    if (!def || seen.has(key)) continue;
    seen.add(key);
    result.push({
      ...def,
      sort: typeof item?.sort === 'boolean' ? item.sort : def.sort,
      visible: typeof item?.visible === 'boolean' ? item.visible : def.visible,
    });
  }
  for (const def of DEFAULT_TABLE_COLUMNS) {
    if (!seen.has(def.key)) {
      result.push({ ...def });
    }
  }
  return result;
}

export const PARTNER_PENALTY = 1000;
export const OPPONENT_PENALTY = 500;
export const SAME_BUCKET_PENALTY = 3000;
export const PARTIAL_BUCKET_PENALTY = 300;

export function shuffleInPlace(arr, randomFn = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pairKey(idA, idB) {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

export function validateMatchScore(score1, score2, rules) {
  if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0) {
    return { valid: false, reason: 'Счет должен быть целым неотрицательным числом' };
  }
  if (score1 === score2) {
    return { valid: false, reason: 'В кикере не может быть ничьей' };
  }

  const winnerScore = Math.max(score1, score2);
  const loserScore = Math.min(score1, score2);
  const target = rules.targetScore ?? 5;
  const winByTwo = Boolean(rules.winByTwo);
  const maxScore = Math.max(target, rules.maxScore ?? target + 2);

  if (winnerScore < target) {
    return { valid: false, reason: `Победитель должен набрать минимум ${target} голов` };
  }

  if (!winByTwo) {
    if (winnerScore > target) {
      return { valid: false, reason: `При игре без баланса максимум голов — ${target}` };
    }
    return { valid: true, winner: score1 > score2 ? 1 : 2 };
  }

  if (winnerScore > maxScore) {
    return { valid: false, reason: `Жесткий лимит голов — ${maxScore}` };
  }

  const diff = winnerScore - loserScore;
  if (winnerScore === maxScore) {
    if (diff < 1) {
      return { valid: false, reason: 'Некорректный счет на лимите' };
    }
    return { valid: true, winner: score1 > score2 ? 1 : 2 };
  }

  if (winnerScore === target && diff >= 2) {
    return { valid: true, winner: score1 > score2 ? 1 : 2 };
  }

  if (winnerScore > target && diff === 2) {
    return { valid: true, winner: score1 > score2 ? 1 : 2 };
  }

  return {
    valid: false,
    reason: `При включенном балансе нужна разница в 2 мяча (или достижение лимита ${maxScore})`,
  };
}

export function pickTableNumber(idx, tablesCount, activeTables) {
  if (Array.isArray(activeTables) && activeTables.length > 0) {
    return activeTables[idx % activeTables.length];
  }
  return (idx % Math.max(1, tablesCount || 1)) + 1;
}
