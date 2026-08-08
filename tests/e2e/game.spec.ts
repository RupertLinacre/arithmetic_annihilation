import { expect, test, type Page } from '@playwright/test';

interface BuildableCell {
    x: number;
    y: number;
    worldX: number;
    worldY: number;
}

declare global {
    interface Window {
        arithmeticAnnihilation?: {
            getFirstBuildableCell: () => BuildableCell | null;
            getOpponentHalfCell: () => BuildableCell | null;
            getBaseCell: () => BuildableCell;
            getCanvasPointForWorldPoint: (worldX: number, worldY: number) => { x: number; y: number };
            getMapViewportBounds: () => { left: number; top: number; right: number; bottom: number };
            getTowerCount: () => number;
            getTowerTypes: () => string[];
            getEnemyCount: () => number;
            getEnemySnapshot: () => { id: number; x: number; y: number; health: number }[];
            getGeneratorLevel: () => number;
            getGeneratorLevels: () => { solar: number; lunar: number };
            getGeneratorLevelsByTrack: () => Record<'solar' | 'lunar', Record<'nibble' | 'advanced', number>>;
            getMultiplayerResyncCount: () => number;
            isComputerOpponent: () => boolean;
            getTerrainTextureKeys: () => string[];
            getBaseTextureKeys: () => { solar: string; lunar: string };
            getTowerTextureKeys: () => string[];
            getEnemyTextureKeys: () => string[];
            getMultiplayerSeed: () => number;
            finishMultiplayerGame: (winner: 'solar' | 'lunar') => void;
            getBaseHealth: () => number;
            getElapsedMs: () => number;
            isPaused: () => boolean;
            getCurrentQuestionAnswer: () => string | undefined;
            getCurrentQuestionYearLevel: () => string | undefined;
            getSpawnRate: () => string;
            setSpawnRate: (spawnRate: 'veryEasy' | 'easy' | 'medium' | 'hard' | 'veryHard') => void;
            getBaseDifficulty: () => string;
            setBaseDifficulty: (difficulty: string) => void;
            getMobileAnswerMode: () => string;
            setMobileAnswerMode: (answerMode: 'multiple-choice' | 'type-answer') => void;
            getMusicMuted: () => boolean;
            setMusicMuted: (muted: boolean) => void;
            getMusicVolume: () => number;
            setMusicVolume: (volume: number) => void;
            spawnEnemyNearBase: () => void;
            openFirstBuildQuestion: () => boolean;
        };
    }
}

async function clickGamePoint(page: Page, worldX: number, worldY: number): Promise<void> {
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) {
        throw new Error('Canvas was not visible.');
    }
    const size = await canvas.evaluate((element) => ({ width: (element as HTMLCanvasElement).width, height: (element as HTMLCanvasElement).height }));
    await page.mouse.click(box.x + worldX * (box.width / size.width), box.y + worldY * (box.height / size.height));
}

async function startSinglePlayer(page: Page): Promise<void> {
    await expect(page.getByTestId('mode-screen')).toBeVisible();
    await page.getByTestId('single-player-button').click();
    await expect(page.locator('canvas')).toBeVisible();
}

async function clickWorldPoint(page: Page, worldX: number, worldY: number): Promise<void> {
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) {
        throw new Error('Canvas was not visible.');
    }
    const size = await canvas.evaluate((element) => ({ width: (element as HTMLCanvasElement).width, height: (element as HTMLCanvasElement).height }));
    const point = await page.evaluate(
        ([x, y]) => window.arithmeticAnnihilation!.getCanvasPointForWorldPoint(x, y),
        [worldX, worldY] as const,
    );
    await page.mouse.click(box.x + point.x * (box.width / size.width), box.y + point.y * (box.height / size.height));
}

async function enterNumberPadAnswer(page: Page, answer: string): Promise<void> {
    for (const character of answer) {
        const key = character === ',' ? '.' : character;
        await page.locator(`[data-testid="answer-number-key"][data-key="${key}"]`).click();
    }
}

test('arithmetic tower defence MVP is playable in the browser', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/?seed=e2e');
    await startSinglePlayer(page);
    await expect(page.locator('[data-stat="health"]')).toHaveText(/\d+/);
    await expect(page.locator('[data-stat="base-meter"]')).toBeVisible();
    await expect(page.getByTestId('game-status-message')).toHaveText('Click on a square to place a tower to start game.');
    await expect.poll(() => page.evaluate(() => Boolean(window.arithmeticAnnihilation))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getBaseDifficulty())).toBe('year3');
    await expect.poll(() => new URL(page.url()).searchParams.get('base-difficulty')).toBe('year3');
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getMobileAnswerMode())).toBe('multiple-choice');
    await expect.poll(() => new URL(page.url()).searchParams.get('answer-mode')).toBe('multiple-choice');
    await expect(page.getByTestId('music-mute-button')).toBeVisible();
    await expect(page.getByTestId('music-volume-slider')).toBeVisible();

    await page.getByTestId('music-volume-slider').evaluate((element) => {
        const slider = element as HTMLInputElement;
        slider.value = '25';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getMusicVolume())).toBe(0.25);
    await expect.poll(() => new URL(page.url()).searchParams.get('music-volume')).toBe('0.25');
    await page.getByTestId('music-mute-button').click();
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getMusicMuted())).toBe(true);
    await page.getByTestId('music-mute-button').click();
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getMusicMuted())).toBe(false);
    await expect.poll(() => new URL(page.url()).searchParams.get('music-muted')).toBe('false');

    const openSettings = async () => {
        await page.getByTestId('settings-button').click();
        await expect(page.getByTestId('settings-popup')).toBeVisible();
    };
    const waitForGameReady = async () => {
        await page.waitForFunction(() => Boolean(window.arithmeticAnnihilation) && document.querySelector('canvas') !== null);
    };

    await openSettings();
    await page.getByTestId('spawn-rate-select').selectOption('hard');
    await page.waitForFunction(() => window.arithmeticAnnihilation?.getSpawnRate() === 'hard');
    await waitForGameReady();
    await expect.poll(() => new URL(page.url()).searchParams.get('spawn-rate')).toBe('hard');

    await openSettings();
    await page.getByTestId('base-difficulty-select').selectOption('year1');
    await page.waitForFunction(() => window.arithmeticAnnihilation?.getBaseDifficulty() === 'year1');
    await waitForGameReady();
    await expect.poll(() => new URL(page.url()).searchParams.get('base-difficulty')).toBe('year1');

    await openSettings();
    await page.getByTestId('base-difficulty-select').selectOption('year6');
    await page.waitForFunction(() => window.arithmeticAnnihilation?.getBaseDifficulty() === 'year6');
    await waitForGameReady();
    await expect.poll(() => new URL(page.url()).searchParams.get('base-difficulty')).toBe('year6');

    await openSettings();
    await expect(page.getByTestId('answer-mode-select')).toHaveValue('multiple-choice');
    await page.getByTestId('answer-mode-select').selectOption('type-answer');
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getMobileAnswerMode())).toBe('type-answer');
    await expect.poll(() => new URL(page.url()).searchParams.get('answer-mode')).toBe('type-answer');
    await page.getByTestId('answer-mode-select').selectOption('multiple-choice');
    await expect.poll(() => new URL(page.url()).searchParams.get('answer-mode')).toBe('multiple-choice');
    await page.getByTestId('settings-button').click();
    await expect(page.getByTestId('settings-popup')).toBeHidden();

    const screenshot = await page.locator('canvas').screenshot();
    expect(screenshot.byteLength).toBeGreaterThan(1000);

    await expect(page.locator('[data-testid="bottom-panel"]')).toHaveClass(/is-open/);
    await page.getByTestId('panel-toggle').click();
    await expect(page.locator('[data-testid="bottom-panel"]')).not.toHaveClass(/is-open/);
    await page.getByTestId('panel-toggle').click();
    await expect(page.locator('[data-testid="bottom-panel"]')).toHaveClass(/is-open/);

    await expect(page.getByTestId('panel-row-title')).toHaveText('Select which tower');
    await expect(page.getByTestId('select-hard')).toContainText('Homing missile');
    await expect(page.getByTestId('select-airstrike')).toContainText('Airstrike');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.isPaused())).toBe(true);
    const pausedElapsedMs = await page.evaluate(() => window.arithmeticAnnihilation!.getElapsedMs());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.arithmeticAnnihilation!.getElapsedMs())).toBe(pausedElapsedMs);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-overlay')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.isPaused())).toBe(false);

    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getElapsedMs())).toBeGreaterThan(3200);
    expect(await page.evaluate(() => window.arithmeticAnnihilation!.getEnemyCount())).toBe(0);

    await page.getByTestId('select-hard').click();

    const buildable = await page.evaluate(() => window.arithmeticAnnihilation!.getFirstBuildableCell());
    expect(buildable).not.toBeNull();
    await clickWorldPoint(page, buildable!.worldX, buildable!.worldY);
    await expect(page.getByTestId('build-popup')).toBeVisible();
    await expect(page.getByTestId('build-popup')).toContainText('Hard');
    await expect(page.getByTestId('pause-overlay')).toBeHidden();
    await expect(page.getByTestId('game-status-message')).toContainText('Game paused');
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.isPaused())).toBe(true);
    const questionPausedElapsedMs = await page.evaluate(() => window.arithmeticAnnihilation!.getElapsedMs());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.arithmeticAnnihilation!.getElapsedMs())).toBe(questionPausedElapsedMs);
    await expect(page.locator('[data-testid="build-popup"] .definition')).toBeVisible();
    await expect(page.getByText('Pick the word')).toHaveCount(0);
    const definitionText = await page.locator('[data-testid="build-popup"] .definition').textContent();
    const correctAnswer = await page.evaluate(() => window.arithmeticAnnihilation!.getCurrentQuestionAnswer());
    expect(correctAnswer).toBeTruthy();
    expect(definitionText).toContain('=');
    await expect(page.locator('[data-testid="answer-button"]')).toHaveCount(0);
    const answerInput = page.getByTestId('answer-input');
    await expect(answerInput).toBeVisible();
    await expect(answerInput).toBeFocused();
    await answerInput.fill('not-the-answer');
    await answerInput.press('Enter');
    await expect(page.getByTestId('build-popup')).toContainText(definitionText ?? '');
    await expect(page.getByTestId('build-popup')).toContainText(`Incorrect — correct answer: ${correctAnswer}`);
    await expect(page.getByTestId('build-popup')).toContainText('Type the correct answer to continue.');
    await expect(page.getByTestId('answer-review-close')).toHaveCount(0);
    const reviewInput = page.getByTestId('answer-review-input');
    await expect(reviewInput).toBeVisible();
    await expect(reviewInput).toBeFocused();
    await expect(page.getByTestId('answer-number-pad')).toHaveCount(0);
    await clickWorldPoint(page, buildable!.worldX, buildable!.worldY);
    await expect(page.getByTestId('build-popup')).toContainText(`Incorrect — correct answer: ${correctAnswer}`);
    const wrongDigit = correctAnswer === '9' ? '8' : '9';
    await reviewInput.fill(wrongDigit);
    await expect(reviewInput).toHaveValue(wrongDigit);
    await reviewInput.fill('');
    const reviewPausedElapsedMs = await page.evaluate(() => window.arithmeticAnnihilation!.getElapsedMs());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.arithmeticAnnihilation!.getElapsedMs())).toBe(reviewPausedElapsedMs);
    await reviewInput.fill(correctAnswer!);
    await expect(page.locator('[data-testid="answer-button"]')).toHaveCount(0);
    await expect(page.getByTestId('answer-input')).toBeVisible();
    const nextCorrectAnswer = await page.evaluate(() => window.arithmeticAnnihilation!.getCurrentQuestionAnswer());
    expect(nextCorrectAnswer).toBeTruthy();
    await page.getByTestId('answer-input').fill(` ${nextCorrectAnswer} `);
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.isPaused())).toBe(false);
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getTowerCount())).toBe(1);
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getTowerTypes())).toEqual(['missile']);
    await expect(page.getByTestId('game-status-message')).toHaveText('Click a tower to upgrade, or a blank square to place a new tower.');

    const secondBuildable = await page.evaluate(() => window.arithmeticAnnihilation!.getFirstBuildableCell());
    expect(secondBuildable).not.toBeNull();
    await clickGamePoint(page, secondBuildable!.worldX, secondBuildable!.worldY);
    await expect(page.getByTestId('build-popup')).toBeVisible();
    await expect(page.locator('[data-testid="answer-button"]')).toHaveCount(0);
    const secondCorrectAnswer = await page.evaluate(() => window.arithmeticAnnihilation!.getCurrentQuestionAnswer());
    expect(secondCorrectAnswer).toBeTruthy();
    const secondAnswerInput = page.getByTestId('answer-input');
    await secondAnswerInput.fill(secondCorrectAnswer!);
    await secondAnswerInput.press('Enter');
    await expect(page.getByTestId('build-popup').locator('.feedback.good', { hasText: 'Correct' })).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getTowerTypes())).toEqual(['missile', 'missile']);

    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getEnemyCount())).toBeGreaterThan(0);
    const firstEnemyPosition = await page.evaluate(() => window.arithmeticAnnihilation!.getEnemySnapshot()[0]);
    await expect.poll(async () => {
        const enemy = await page.evaluate((id) => window.arithmeticAnnihilation!.getEnemySnapshot().find((item) => item.id === id), firstEnemyPosition.id);
        if (!enemy) {
            return true;
        }
        return Math.hypot(enemy.x - firstEnemyPosition.x, enemy.y - firstEnemyPosition.y) > 2;
    }).toBe(true);

    const healthBefore = await page.evaluate(() => window.arithmeticAnnihilation!.getBaseHealth());
    await page.evaluate(() => window.arithmeticAnnihilation!.spawnEnemyNearBase());
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getBaseHealth())).toBeLessThan(healthBefore);
    await expect(page.locator('#hud')).toHaveClass(/base-hit/);

    await page.evaluate(() => {
        for (let index = 0; index < 30; index += 1) {
            window.arithmeticAnnihilation!.spawnEnemyNearBase();
        }
    });
    await expect(page.getByTestId('game-over')).toBeVisible();
    await expect(page.getByTestId('restart-game-button')).toBeVisible();
    await page.getByTestId('restart-game-button').click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(window.arithmeticAnnihilation))).toBe(true);
    await expect(page.getByTestId('game-over')).toBeHidden();
    await expect(page.locator('[data-stat="health"]')).toHaveText('100');
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getBaseHealth())).toBe(100);
    expect(errors).toEqual([]);
});

test('mobile answer flow keeps choices and uses an in-game correction number pad', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 1 });
        Object.defineProperty(window, 'ontouchstart', { configurable: true, value: null });
        const originalMatchMedia = window.matchMedia.bind(window);
        window.matchMedia = (query: string) => {
            if (query === '(pointer: coarse)' || query === '(hover: none)') {
                return {
                    matches: true,
                    media: query,
                    onchange: null,
                    addListener: () => undefined,
                    removeListener: () => undefined,
                    addEventListener: () => undefined,
                    removeEventListener: () => undefined,
                    dispatchEvent: () => false,
                } as MediaQueryList;
            }
            return originalMatchMedia(query);
        };
    });

    await page.goto('/?seed=e2e-mobile&answer-mode=multiple-choice');
    await expect(page.locator('html')).toHaveClass(/is-mobile/);
    const splashSize = await page.getByTestId('mode-screen').evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
    }));
    expect(splashSize.scrollHeight).toBeLessThanOrEqual(splashSize.clientHeight);
    expect(splashSize.overflowY).toBe('auto');

    await page.getByTestId('two-player-button').click();
    await expect(page.locator('[data-multiplayer-setup]')).toBeVisible();
    const multiplayerSetupSize = await page.getByTestId('mode-screen').evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
    }));
    expect(multiplayerSetupSize.scrollHeight).toBeLessThanOrEqual(multiplayerSetupSize.clientHeight);
    await page.locator('[data-mode-back]').click();

    await startSinglePlayer(page);
    await expect.poll(() => page.evaluate(() => Boolean(window.arithmeticAnnihilation))).toBe(true);
    const mobileLayout = await page.evaluate(() => ({
        frameTop: document.querySelector('#game-frame')!.getBoundingClientRect().top,
        canvasTop: document.querySelector('canvas')!.getBoundingClientRect().top,
        towerIconHeight: document.querySelector('[data-testid="select-easy"] .tower-selector-image')!.getBoundingClientRect().height,
    }));
    expect(mobileLayout.frameTop).toBe(0);
    expect(mobileLayout.canvasTop).toBe(0);
    expect(mobileLayout.towerIconHeight).toBeGreaterThanOrEqual(37);
    const mapBounds = await page.evaluate(() => window.arithmeticAnnihilation!.getMapViewportBounds());
    expect(mapBounds.left).toBeGreaterThanOrEqual(0);
    expect(mapBounds.top).toBeGreaterThanOrEqual(-0.5);
    expect(mapBounds.top).toBeLessThanOrEqual(0.5);
    expect(mapBounds.right).toBeLessThanOrEqual(1280);
    expect(mapBounds.bottom).toBeLessThanOrEqual(800);

    expect(await page.evaluate(() => window.arithmeticAnnihilation!.openFirstBuildQuestion())).toBe(true);
    await expect(page.getByTestId('build-popup')).toBeVisible();
    await expect(page.locator('[data-testid="answer-button"]')).toHaveCount(4);
    await expect(page.getByTestId('answer-input')).toHaveCount(0);

    const correctAnswer = await page.evaluate(() => window.arithmeticAnnihilation!.getCurrentQuestionAnswer());
    expect(correctAnswer).toBeTruthy();
    await page.locator('[data-testid="answer-button"][data-correct="false"]').first().click();
    await expect(page.getByTestId('build-popup')).toContainText(`Incorrect — correct answer: ${correctAnswer}`);
    await expect(page.getByTestId('answer-number-pad')).toBeVisible();
    await expect(page.getByTestId('answer-review-input')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement instanceof HTMLInputElement)).toBe(false);
    await enterNumberPadAnswer(page, correctAnswer!);
    await expect(page.locator('[data-testid="answer-button"]')).toHaveCount(4);
    await expect(page.getByTestId('answer-input')).toHaveCount(0);

    await page.getByTestId('answer-popup-close').click();
    await page.getByTestId('settings-button').click();
    await expect(page.getByTestId('settings-popup')).toBeVisible();
    await page.getByTestId('answer-mode-select').selectOption('type-answer');
    await expect.poll(() => new URL(page.url()).searchParams.get('answer-mode')).toBe('type-answer');
    await page.getByTestId('settings-button').click();
    expect(await page.evaluate(() => window.arithmeticAnnihilation!.openFirstBuildQuestion())).toBe(true);
    await expect(page.locator('[data-testid="answer-button"]')).toHaveCount(0);
    await expect(page.getByTestId('answer-number-pad')).toBeVisible();
    await expect(page.getByTestId('answer-review-input')).toHaveCount(0);
    const typedAnswer = await page.evaluate(() => window.arithmeticAnnihilation!.getCurrentQuestionAnswer());
    expect(typedAnswer).toBeTruthy();
    await enterNumberPadAnswer(page, typedAnswer!);
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getTowerCount())).toBe(1);
    await expect(page.locator('[data-testid="answer-number-key"][data-key="submit"]')).toHaveCount(0);
});

test('versus computer starts a local multiplayer battle with opponent visuals', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto('/');
    await page.getByTestId('two-player-button').click();
    await expect(page.getByTestId('computer-match-button')).toBeVisible();
    await page.getByTestId('computer-match-button').click();
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(window.arithmeticAnnihilation))).toBe(true);
    expect(await page.evaluate(() => window.arithmeticAnnihilation!.isComputerOpponent())).toBe(true);
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getTowerCount())).toBe(1);
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getGeneratorLevels().lunar)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getEnemyCount())).toBeGreaterThan(0);

    const visualKeys = await page.evaluate(() => ({
        terrain: window.arithmeticAnnihilation!.getTerrainTextureKeys(),
        bases: window.arithmeticAnnihilation!.getBaseTextureKeys(),
        towers: window.arithmeticAnnihilation!.getTowerTextureKeys(),
        enemies: window.arithmeticAnnihilation!.getEnemyTextureKeys(),
    }));
    expect(visualKeys.terrain.every((key) => !key.startsWith('team-'))).toBe(true);
    expect(visualKeys.bases.solar).toBe('sprites/generated/base_blue.png');
    expect(visualKeys.bases.lunar).toBe('sprites/generated/base_red.png');
    expect(visualKeys.towers.every((key) => key.startsWith('sprites/generated/tower_red_'))).toBe(true);
    expect(visualKeys.enemies.every((key) => key.startsWith('sprites/generated/monster_red_'))).toBe(true);
    await expect(page.getByText('YOU · BLUE')).toHaveCount(0);
    await expect(page.getByText('OPPONENT · RED')).toHaveCount(0);

    const opponentCell = await page.evaluate(() => window.arithmeticAnnihilation!.getOpponentHalfCell());
    expect(opponentCell).not.toBeNull();
    await clickWorldPoint(page, opponentCell!.worldX, opponentCell!.worldY);
    await expect(page.getByTestId('game-status-message')).toHaveText("BLUE SIDE ONLY — you're blue, so build on your side of the map.");
    expect(errors).toEqual([]);
});

test('two players share scheduled actions and continue simulating locally', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const host = await context.newPage();
    const guest = await context.newPage();
    const errors: string[] = [];
    for (const page of [host, guest]) {
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
            if (message.type() === 'error') errors.push(message.text());
        });
    }

    await host.goto('/');
    await host.getByTestId('two-player-button').click();
    await host.getByTestId('create-match-button').click();
    const code = (await host.locator('[data-invite-code]').textContent())!.trim();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    await guest.goto('/');
    await guest.getByTestId('two-player-button').click();
    await guest.locator('[name="player-name"]').fill('Guest');
    await guest.locator('[name="invite-code"]').fill(code);
    await guest.getByTestId('join-match-button').click();

    await expect(host.locator('[data-start-match]')).toBeEnabled({ timeout: 20_000 });
    await host.locator('[data-start-match]').click();
    await expect(host.locator('canvas')).toBeVisible({ timeout: 20_000 });
    await expect(guest.locator('canvas')).toBeVisible({ timeout: 20_000 });
    await expect(host.locator('[data-generator-button]')).toHaveCount(2);
    await expect(guest.locator('[data-generator-button]')).toHaveCount(2);
    await expect(host.locator('[data-generator-track="nibble"]')).toBeVisible();
    await expect(host.locator('[data-generator-track="advanced"]')).toBeVisible();
    await expect(host.locator('.difficulty-selector-row > button').first()).toHaveAttribute('data-generator-button', '');
    await expect(host.getByTestId('select-wall')).toBeVisible();
    await expect(host.getByTestId('select-airstrike')).toBeVisible();
    await expect(host.locator('[data-stat="rival-base-status"]')).toBeVisible();
    await expect(guest.locator('[data-stat="rival-base-status"]')).toBeVisible();

    const hostBases = await host.evaluate(() => window.arithmeticAnnihilation!.getBaseTextureKeys());
    const guestBases = await guest.evaluate(() => window.arithmeticAnnihilation!.getBaseTextureKeys());
    expect(hostBases.solar).toBe('sprites/generated/base_blue.png');
    expect(hostBases.lunar).toBe('sprites/generated/base_red.png');
    expect(guestBases.solar).toBe('sprites/generated/base_red.png');
    expect(guestBases.lunar).toBe('sprites/generated/base_blue.png');

    await expect.poll(() => guest.evaluate(() => Boolean(window.arithmeticAnnihilation))).toBe(true);
    const guestCell = await guest.evaluate(() => window.arithmeticAnnihilation!.getFirstBuildableCell());
    expect(guestCell).not.toBeNull();
    expect(guestCell!.x).toBeGreaterThanOrEqual(12);
    await clickWorldPoint(guest, guestCell!.worldX, guestCell!.worldY);
    const answer = await guest.evaluate(() => window.arithmeticAnnihilation!.getCurrentQuestionAnswer());
    expect(answer).toBeTruthy();
    await guest.getByTestId('answer-input').fill(answer!);
    await expect.poll(() => host.evaluate(() => window.arithmeticAnnihilation!.getTowerCount()), { timeout: 20_000 }).toBe(1);
    await expect.poll(() => guest.evaluate(() => window.arithmeticAnnihilation!.getTowerCount()), { timeout: 20_000 }).toBe(1);

    const hostCell = await host.evaluate(() => window.arithmeticAnnihilation!.getFirstBuildableCell());
    expect(hostCell).not.toBeNull();
    expect(hostCell!.x).toBeLessThan(12);
    await clickWorldPoint(host, hostCell!.worldX, hostCell!.worldY);
    const hostAnswer = await host.evaluate(() => window.arithmeticAnnihilation!.getCurrentQuestionAnswer());
    await host.getByTestId('answer-input').fill(hostAnswer!);
    await expect.poll(() => host.evaluate(() => window.arithmeticAnnihilation!.getTowerCount()), { timeout: 20_000 }).toBe(2);
    await expect.poll(() => guest.evaluate(() => window.arithmeticAnnihilation!.getTowerCount()), { timeout: 20_000 }).toBe(2);

    const enemyCountBefore = await host.evaluate(() => window.arithmeticAnnihilation!.getEnemyCount());
    await host.locator('[data-generator-track="nibble"]').click();
    await expect.poll(() => host.evaluate(() => window.arithmeticAnnihilation!.getCurrentQuestionYearLevel())).toBe('year3');
    const generatorAnswer = await host.evaluate(() => window.arithmeticAnnihilation!.getCurrentQuestionAnswer());
    await host.getByTestId('answer-input').fill(generatorAnswer!);
    await expect.poll(() => host.evaluate(() => window.arithmeticAnnihilation!.getGeneratorLevel()), { timeout: 20_000 }).toBe(1);
    await expect.poll(() => host.evaluate(() => window.arithmeticAnnihilation!.getGeneratorLevelsByTrack().solar.nibble), { timeout: 20_000 }).toBe(1);
    await expect.poll(() => host.evaluate(() => window.arithmeticAnnihilation!.getEnemyCount()), { timeout: 20_000 }).toBeGreaterThan(enemyCountBefore);
    await expect.poll(() => guest.evaluate(() => window.arithmeticAnnihilation!.getEnemyCount()), { timeout: 20_000 }).toBeGreaterThan(enemyCountBefore);

    await host.locator('[data-generator-track="advanced"]').click();
    await expect.poll(() => host.evaluate(() => window.arithmeticAnnihilation!.getCurrentQuestionYearLevel())).toBe('year4');
    const advancedGeneratorAnswer = await host.evaluate(() => window.arithmeticAnnihilation!.getCurrentQuestionAnswer());
    await host.getByTestId('answer-input').fill(advancedGeneratorAnswer!);
    await expect.poll(() => host.evaluate(() => window.arithmeticAnnihilation!.getGeneratorLevelsByTrack().solar.advanced), { timeout: 20_000 }).toBe(1);
    await expect.poll(() => guest.evaluate(() => window.arithmeticAnnihilation!.getElapsedMs()), { timeout: 5_000 }).toBeGreaterThan(2_200);
    expect(await guest.evaluate(() => window.arithmeticAnnihilation!.getMultiplayerResyncCount())).toBe(0);

    const firstRoundSeed = await host.evaluate(() => window.arithmeticAnnihilation!.getMultiplayerSeed());
    await host.evaluate(() => window.arithmeticAnnihilation!.finishMultiplayerGame('solar'));
    await expect(host.getByTestId('game-over')).toBeVisible();
    await expect(guest.getByTestId('game-over')).toBeVisible();
    await guest.getByTestId('restart-game-button').click();
    await expect(host.getByTestId('game-over')).toBeHidden();
    await expect(guest.getByTestId('game-over')).toBeHidden();
    await expect.poll(() => host.evaluate(() => window.arithmeticAnnihilation!.getMultiplayerSeed())).not.toBe(firstRoundSeed);
    await expect.poll(async () => {
        const hostSeed = await host.evaluate(() => window.arithmeticAnnihilation!.getMultiplayerSeed());
        const guestSeed = await guest.evaluate(() => window.arithmeticAnnihilation!.getMultiplayerSeed());
        return hostSeed === guestSeed;
    }).toBe(true);
    await expect.poll(() => host.evaluate(() => window.arithmeticAnnihilation!.getTowerCount())).toBe(0);
    await expect.poll(() => guest.evaluate(() => window.arithmeticAnnihilation!.getTowerCount())).toBe(0);
    expect(errors).toEqual([]);

    const guestElapsedBeforeDisconnect = await guest.evaluate(() => window.arithmeticAnnihilation!.getElapsedMs());
    await host.close();
    await expect.poll(
        () => guest.evaluate(() => window.arithmeticAnnihilation!.getElapsedMs()),
        { timeout: 5_000 },
    ).toBeGreaterThan(guestElapsedBeforeDisconnect + 400);

    await context.close();
});
