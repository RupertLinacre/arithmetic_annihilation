/* Mobile (landscape, touch) layout for the Arithmetic Annihilation PWA.
 * Desktop is left completely untouched: none of this runs unless the device
 * is detected as a coarse-pointer touch device. */

let cachedIsMobile: boolean | undefined;

export function isMobileLayout(): boolean {
    if (cachedIsMobile !== undefined) {
        return cachedIsMobile;
    }
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        cachedIsMobile = false;
        return cachedIsMobile;
    }
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const noHover = window.matchMedia?.('(hover: none)').matches ?? false;
    const hasTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    cachedIsMobile = hasTouch && (coarsePointer || noHover);
    return cachedIsMobile;
}

/**
 * Reorganises the existing DOM into a landscape mobile layout: the Phaser map
 * fills the left of the screen and a single right-hand info panel hosts the HUD,
 * status messages, controls, tower picker, and the contextual question/answer panel.
 */
export class MobileLayout {
    private readonly frame = document.querySelector<HTMLElement>('#game-frame')!;
    private readonly sidePanel: HTMLElement;
    private readonly infoHost: HTMLElement;
    private settingsPopup?: HTMLElement;

    constructor() {
        document.documentElement.classList.add('is-mobile');

        this.sidePanel = document.createElement('aside');
        this.sidePanel.id = 'side-panel';
        this.sidePanel.className = 'side-panel';
        this.sidePanel.setAttribute('aria-label', 'Game panel');

        const hudSlot = document.createElement('div');
        hudSlot.className = 'side-hud';

        this.infoHost = document.createElement('div');
        this.infoHost.className = 'side-info';
        this.infoHost.dataset.sideInfo = '';

        this.sidePanel.append(hudSlot, this.infoHost);
        this.frame.append(this.sidePanel);

        // Relocate existing controls/HUD/status into the side panel.
        const hud = document.querySelector<HTMLElement>('#hud');
        if (hud) {
            hudSlot.append(hud);
            const settingsButton = document.querySelector<HTMLButtonElement>('[data-testid="settings-button"]');
            if (settingsButton) {
                hud.prepend(settingsButton);
            }
        }
        const status = document.querySelector<HTMLElement>('[data-testid="game-status-message"]');
        if (status) {
            this.infoHost.append(status);
        }
        const towerPanel = document.querySelector<HTMLElement>('[data-testid="bottom-panel"]');
        if (towerPanel) {
            this.infoHost.append(towerPanel);
        }

        this.installOrientationWatch();
    }

    getInfoHost(): HTMLElement {
        return this.infoHost;
    }

    attachSettingsPopup(popup: HTMLElement): void {
        this.settingsPopup = popup;
        this.infoHost.append(popup);
    }

    setSettingsOpen(open: boolean): void {
        this.infoHost.classList.toggle('is-showing-settings', open);
        if (this.settingsPopup) {
            this.settingsPopup.hidden = !open;
        }
    }

    setQuestionActive(active: boolean): void {
        document.documentElement.classList.toggle('is-question-active', active);
    }

    private installOrientationWatch(): void {
        const update = () => {
            const portrait = window.matchMedia('(orientation: portrait)').matches;
            document.documentElement.classList.toggle('is-portrait', portrait);
        };
        update();
        window.addEventListener('resize', update);
        window.addEventListener('orientationchange', update);
    }
}
