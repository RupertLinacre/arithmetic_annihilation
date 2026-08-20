import { GAME_CONFIG } from './gameConfig';

export const PEN_CAPACITY_URL_KEY = 'pen-capacity';
export const PEN_CAPACITY_STORAGE_KEY = 'arithmetic-annihilation:pen-capacity';

export function normalizePenCapacity(value: string | number | null | undefined): number {
    const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed)) {
        return GAME_CONFIG.pen.maxMonsters;
    }
    return Math.max(GAME_CONFIG.pen.minMonsters, Math.min(GAME_CONFIG.pen.maxConfigurableMonsters, Math.round(parsed)));
}

export function readSavedPenCapacity(): number {
    const urlValue = new URLSearchParams(window.location.search).get(PEN_CAPACITY_URL_KEY);
    return normalizePenCapacity(urlValue ?? window.localStorage.getItem(PEN_CAPACITY_STORAGE_KEY));
}
