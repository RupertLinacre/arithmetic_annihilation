import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../../src/core/SeededRandom';
import { OFFENSE_HEALTH_PER_MINUTE_PER_POINT } from '../../src/multiplayer/BalanceConfig';
import {
    chooseMonsterType,
    getExpectedMonsterHealth,
    getGeneratorHealthPerMinute,
    getGeneratorHealthScale,
    getGeneratorSpawnPeriodMs,
    getGeneratorUpgradeDifficulty,
    getMonsterMix,
} from '../../src/multiplayer/MonsterGenerator';

describe('multiplayer monster generator progression', () => {
    it('keeps the base track Nibble-only and starts the advanced track at Zappers', () => {
        expect(getMonsterMix('nibble', 12).types).toEqual(['scout']);
        expect(getMonsterMix('advanced', 1).types).toEqual(['grunt']);
        expect(getMonsterMix('advanced', 3).types).toEqual(['grunt', 'tank']);
        expect(getMonsterMix('advanced', 6).types).toEqual(['grunt', 'tank', 'titan']);
        expect(getMonsterMix('advanced', 12).types).not.toContain('scout');
    });

    it('adds a fixed amount of health per minute for every question-value point', () => {
        expect(getGeneratorHealthPerMinute('nibble', 1)).toBe(OFFENSE_HEALTH_PER_MINUTE_PER_POINT);
        expect(getGeneratorHealthPerMinute('nibble', 8)).toBe(OFFENSE_HEALTH_PER_MINUTE_PER_POINT * 8);
        expect(getGeneratorHealthPerMinute('advanced', 1)).toBe(OFFENSE_HEALTH_PER_MINUTE_PER_POINT * 2);
        expect(getGeneratorHealthPerMinute('advanced', 8)).toBe(OFFENSE_HEALTH_PER_MINUTE_PER_POINT * 16);
        expect(getGeneratorSpawnPeriodMs('nibble', 1)).toBeCloseTo(
            getExpectedMonsterHealth('nibble', 1) * 60_000 / OFFENSE_HEALTH_PER_MINUTE_PER_POINT,
        );
    });

    it('uses only the base and one-above question levels', () => {
        expect(getGeneratorUpgradeDifficulty('nibble')).toBe('easy');
        expect(getGeneratorUpgradeDifficulty('advanced')).toBe('medium');
        expect(getGeneratorHealthScale('advanced', 'tank')).toBe(1);
        expect(getGeneratorHealthScale('advanced', 'titan')).toBe(1.6);
    });

    it('chooses deterministically from the unlocked advanced mix', () => {
        const first = new SeededRandom('generator-test');
        const second = new SeededRandom('generator-test');
        const firstRun = Array.from({ length: 20 }, () => chooseMonsterType('advanced', 12, first));
        const secondRun = Array.from({ length: 20 }, () => chooseMonsterType('advanced', 12, second));
        expect(firstRun).toEqual(secondRun);
        expect(new Set(firstRun).size).toBeGreaterThan(1);
    });
});
