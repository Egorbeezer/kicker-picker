import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';
import { describe, it, expect, afterEach } from 'vitest';
import { installTestDom } from './helpers/dom';
import type { AppStateResponse, TournamentSnapshot } from '../src/types';

const HOOK_NAMES = new Set([
  'useState',
  'useEffect',
  'useLayoutEffect',
  'useMemo',
  'useCallback',
  'useRef',
  'useReducer',
  'useContext',
]);

function containsReturnStatement(node: ts.Node): boolean {
  if (ts.isReturnStatement(node)) return true;
  if (ts.isFunctionLike(node)) return false; // ignore nested callbacks
  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && containsReturnStatement(child)) found = true;
  });
  return found;
}

function getHookCallName(node: ts.CallExpression): string | null {
  if (ts.isIdentifier(node.expression) && HOOK_NAMES.has(node.expression.text)) {
    return node.expression.text;
  }
  if (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'React' &&
    HOOK_NAMES.has(node.expression.name.text)
  ) {
    return node.expression.name.text;
  }
  return null;
}

function findHookViolationsInFunction(fnNode: ts.FunctionLikeDeclarationBase, file: ts.SourceFile): string[] {
  if (!fnNode.body || !ts.isBlock(fnNode.body)) return [];
  const violations: string[] = [];
  let seenTopLevelReturn = false;

  const visitConditional = (node: ts.Node, inConditional: boolean) => {
    if (ts.isFunctionLike(node)) return; // nested helper/effect callback is separate
    if (ts.isCallExpression(node)) {
      const hook = getHookCallName(node);
      if (hook && (inConditional || seenTopLevelReturn)) {
        const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
        violations.push(`${path.basename(file.fileName)}:${line + 1} (${hook})`);
      }
    }
    const nextConditional =
      inConditional ||
      ts.isIfStatement(node) ||
      ts.isSwitchStatement(node) ||
      ts.isConditionalExpression(node) ||
      ts.isForStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node);

    ts.forEachChild(node, (child) => visitConditional(child, nextConditional));
  };

  for (const stmt of fnNode.body.statements) {
    visitConditional(stmt, false);
    if (containsReturnStatement(stmt)) {
      seenTopLevelReturn = true;
    }
  }
  return violations;
}

function makeSnapshot(status: 'QUALIFICATION' | 'FINISHED', isAdmin = false): TournamentSnapshot {
  return {
    tournament: {
      id: 101,
      name: 'Friday Monster DYP',
      creatorTgId: isAdmin ? 42 : 999,
      status,
      currentRound: 2,
      tablesCount: 2,
      autoRounds: true,
      pendingPlayoff: false,
      dypMode: 'monster',
      useBuckets: false,
      targetScore: 5,
      winByTwo: false,
      maxScore: 5,
      playoffSize: 4,
      thirdPlaceMatch: true,
      playoffFormat: 'best_of_1',
      playoffTargetScore: 5,
      playoffWinByTwo: false,
      playoffMaxScore: 5,
      createdAt: Date.UTC(2026, 10, 14, 18, 0),
    },
    isAdmin,
    myPlayerId: 1,
    players: [
      { id: 1, tournamentId: 101, tgId: 42, name: 'Игорь', initials: 'ИГ', isActive: true, isGuest: false, byesCount: 0 },
      { id: 2, tournamentId: 101, tgId: 43, name: 'Антон', initials: 'АН', isActive: true, isGuest: false, byesCount: 0 },
      { id: 3, tournamentId: 101, tgId: 44, name: 'Макс', initials: 'МА', isActive: true, isGuest: false, byesCount: 0 },
      { id: 4, tournamentId: 101, tgId: 45, name: 'Олег', initials: 'ОЛ', isActive: true, isGuest: false, byesCount: 0 },
    ],
    leaderboard: [
      { rank: 1, playerId: 1, tgId: 42, name: 'Игорь', initials: 'ИГ', isActive: true, byesCount: 0, games: 2, wins: 2, points: 4, goalsFor: 10, goalsAgainst: 4, diff: 6, ppm: 2 },
      { rank: 2, playerId: 2, tgId: 43, name: 'Антон', initials: 'АН', isActive: true, byesCount: 0, games: 2, wins: 1, points: 2, goalsFor: 8, goalsAgainst: 7, diff: 1, ppm: 1 },
    ],
    currentRoundMatches: [],
    playoffMatches: [
      {
        id: 1,
        stage: 'PLAYOFF',
        roundNumber: 1,
        bracketSlot: 'FINAL',
        tableNumber: 1,
        team1Players: [
          { id: 1, name: 'Игорь', initials: 'ИГ' },
          { id: 2, name: 'Антон', initials: 'АН' },
        ],
        team2Players: [
          { id: 3, name: 'Макс', initials: 'МА' },
          { id: 4, name: 'Олег', initials: 'ОЛ' },
        ],
        team1Label: 'Игорь / Антон',
        team2Label: 'Макс / Олег',
        status: status === 'FINISHED' ? 'FINISHED' : 'PLAYING',
        score1: status === 'FINISHED' ? 5 : 0,
        score2: status === 'FINISHED' ? 2 : 0,
        setsWon1: status === 'FINISHED' ? 1 : 0,
        setsWon2: 0,
        setsHistory: status === 'FINISHED' ? [{ score1: 5, score2: 2 }] : null,
      },
    ],
    myCurrentMatch: null,
    myHistory: [],
  };
}

describe('App lifecycle & React Hook order regression', () => {
  let cleanupDom: (() => void) | null = null;

  afterEach(() => {
    cleanupDom?.();
    cleanupDom = null;
  });

  it('never calls React hooks conditionally or after early returns in any component', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const files = [
      path.join(srcRoot, 'App.tsx'),
      ...fs
        .readdirSync(path.join(srcRoot, 'components'))
        .filter((f) => f.endsWith('.tsx'))
        .map((f) => path.join(srcRoot, 'components', f)),
    ];

    const violations: string[] = [];
    for (const filePath of files) {
      const sourceText = fs.readFileSync(filePath, 'utf8');
      const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
      ts.forEachChild(sf, (node) => {
        if (ts.isFunctionDeclaration(node) && node.name && /^[A-Z]/.test(node.name.text)) {
          violations.push(...findHookViolationsInFunction(node, sf));
        }
        if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (
              ts.isIdentifier(decl.name) &&
              /^[A-Z]/.test(decl.name.text) &&
              decl.initializer &&
              (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
            ) {
              violations.push(...findHookViolationsInFunction(decl.initializer, sf));
            }
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('transitions loading -> active/finished/home in Telegram WebApp without crashing (white screen regression)', async () => {
    const env = installTestDom();
    cleanupDom = env.cleanup;

    const { default: App } = await import('../src/App');

    // Scenario A: Outside Telegram
    const containerA = document.createElement('div');
    document.body.appendChild(containerA);
    const rootA = createRoot(containerA);
    await act(async () => {
      rootA.render(<App />);
    });
    expect(containerA.textContent).toContain('@kickerpickerbot');
    await act(async () => {
      rootA.unmount();
    });

    // Scenario B: Inside Telegram with FINISHED tournament (exact path that caused hook-order crash)
    let resolveState!: (data: AppStateResponse) => void;
    const finishedSnapshot = makeSnapshot('FINISHED', false);

    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: {
        initData: 'query_id=1&user=%7B%22id%22%3A42%7D&hash=abc',
        initDataUnsafe: { user: { id: 42, first_name: 'Игорь', allows_write_to_pm: true } },
        colorScheme: 'dark',
        ready: () => {},
        expand: () => {},
        HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} },
        Serverless: {
          call: (
            name: string,
            _input: unknown,
            cb: (err: { message?: string } | null, result?: unknown) => void
          ) => {
            if (name === 'getState') {
              resolveState = (data) => cb(null, data);
            }
          },
        },
      },
    };

    const containerB = document.createElement('div');
    document.body.appendChild(containerB);
    const rootB = createRoot(containerB);

    await act(async () => {
      rootB.render(<App />);
    });
    expect(containerB.textContent).toContain('Загрузка турнира...');

    await act(async () => {
      resolveState({
        user: { id: 42, first_name: 'Игорь' },
        tournaments: [finishedSnapshot.tournament],
        tournamentHistory: [
          {
            ...finishedSnapshot.tournament,
            participantsCount: 4,
            myStats: { playerId: 1, rank: 1, games: 2, wins: 2, losses: 0, points: 4, diff: 6, ppm: 2 },
          },
        ],
        activeTournament: finishedSnapshot,
      });
    });

    // Must render finished player view WITH persistent bottom nav dock and Home on the left
    expect(containerB.textContent).toContain('Итоги');
    expect(containerB.textContent).toContain('Таблица');
    expect(containerB.querySelector('.no-dock')).toBeNull();
    const dockButtons = Array.from(containerB.querySelectorAll('nav.dock button'));
    expect(dockButtons.length).toBe(3);
    expect(dockButtons[0]?.textContent).toContain('Домой');

    // Clicking Home in bottom dock detaches FINISHED tournament and hides bottom nav dock
    const homeBtn = dockButtons[0] as HTMLButtonElement;
    await act(async () => {
      homeBtn.click();
    });
    expect(containerB.textContent).toContain('Прошедшие турниры');
    expect(containerB.textContent).toContain('Создать турнир');
    expect(containerB.querySelector('nav.dock')).toBeNull();
    expect(containerB.querySelector('.no-dock')).not.toBeNull();

    await act(async () => {
      rootB.unmount();
    });
  });
});
