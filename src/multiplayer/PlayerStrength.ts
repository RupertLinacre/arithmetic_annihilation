export const MIN_PLAYER_STRENGTH = 0.1;
export const MAX_PLAYER_STRENGTH = 1;
export const DEFAULT_PLAYER_STRENGTH = 1;
export const PLAYER_STRENGTH_STEP = 0.1;

export function normalizePlayerStrength(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_PLAYER_STRENGTH;
    }
    const clamped = Math.max(MIN_PLAYER_STRENGTH, Math.min(MAX_PLAYER_STRENGTH, value));
    return Math.round(clamped / PLAYER_STRENGTH_STEP) * PLAYER_STRENGTH_STEP;
}

export function getStrengthAdjustedSpawnPeriodMs(periodMs: number, strength: number): number {
    return periodMs / normalizePlayerStrength(strength);
}
