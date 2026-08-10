import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../../src/core/SeededRandom';
import {
    INITIAL_ADVANCED_HEALTH_PER_MINUTE,
    INITIAL_NIBBLE_HEALTH_PER_MINUTE,
    OFFENSE_HEALTH_PER_MINUTE_PER_POINT,
} from '../../src/multiplayer/BalanceConfig';
import {
    chooseMonsterType,
    getExpectedMonsterHealth,
    getGeneratorHealthPerMinute,
    getGeneratorHealthScale,
    getGeneratorSpawnPeriodMs,
    getGeneratorUpgradeDifficulty,
    getMonsterMix,
    getTiebreakerHealthMultiplier,
    getWrongAnswerNibbleLevelIncrease,
    MAX_MONSTER_GENERATOR_LEVEL,
    TIEBREAKER_START_MS,
} from '../../src/multiplayer/MonsterGenerator';
import {
    getStrengthAdjustedSpawnPeriodMs,
    normalizePlayerStrength,
} from '../../src/multiplayer/PlayerStrength';

describe('multiplayer monster generator progression', () => {
    it('slows generator cadence in direct proportion to player strength', () => {
        const normalPeriod = getGeneratorSpawnPeriodMs('nibble', 4);
        expect(getStrengthAdjustedSpawnPeriodMs(normalPeriod, 1)).toBe(normalPeriod);
        expect(getStrengthAdjustedSpawnPeriodMs(normalPeriod, 0.5)).toBe(normalPeriod * 2);
        expect(getStrengthAdjustedSpawnPeriodMs(normalPeriod, 0.1)).toBe(normalPeriod * 10);
        expect(normalizePlayerStrength(0.04)).toBe(0.1);
        expect(normalizePlayerStrength(1.8)).toBe(1);
        expect(normalizePlayerStrength(Number.NaN)).toBe(1);
    });

    it('keeps the base track Nibble-only and starts the advanced track at Zappers', () => {
        expect(getMonsterMix('nibble', 12).types).toEqual(['scout']);
        expect(getMonsterMix('advanced', 1).types).toEqual(['grunt']);
        expect(getMonsterMix('advanced', 3).types).toEqual(['grunt', 'tank']);
        expect(getMonsterMix('advanced', 6).types).toEqual(['grunt', 'tank', 'titan']);
        expect(getMonsterMix('advanced', 12).types).not.toContain('scout');
    });

    it('uses a gentle Nibble unlock then adds a fixed amount per later question-value point', () => {
        expect(getGeneratorHealthPerMinute('nibble', 1)).toBe(INITIAL_NIBBLE_HEALTH_PER_MINUTE);
        expect(getGeneratorHealthPerMinute('nibble', 8)).toBe(INITIAL_NIBBLE_HEALTH_PER_MINUTE + OFFENSE_HEALTH_PER_MINUTE_PER_POINT * 7);
        expect(getGeneratorHealthPerMinute('advanced', 1)).toBe(INITIAL_ADVANCED_HEALTH_PER_MINUTE);
        expect(getGeneratorHealthPerMinute('advanced', 8)).toBe(INITIAL_ADVANCED_HEALTH_PER_MINUTE + OFFENSE_HEALTH_PER_MINUTE_PER_POINT * 14);
        expect(getGeneratorSpawnPeriodMs('nibble', 1)).toBeCloseTo(
            getExpectedMonsterHealth('nibble', 1) * 60_000 / INITIAL_NIBBLE_HEALTH_PER_MINUTE,
        );
        expect(getGeneratorHealthPerMinute('advanced', 100)).toBe(INITIAL_ADVANCED_HEALTH_PER_MINUTE + OFFENSE_HEALTH_PER_MINUTE_PER_POINT * 198);
        expect(getGeneratorSpawnPeriodMs('advanced', 100)).toBeGreaterThan(0);
        expect(MAX_MONSTER_GENERATOR_LEVEL).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('applies one third of the former Nibble rate increase for wrong answers', () => {
        expect(getWrongAnswerNibbleLevelIncrease(1)).toBeCloseTo(1 / 3);
        expect(getWrongAnswerNibbleLevelIncrease(2)).toBeCloseTo(2 / 3);
        expect(getGeneratorHealthPerMinute('nibble', getWrongAnswerNibbleLevelIncrease(1))).toBeCloseTo(
            INITIAL_NIBBLE_HEALTH_PER_MINUTE / 3,
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

    it('starts the multiplayer health tie-breaker at ten minutes and keeps increasing it', () => {
        expect(getTiebreakerHealthMultiplier(TIEBREAKER_START_MS - 1)).toBe(1);
        expect(getTiebreakerHealthMultiplier(TIEBREAKER_START_MS)).toBeCloseTo(1.01);
        expect(getTiebreakerHealthMultiplier(TIEBREAKER_START_MS + 60_000)).toBeCloseTo(1.06);
        expect(getTiebreakerHealthMultiplier(TIEBREAKER_START_MS + 10 * 60_000)).toBeCloseTo(1.51);
    });
});
