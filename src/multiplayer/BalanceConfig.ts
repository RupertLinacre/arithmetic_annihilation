import { TOWER_STATS, type TowerLevelStats } from '../config/gameConfig';
import type { TowerDifficulty, TowerState, TowerType } from '../types';

export const OFFENSE_HEALTH_PER_MINUTE_PER_POINT = 480;
export const DEFENSE_DAMAGE_PER_MINUTE_PER_POINT = 540;

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
    const targetDamagePerSecond = DEFENSE_DAMAGE_PER_MINUTE_PER_POINT * questionValue * level / 60;
    if (type === 'flamethrower') {
        return {
            ...source,
            damage: targetDamagePerSecond * 0.7,
            burnDamagePerSecond: targetDamagePerSecond * 0.3,
        };
    }

    const volleyDamage = targetDamagePerSecond * (source.cooldownMs / 1000);
    if (type === 'spray') {
        return { ...source, damage: volleyDamage / Math.max(1, source.pelletCount ?? 1) };
    }
    if (type === 'missile') {
        return { ...source, damage: volleyDamage / Math.max(1, source.missileCount ?? 1) };
    }
    if (type === 'cluster') {
        const fragmentCount = Math.max(1, source.fragmentCount ?? 1);
        return {
            ...source,
            damage: volleyDamage * 0.55,
            fragmentDamage: volleyDamage * 0.45 / fragmentCount,
        };
    }
    return { ...source, damage: volleyDamage };
}

export const MULTIPLAYER_TOWER_STATS: Record<TowerType, TowerLevelStats[]> = Object.fromEntries(
    (Object.keys(TOWER_STATS) as TowerType[]).map((type) => [
        type,
        TOWER_STATS[type].map((stats, index) => scaleCombatStats(type, index + 1, stats)),
    ]),
) as Record<TowerType, TowerLevelStats[]>;

export function isMultiplayerTower(tower: Pick<TowerState, 'teamId'>): boolean {
    return tower.teamId !== undefined;
}
