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
            getBaseCell: () => BuildableCell;
            getTowerCount: () => number;
            getTowerTypes: () => string[];
            getEnemyCount: () => number;
            getEnemySnapshot: () => { id: number; x: number; y: number; health: number }[];
            getBaseHealth: () => number;
            getElapsedMs: () => number;
            isPaused: () => boolean;
            getSpawnRate: () => string;
            setSpawnRate: (spawnRate: 'veryEasy' | 'easy' | 'medium' | 'hard' | 'veryHard') => void;
            getBaseDifficulty: () => string;
            setBaseDifficulty: (difficulty: string) => void;
            getMusicMuted: () => boolean;
            setMusicMuted: (muted: boolean) => void;
            getMusicVolume: () => number;
            setMusicVolume: (volume: number) => void;
            spawnEnemyNearBase: () => void;
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

test('arithmetic tower defence MVP is playable in the browser', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/?seed=e2e');
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('[data-stat="health"]')).toHaveText(/\d+/);
    await expect(page.locator('[data-stat="base-meter"]')).toBeVisible();
    await expect(page.getByTestId('game-status-message')).toHaveText('Click on a square to place a tower to start game.');
    await expect.poll(() => page.evaluate(() => Boolean(window.arithmeticAnnihilation))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getBaseDifficulty())).toBe('year3');
    await expect.poll(() => new URL(page.url()).searchParams.get('base-difficulty')).toBe('year3');
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

    for (const [key, testId] of [['1', 'select-easy'], ['2', 'select-medium'], ['3', 'select-hard'], ['4', 'select-flamethrower'], ['5', 'select-veryHard'], ['6', 'select-wall'], ['7', 'select-airstrike']] as const) {
        await page.keyboard.press(key);
        await expect(page.getByTestId(testId)).toHaveAttribute('aria-pressed', 'true');
    }

    const baseCell = await page.evaluate(() => window.arithmeticAnnihilation!.getBaseCell());
    await clickGamePoint(page, baseCell.worldX, baseCell.worldY);
    await expect(page.getByTestId('build-popup')).toBeVisible();
    await expect(page.getByTestId('build-popup')).toContainText('Very Hard');
    await page.getByTestId('answer-popup-close').click();
    await expect(page.getByTestId('build-popup')).toBeHidden();

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

    await page.keyboard.press('3');

    const buildable = await page.evaluate(() => window.arithmeticAnnihilation!.getFirstBuildableCell());
    expect(buildable).not.toBeNull();
    await clickGamePoint(page, buildable!.worldX, buildable!.worldY);
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
    const correctAnswer = await page.locator('[data-testid="answer-button"][data-correct="true"]').textContent();
    expect(definitionText).toContain('=');
    await page.locator('[data-testid="answer-button"][data-correct="false"]').first().click();
    await expect(page.getByTestId('build-popup')).toContainText(definitionText ?? '');
    await expect(page.getByTestId('build-popup')).toContainText(`Correct answer: ${correctAnswer}`);
    await expect(page.getByTestId('answer-review-close')).toHaveCount(0);
    const answerReviewInput = page.getByTestId('answer-review-input');
    await expect(answerReviewInput).toBeVisible();
    await expect(answerReviewInput).toBeFocused();
    await clickGamePoint(page, buildable!.worldX, buildable!.worldY);
    await expect(page.getByTestId('build-popup')).toContainText(`Correct answer: ${correctAnswer}`);
    await expect(answerReviewInput).toBeVisible();
    await answerReviewInput.fill('not-the-answer');
    const reviewPausedElapsedMs = await page.evaluate(() => window.arithmeticAnnihilation!.getElapsedMs());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.arithmeticAnnihilation!.getElapsedMs())).toBe(reviewPausedElapsedMs);
    await answerReviewInput.fill(`  ${correctAnswer} `);
    await expect(page.locator('[data-testid="answer-button"]')).toHaveCount(4);
    await page.locator('[data-testid="answer-button"][data-correct="true"]').click();
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.isPaused())).toBe(false);
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getTowerCount())).toBe(1);
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getTowerTypes())).toEqual(['missile']);
    await expect(page.getByTestId('game-status-message')).toHaveText('Click a tower to upgrade, or a blank square to place a new tower.');

    const secondBuildable = await page.evaluate(() => window.arithmeticAnnihilation!.getFirstBuildableCell());
    expect(secondBuildable).not.toBeNull();
    await clickGamePoint(page, secondBuildable!.worldX, secondBuildable!.worldY);
    await expect(page.getByTestId('build-popup')).toBeVisible();
    await expect(page.locator('[data-testid="answer-button"]')).toHaveCount(4);
    await page.locator('[data-testid="answer-button"][data-correct="true"]').click();
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
    await expect.poll(() => page.evaluate(() => Boolean(window.arithmeticAnnihilation))).toBe(true);
    await expect(page.getByTestId('game-over')).toBeHidden();
    await expect(page.locator('[data-stat="health"]')).toHaveText('100');
    await expect.poll(() => page.evaluate(() => window.arithmeticAnnihilation!.getBaseHealth())).toBe(100);
    expect(errors).toEqual([]);
});
