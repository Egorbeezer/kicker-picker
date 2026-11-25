import { test, expect } from '@playwright/test';
import { attachTelegramBridge, E2eBackendHarness } from './support/tgcloudBridge';

// Валидный 1x1 PNG в data URL для проверки загрузки реального <img> в Chromium Canvas / UI
const SAMPLE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const backend = new E2eBackendHarness();

test.beforeAll(async () => {
  await backend.init();
});

test.beforeEach(() => {
  backend.reset();
});

test.afterAll(async () => {
  await backend.dispose();
});

test.describe('Kicker Picker — Headless Browser E2E (Chromium)', () => {
  test('Home screen: загружает аватар, плавно раскрывает «Мой профиль» и переключает светлую/тёмную темы', async ({
    page,
  }) => {
    const adminUser = {
      id: 100,
      first_name: 'Егор',
      last_name: 'Балагуров',
      username: 'egor_e2e',
      allows_write_to_pm: true,
    };

    // Сидим завершённый турнир с 1 сыгранным матчем, чтобы отображался профиль игрока и аватар
    const created = (await backend.callEndpoint(
      'createTournament',
      { name: 'Кубок Тест', tables: 1, dypMode: 'monster', targetScore: 5, autoRounds: false },
      adminUser
    )) as { tournament: { id: number } };
    const tid = created.tournament.id;
    backend
      .getSqlite()
      .prepare('UPDATE users SET photo_url = ? WHERE tg_id = ?')
      .run(SAMPLE_PNG_DATA_URL, adminUser.id);
    await backend.callEndpoint(
      'addGuestPlayer',
      { tournamentId: tid, names: ['Макс', 'Оля', 'Дима'] },
      adminUser
    );
    const r1 = (await backend.callEndpoint('startRound', { tournamentId: tid }, adminUser)) as {
      currentRoundMatches: Array<{ id: number }>;
    };
    await backend.callEndpoint(
      'submitScore',
      { matchId: r1.currentRoundMatches[0].id, score1: 5, score2: 2, forceAdmin: true },
      adminUser
    );
    await backend.callEndpoint('finishTournament', { tournamentId: tid }, adminUser);

    const bridge = await attachTelegramBridge(page, backend, { user: adminUser });
    await page.goto('/');

    // Переходим на главный экран через кнопку Домой слева в нижнем меню
    const nav = page.getByRole('navigation', { name: 'Навигация' });
    await expect(nav.locator('button').first()).toHaveText(/Домой/);
    await nav.getByRole('button', { name: 'Домой' }).click();
    await expect(page.getByTestId('home-header')).not.toContainText('Главный экран');
    await expect(page.getByTestId('home-header').getByRole('button', { name: /тема/i })).toHaveCount(0);

    const profileCard = page.getByTestId('home-profile-card');
    await expect(profileCard).toBeVisible();
    await expect(profileCard).toHaveAttribute('aria-expanded', 'false');

    // Аватар реально загружен в Chromium
    const avatarImg = profileCard.locator('img[alt="Егор Балагуров"]');
    await expect(avatarImg).toBeVisible();
    const imgLoaded = await avatarImg.evaluate(
      (img: HTMLImageElement) => img.complete && img.naturalWidth > 0
    );
    expect(imgLoaded).toBe(true);

    // Аккордеон свёрнут по умолчанию (высота 0px, opacity 0)
    const details = page.getByTestId('home-profile-details');
    await expect(details).toHaveAttribute('aria-hidden', 'true');
    const collapsedBox = await details.boundingBox();
    expect(collapsedBox?.height ?? 0).toBeLessThanOrEqual(1);

    // Тап раскрывает аккордеон плавно до реальной высоты > 80px и opacity: 1
    await profileCard.click();
    await expect(profileCard).toHaveAttribute('aria-expanded', 'true');
    await expect(details).toHaveAttribute('aria-hidden', 'false');
    await expect
      .poll(async () => {
        const box = await details.boundingBox();
        const op = await details.evaluate((el) => getComputedStyle(el).opacity);
        return (box?.height ?? 0) > 80 && Number(op) > 0.9;
      })
      .toBe(true);

    // Повторный тап плавно сворачивает обратно
    await profileCard.click();
    await expect(profileCard).toHaveAttribute('aria-expanded', 'false');
    await expect
      .poll(async () => (await details.boundingBox())?.height ?? 999)
      .toBeLessThanOrEqual(1);

    // Переключаемся в Профиль игрока и проверяем кнопку переключения темы
    await page.getByRole('button', { name: 'Игрок', exact: true }).click();
    await expect(nav.locator('button').first()).toHaveText(/Домой/);
    await nav.getByRole('button', { name: 'Профиль' }).click();

    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.getByTestId('profile-theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(lightBg).not.toBe(darkBg);

    expect(bridge.consoleErrors).toEqual([]);
    expect(bridge.pageErrors).toEqual([]);
  });

  test('Полный E2E цикл на узком мобильном экране (375×667): создание -> раунд -> PNG Canvas -> скролл статистики турнира', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const bridge = await attachTelegramBridge(page, backend);
    await page.goto('/');

    // 1. Создание турнира (4-шаговый мастер)
    await page.getByRole('button', { name: /Создать новый турнир/i }).click();
    await expect(page.getByText('Шаг 1 из 4')).toBeVisible();
    await page.getByRole('button', { name: 'Далее', exact: true }).click();

    await expect(page.getByText('Шаг 2 из 4')).toBeVisible();
    await expect(page.getByText('Голов до победы', { exact: false })).toBeVisible();
    // По умолчанию выбрано 7 голов в квалификации
    const radio7 = page
      .getByRole('radiogroup', { name: 'Голов до победы' })
      .getByRole('radio', { name: '7', exact: true });
    await expect(radio7).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Далее', exact: true }).click();

    await expect(page.getByText('Шаг 3 из 4')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Best of 3' })).toBeVisible();
    await page.getByRole('button', { name: 'Далее', exact: true }).click();

    await expect(page.getByText('Шаг 4 из 4')).toBeVisible();
    await page.getByRole('button', { name: 'Создать турнир', exact: true }).click();

    // Модалка «Турнир создан!» с кнопкой «Пригласить»
    const createdDialog = page.getByRole('dialog');
    await expect(createdDialog.getByText('Турнир создан!')).toBeVisible();
    await createdDialog.getByRole('button', { name: 'Пригласить', exact: true }).click();
    await expect
      .poll(() => bridge.openedLinks.some((u) => decodeURIComponent(u).includes('?startapp=')))
      .toBe(true);
    await createdDialog.getByRole('button', { name: /Перейти к участникам/i }).click();

    // 2. Добавление 4 гостей
    await page.getByRole('button', { name: /Участники/i }).click();
    await page.getByRole('button', { name: /Добавить участников/i }).click();
    await page.locator('textarea').fill('Макс, Оля, Женя, Дима');
    await page.getByRole('button', { name: 'Добавить (4)' }).click();
    await expect(page.getByText('Активных:')).toBeVisible();

    // 3. Запуск раунда 1 и сохранение счёта
    await page.getByRole('button', { name: /Дашборд/i }).click();
    await page.getByRole('button', { name: /Запустить 1-й раунд/i }).click();
    await expect(page.getByText('Раунд 1', { exact: false })).toBeVisible();

    await page.getByRole('button', { name: /Быстрый счёт/i }).first().click();
    const inlineEditor = page
      .locator('div.space-y-2', {
        has: page.getByRole('button', { name: /Сохранить \d+:\d+/ }),
      })
      .first();
    await inlineEditor.getByRole('button', { name: '7', exact: true }).first().click();
    await inlineEditor.getByRole('button', { name: '2', exact: true }).last().click();
    await inlineEditor.getByRole('button', { name: /Сохранить 7:2/i }).click();

    // 4. Реальный рендер HTML5 Canvas таблицы (PNG превью)
    await page.getByRole('button', { name: /Таблица/i }).click();
    await page.getByTestId('share-table-screenshot-btn').click();
    const previewImg = page.locator('img[alt="Турнирная таблица"]');
    await expect(previewImg).toBeVisible();
    const canvasOk = await previewImg.evaluate(
      (img: HTMLImageElement) => img.complete && img.naturalWidth > 200
    );
    expect(canvasOk).toBe(true);
    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).last().click();

    // 5. Проверка скролла в Профиле -> «Статистика турнира» на узком 375x480 экране
    await page.setViewportSize({ width: 375, height: 480 });
    await page.getByRole('button', { name: 'Игрок', exact: true }).click();
    await page.getByRole('button', { name: /Профиль/i }).click();
    // Единая карточка турнира
    await page.getByRole('button', { name: /Открыть/i }).first().click();

    await expect(page.getByText('Статистика турнира')).toBeVisible();
    const scrollBox = page.getByTestId('profile-tournament-stats-scroll');
    await expect(scrollBox).toBeVisible();

    const scrollMetrics = await scrollBox.evaluate((el) => {
      el.scrollTop = 180;
      return {
        overflowY: getComputedStyle(el).overflowY,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
      };
    });
    expect(scrollMetrics.overflowY).toBe('auto');
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
    expect(scrollMetrics.scrollTop).toBeGreaterThan(0);

    expect(bridge.consoleErrors).toEqual([]);
    expect(bridge.pageErrors).toEqual([]);
  });

  test('Публичный LIVE зрителя (/?live=kp_e2e_1) загружается и рендерит таблицу без Telegram initData', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.route('https://textdb.dev/api/data/kp_e2e_1*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          v: 1,
          updatedAt: Date.now(),
          tournament: {
            id: 777,
            name: 'LIVE Кикер Мастерс',
            status: 'QUALIFICATION',
            currentRound: 1,
            tablesCount: 1,
            dypMode: 'monster',
            targetScore: 7,
            playoffSize: 4,
            playoffFormat: 'best_of_1',
            playoffTargetScore: 5,
            publicPath: 'kp_e2e_1',
          },
          leaderboard: [
            {
              rank: 1,
              playerId: 1,
              name: 'Алиса',
              initials: 'АЛ',
              games: 2,
              wins: 2,
              losses: 0,
              points: 4,
              diff: 6,
              goalsFor: 14,
              goalsAgainst: 8,
              ppm: 2,
              byesCount: 0,
              isActive: true,
            },
          ],
          currentRoundMatches: [
            {
              id: 1,
              stage: 'QUALIFICATION',
              roundNumber: 1,
              tableNumber: 1,
              status: 'PLAYING',
              score1: 3,
              score2: 2,
              setsWon1: 0,
              setsWon2: 0,
              team1Label: 'Алиса & Боб',
              team2Label: 'Вика & Глеб',
              team1Players: [
                { id: 1, name: 'Алиса', initials: 'АЛ', isGuest: false },
                { id: 2, name: 'Боб', initials: 'БО', isGuest: false },
              ],
              team2Players: [
                { id: 3, name: 'Вика', initials: 'ВИ', isGuest: false },
                { id: 4, name: 'Глеб', initials: 'ГЛ', isGuest: false },
              ],
            },
          ],
          playoffMatches: [],
        }),
      });
    });

    await page.goto('/?live=kp_e2e_1');
    await expect(page.getByText('LIVE Кикер Мастерс')).toBeVisible();
    await expect(page.getByText('Алиса & Боб')).toBeVisible();
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('Wise v2 rollout (@egor_beezer): включает data-wise-v2 и проходит по всем новым Wise-экранам без ошибок', async ({
    page,
  }) => {
    const ownerUser = {
      id: 777,
      first_name: 'Егор',
      last_name: 'Балагуров',
      username: 'egor_beezer',
      allows_write_to_pm: true,
    };

    const created = (await backend.callEndpoint(
      'createTournament',
      { name: 'Wise Кубок', tables: 2, dypMode: 'monster', targetScore: 5, autoRounds: false },
      ownerUser
    )) as { tournament: { id: number } };
    const tid = created.tournament.id;
    await backend.callEndpoint(
      'addGuestPlayer',
      { tournamentId: tid, names: ['Макс', 'Оля', 'Дима'] },
      ownerUser
    );
    await backend.callEndpoint('startRound', { tournamentId: tid }, ownerUser);

    const bridge = await attachTelegramBridge(page, backend, { user: ownerUser });
    await page.goto('/');

    // Включён канареечный флаг Wise v2
    await expect(page.locator('html')).toHaveAttribute('data-wise-v2', 'true');

    // 1. Админ: Дашборд
    await expect(page.getByText('Wise Кубок')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Публичная Live-ссылка', exact: true })).toBeVisible();

    // 2. Админ: Участники
    const nav = page.getByRole('navigation', { name: 'Навигация' });
    await nav.getByRole('button', { name: 'Участники' }).click();
    await expect(page.getByText('Активных:')).toBeVisible();
    await page.getByRole('button', { name: 'Действия для Макс' }).click();
    await expect(page.getByRole('dialog').getByText('Переименовать')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).last().click();

    // 3. Админ: Настройки
    await nav.getByRole('button', { name: 'Настройки' }).click();
    await expect(page.getByRole('button', { name: /Сохранить изменения/i })).toBeVisible();

    // 4. Игрок: Профиль и переключение темы
    await page.getByRole('button', { name: 'Игрок', exact: true }).click();
    await nav.getByRole('button', { name: 'Профиль' }).click();
    await page.getByTestId('profile-theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // 5. Домой
    await nav.getByRole('button', { name: 'Домой' }).click();
    await expect(page.getByText('Текущие турниры')).toBeVisible();

    expect(bridge.consoleErrors).toEqual([]);
    expect(bridge.pageErrors).toEqual([]);
  });
});
