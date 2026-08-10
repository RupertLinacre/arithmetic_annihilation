import { describe, expect, it } from 'vitest';
import {
    DEFAULT_REALISTIC_STRATEGIES,
    simulateRealisticSelfPlay,
    singleWeaponStrategy,
    type RealisticSelfPlayResult,
    type RealisticSelfPlayStrategy,
} from '../../src/multiplayer/RealisticBalanceSimulation';

interface SeriesGame {
    result: RealisticSelfPlayResult;
    firstTeam: 'solar' | 'lunar';
}

function playSeries(
    name: string,
    first: RealisticSelfPlayStrategy,
    second: RealisticSelfPlayStrategy,
    games: number,
    seconds = 8 * 60,
): SeriesGame[] {
    return Array.from({ length: games }, (_, index) => {
        const reversed = index % 2 === 1;
        return {
            result: simulateRealisticSelfPlay(`${name}-${index}`, {
                solar: reversed ? second : first,
                lunar: reversed ? first : second,
            }, seconds),
            firstTeam: reversed ? 'lunar' : 'solar',
        };
    });
}

describe('realistic multiplayer self-play', () => {
    it('runs actual moving multiplayer combat deterministically', () => {
        const strategies = { solar: DEFAULT_REALISTIC_STRATEGIES.balanced, lunar: DEFAULT_REALISTIC_STRATEGIES.balanced };
        const first = simulateRealisticSelfPlay('deterministic-real-game', strategies, 4 * 60);
        const second = simulateRealisticSelfPlay('deterministic-real-game', strategies, 4 * 60);

        expect(second).toEqual(first);
        expect(first.monstersSpawned.solar).toBeGreaterThan(0);
        expect(first.monstersSpawned.lunar).toBeGreaterThan(0);
        expect(first.damageDealtByDefense.solar).toBeGreaterThan(0);
        expect(first.damageDealtByDefense.lunar).toBeGreaterThan(0);
        expect(first.towers.solar.length).toBeGreaterThan(1);
        expect(first.towers.lunar.length).toBeGreaterThan(1);
    });

    it('applies player strength to both real tower damage and monster cadence', () => {
        const fullStrength = { ...DEFAULT_REALISTIC_STRATEGIES.balanced, name: 'full-strength', strength: 1 };
        const tenPercent = { ...DEFAULT_REALISTIC_STRATEGIES.balanced, name: 'ten-percent', strength: 0.1 };
        const games = playSeries('strength-handicap', fullStrength, tenPercent, 20, 4 * 60);
        const fullStrengthWins = games.filter(({ result, firstTeam }) => result.winner === firstTeam).length;
        const reducedStrengthWins = games.filter(({ result, firstTeam }) => result.winner === (firstTeam === 'solar' ? 'lunar' : 'solar')).length;

        expect(fullStrengthWins).toBeGreaterThanOrEqual(16);
        expect(reducedStrengthWins).toBeLessThanOrEqual(2);
    }, 30_000);

    it('keeps every weapon specialist competitive with a mixed defense', () => {
        const reports = (['easy', 'spray', 'missile', 'flamethrower', 'cluster'] as const).map((type) => {
            const games = playSeries(`weapon-field-${type}`, singleWeaponStrategy(type), DEFAULT_REALISTIC_STRATEGIES.balanced, 20);
            return {
                type,
                firstWins: games.filter(({ result, firstTeam }) => result.winner === firstTeam).length,
                secondWins: games.filter(({ result, firstTeam }) => result.winner === (firstTeam === 'solar' ? 'lunar' : 'solar')).length,
                draws: games.filter(({ result }) => result.winner === null).length,
                averageDuration: Math.round(games.reduce((sum, { result }) => sum + result.durationSeconds, 0) / games.length),
            };
        });
        expect(reports).toHaveLength(5);
        for (const report of reports) {
            expect(report.firstWins, report.type).toBeGreaterThanOrEqual(5);
            expect(report.secondWins, report.type).toBeGreaterThanOrEqual(5);
            expect(report.averageDuration, report.type).toBeGreaterThanOrEqual(120);
            expect(report.averageDuration, report.type).toBeLessThanOrEqual(360);
        }
    }, 60_000);

    it('compares every weapon directly under sustained mixed offense', () => {
        const types = ['easy', 'spray', 'missile', 'flamethrower', 'cluster'] as const;
        const summary = [];
        for (let firstIndex = 0; firstIndex < types.length; firstIndex += 1) {
            for (let secondIndex = firstIndex + 1; secondIndex < types.length; secondIndex += 1) {
                const games = playSeries(
                    `head-to-head-${types[firstIndex]}-${types[secondIndex]}`,
                    singleWeaponStrategy(types[firstIndex]),
                    singleWeaponStrategy(types[secondIndex]),
                    10,
                );
                summary.push({
                    matchup: `${types[firstIndex]} v ${types[secondIndex]}`,
                    firstWins: games.filter(({ result, firstTeam }) => result.winner === firstTeam).length,
                    secondWins: games.filter(({ result, firstTeam }) => result.winner === (firstTeam === 'solar' ? 'lunar' : 'solar')).length,
                    draws: games.filter(({ result }) => result.winner === null).length,
                });
            }
        }
        expect(summary).toHaveLength(10);
        for (const matchup of summary) {
            expect(matchup.firstWins, matchup.matchup).toBeGreaterThanOrEqual(2);
            expect(matchup.secondWins, matchup.matchup).toBeGreaterThanOrEqual(2);
        }
    }, 60_000);

    it('keeps upgrade-focused gun paths competitive in real moving matches', () => {
        const reports = (['easy', 'spray', 'missile', 'flamethrower', 'cluster'] as const).map((type) => {
            const upgradeFocused = {
                ...singleWeaponStrategy(type),
                name: `upgrade-focused-${type}`,
                newTowerShare: 0.08,
                minimumDefensePoints: 2,
            };
            const games = playSeries(`upgrade-focused-${type}`, upgradeFocused, DEFAULT_REALISTIC_STRATEGIES.balanced, 20);
            const firstWins = games.filter(({ result, firstTeam }) => result.winner === firstTeam).length;
            const secondWins = games.filter(({ result, firstTeam }) => result.winner === (firstTeam === 'solar' ? 'lunar' : 'solar')).length;
            const upgradedLevels = games.flatMap(({ result, firstTeam }) => result.towers[firstTeam]
                .filter((tower) => tower.type === type)
                .map((tower) => tower.level));
            return {
                type,
                firstWins,
                secondWins,
                draws: games.length - firstWins - secondWins,
                maximumLevel: Math.max(...upgradedLevels),
                averagePeakLevel: games.reduce((sum, { result, firstTeam }) => sum + Math.max(
                    0,
                    ...result.towers[firstTeam].filter((tower) => tower.type === type).map((tower) => tower.level),
                ), 0) / games.length,
                averageDuration: Math.round(games.reduce((sum, { result }) => sum + result.durationSeconds, 0) / games.length),
            };
        });

        for (const report of reports) {
            expect(report.maximumLevel, report.type).toBeGreaterThanOrEqual(5);
            expect(report.averagePeakLevel, report.type).toBeGreaterThanOrEqual(3);
            expect(report.firstWins, report.type).toBeGreaterThanOrEqual(5);
            expect(report.secondWins, report.type).toBeGreaterThanOrEqual(5);
            expect(report.averageDuration, report.type).toBeGreaterThanOrEqual(120);
            expect(report.averageDuration, report.type).toBeLessThanOrEqual(360);
        }
    }, 60_000);

    it('makes one Nibble unlock containable by one sensibly placed basic gun', () => {
        const oneNibbleThenDefense = {
            ...singleWeaponStrategy('easy', 0),
            name: 'one-nibble-then-defense',
            minimumOffensePoints: 1,
            minimumDefensePoints: 0,
            maximumOffensePoints: 1,
            maximumDefensePoints: 0,
            advancedShare: 0,
        };
        const pureBasicDefense = {
            ...singleWeaponStrategy('easy', 0),
            name: 'pure-basic-defense',
            minimumOffensePoints: 0,
            minimumDefensePoints: 1,
            maximumOffensePoints: 0,
            maximumDefensePoints: 1,
            advancedShare: 0,
        };
        const results = playSeries('opening-nibble', oneNibbleThenDefense, pureBasicDefense, 20, 2 * 60);
        const defendingBaseHealth = results.map(({ result, firstTeam }) => result.baseHealth[firstTeam === 'solar' ? 'lunar' : 'solar']);
        expect(Math.min(...defendingBaseHealth)).toBeGreaterThanOrEqual(134);
        expect(results.every(({ result }) => result.winner === null)).toBe(true);
    }, 30_000);

    it('keeps offense-heavy and defense-heavy play competitive across answer speeds and extremes', () => {
        const scenarios = [
            ['ordinary', DEFAULT_REALISTIC_STRATEGIES.offenseHeavy, DEFAULT_REALISTIC_STRATEGIES.defenseHeavy],
            ['extreme', { ...DEFAULT_REALISTIC_STRATEGIES.offenseHeavy, offenseShare: 0.85 }, { ...DEFAULT_REALISTIC_STRATEGIES.defenseHeavy, offenseShare: 0.15 }],
            ['fast', { ...DEFAULT_REALISTIC_STRATEGIES.offenseHeavy, answerSeconds: 6 }, { ...DEFAULT_REALISTIC_STRATEGIES.defenseHeavy, answerSeconds: 6 }],
            ['steady', { ...DEFAULT_REALISTIC_STRATEGIES.offenseHeavy, answerSeconds: 12 }, { ...DEFAULT_REALISTIC_STRATEGIES.defenseHeavy, answerSeconds: 12 }],
        ] as const;
        const summary = scenarios.map(([name, offense, defense]) => {
            const games = playSeries(`final-strategy-${name}`, offense, defense, 40);
            const offenseWins = games.filter(({ result, firstTeam }) => result.winner === firstTeam).length;
            const defenseWins = games.filter(({ result, firstTeam }) => result.winner === (firstTeam === 'solar' ? 'lunar' : 'solar')).length;
            return {
                name,
                offenseWins,
                defenseWins,
                draws: games.length - offenseWins - defenseWins,
                averageDuration: Math.round(games.reduce((sum, { result }) => sum + result.durationSeconds, 0) / games.length),
            };
        });
        for (const row of summary) {
            expect(row.offenseWins).toBeGreaterThanOrEqual(10);
            expect(row.defenseWins).toBeGreaterThanOrEqual(10);
            expect(row.averageDuration).toBeGreaterThanOrEqual(120);
            expect(row.averageDuration).toBeLessThanOrEqual(360);
        }
    }, 60_000);
});
