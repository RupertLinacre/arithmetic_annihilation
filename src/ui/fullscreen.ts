import { isMobileLayout } from './mobile';

const FULLSCREEN_BUTTON_SELECTOR = '[data-testid="fullscreen-button"]';
const FULLSCREEN_STATUS_SELECTOR = '[data-fullscreen-status]';

export function isFullscreenSupported(): boolean {
    return typeof document !== 'undefined'
        && typeof document.documentElement.requestFullscreen === 'function'
        && typeof document.exitFullscreen === 'function';
}

export function isStandaloneDisplayMode(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return false;
    }
    const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
    return standaloneNavigator.standalone === true
        || window.matchMedia?.('(display-mode: standalone)').matches === true
        || window.matchMedia?.('(display-mode: fullscreen)').matches === true;
}

export async function enterFullscreen(): Promise<boolean> {
    if (!isFullscreenSupported() || document.fullscreenElement) {
        return false;
    }
    try {
        await document.documentElement.requestFullscreen();
        return true;
    } catch {
        return false;
    }
}

export async function toggleFullscreen(): Promise<boolean> {
    if (!isFullscreenSupported()) {
        return false;
    }
    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
        } else {
            await document.documentElement.requestFullscreen();
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Mobile browsers only allow fullscreen from a user gesture. Call this directly
 * from a click handler that commits the player to starting or joining a match.
 */
export function enterMobileBrowserFullscreen(): void {
    if (!isMobileLayout() || isStandaloneDisplayMode()) {
        return;
    }
    void enterFullscreen();
}

export function setupFullscreenControl(): void {
    const button = document.querySelector<HTMLButtonElement>(FULLSCREEN_BUTTON_SELECTOR);
    const status = document.querySelector<HTMLElement>(FULLSCREEN_STATUS_SELECTOR);
    if (!button) {
        return;
    }

    const sync = () => {
        const supported = isFullscreenSupported();
        const active = document.fullscreenElement !== null;
        button.disabled = !supported;
        button.textContent = !supported
            ? 'Fullscreen unavailable'
            : active ? 'Exit fullscreen' : 'Enter fullscreen';
        button.setAttribute('aria-pressed', String(active));
        if (status) {
            status.hidden = supported;
        }
    };

    button.addEventListener('click', () => {
        void toggleFullscreen().then(sync);
    });
    document.addEventListener('fullscreenchange', sync);
    sync();
}
