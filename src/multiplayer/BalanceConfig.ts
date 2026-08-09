import { TOWER_STATS, type TowerLevelStats } from '../config/gameConfig';
import type { TowerDifficulty, TowerState, TowerType } from '../types';

export const OFFENSE_HEALTH_PER_MINUTE_PER_POINT = 300;
export const INITIAL_NIBBLE_HEALTH_PER_MINUTE = 120;
export const INITIAL_ADVANCED_HEALTH_PER_MINUTE = 240;
export const DEFENSE_DAMAGE_PER_MINUTE_PER_POINT = 570;
export const MULTIPLAYER_BASE_HEALTH = 150;

// Multiplayer-only starting points. The level-aware corrections below are calibrated
// against moving waves on generated maps, including travel, misses, line of sight,
// tower avoidance, target saturation, and monsters leaking into the base.
const BASE_MULTIPLAYER_WEAPON_DAMAGE_MULTIPLIER: Record<TowerType, number> = {
    easy: 1.35,
    spray: 1.2,
    missile: 0.52,
    flamethrower: 1.2,
    cluster: 1.1,
    wall: 1,
    airstrike: 1,
};

export function getMultiplayerWeaponDamageMultiplier(type: TowerType, level: number): number {
    if (type === 'spray') {
        return (level <= 4
            ? 1.05 + Math.max(0, level - 1) * 0.065
            : 1.245 + (level - 4) * 0.125) * 1.18;
    }
    if (type === 'missile') {
        if (level === 1) return 0.43;
        if (level === 2) return 0.67;
        return Math.max(0.52, 0.67 - (level - 2) * 0.025);
    }
    if (type === 'flamethrower') {
        return Math.max(0.68, 1.06 - Math.max(0, level - 4) * 0.07);
    }
    if (type === 'cluster') {
        if (level === 1) return 0.685;
        if (level === 2) return 0.83;
        return Math.max(0.685, 0.83 - (level - 2) * 0.0725);
    }
    return BASE_MULTIPLAYER_WEAPON_DAMAGE_MULTIPLIER[type];
}

const HIGH_VALUE_TOWERS = new Set<TowerType>(['missile', 'cluster', 'airstrike']);

export function getMultiplayerTowerQuestionValue(type: TowerType): 1 | 2 {
    return HIGH_VALUE_TOWERS.has(type) ? 2 : 1;
}

export function getMultiplayerTowerQuestionDifficulty(type: TowerType): TowerDifficulty {
    return getMultiplayerTowerQuestionValue(type) === 2 ? 'medium' : 'easy';
}

function scaleCombatStats(type: TowerType, level: number, source: TowerLevelStats): TowerLevelStats {
    if (type === 'wall' || type === 'airstrike') {
        return { ...source };
    }

    const questionValue = getMultiplayerTowerQuestionValue(type);
    const targetDamagePerSecond = DEFENSE_DAMAGE_PER_MINUTE_PER_POINT
        * questionValue
        * level
        * getMultiplayerWeaponDamageMultiplier(type, level)
        / 60;
    if (type === 'flamethrower') {
        return {
            ...source,
            range: Math.min(280, source.range * 1.55),
            threat: source.threat * 0.25,
            flameRotateRate: (source.flameRotateRate ?? 1) * 2.5,
            flameArcRadians: Math.max(0.52, source.flameArcRadians ?? 0.32),
            damage: targetDamagePerSecond * 0.7,
            burnDamagePerSecond: targetDamagePerSecond * 0.3,
        };
    }

    const cooldownMs = type === 'easy'
        ? Math.max(500, source.cooldownMs)
        : type === 'spray'
            ? Math.max(700, source.cooldownMs)
            : type === 'missile' ? Math.max(900, source.cooldownMs) : source.cooldownMs;
    const volleyDamage = targetDamagePerSecond * (cooldownMs / 1000);
    if (type === 'spray') {
        const pelletCount = Math.min(8, Math.max(1, source.pelletCount ?? 1));
        return {
            ...source,
            cooldownMs,
            pelletCount,
            spreadRadians: Math.min(0.54, source.spreadRadians ?? 0.42),
            damage: volleyDamage / pelletCount,
        };
    }
    if (type === 'missile') {
        const missileCount = Math.min(4, Math.max(1, source.missileCount ?? 1));
        return { ...source, cooldownMs, missileCount, damage: volleyDamage / missileCount };
    }
    if (type === 'cluster') {
        const fragmentCount = Math.max(1, source.fragmentCount ?? 1);
        return {
            ...source,
            damage: volleyDamage * 0.55,
            fragmentDamage: volleyDamage * 0.45 / fragmentCount,
        };
    }
    return { ...source, cooldownMs, damage: volleyDamage };
}

export const MULTIPLAYER_TOWER_STATS: Record<TowerType, TowerLevelStats[]> = Object.fromEntries(
    (Object.keys(TOWER_STATS) as TowerType[]).map((type) => [
        type,
        TOWER_STATS[type].map((_stats, index, levels) => {
            const level = index + 1;
            const progressionIndex = Math.min(levels.length - 1, level * getMultiplayerTowerQuestionValue(type) - 1);
            return scaleCombatStats(type, level, levels[progressionIndex]);
        }),
    ]),
) as Record<TowerType, TowerLevelStats[]>;

export function isMultiplayerTower(tower: Pick<TowerState, 'teamId'>): boolean {
    return tower.teamId !== undefined;
}
