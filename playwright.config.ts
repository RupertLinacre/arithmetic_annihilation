import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'tests/e2e',
    timeout: 45_000,
    expect: {
        timeout: 10_000,
    },
    use: {
        baseURL: 'http://127.0.0.1:53179',
        viewport: { width: 1280, height: 800 },
        trace: 'on-first-retry',
    },
    webServer: {
        command: 'npm run dev -- --port 53179',
        url: 'http://127.0.0.1:53179/?seed=e2e',
        reuseExistingServer: false,
        timeout: 120_000,
    },
});