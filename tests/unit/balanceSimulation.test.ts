import { describe, expect, it } from 'vitest';
import { simulateSelfPlay, type SelfPlayStrategy } from '../../src/multiplayer/BalanceSimulation';

const BALANCED: SelfPlayStrategy = {
    name: 'balanced', offenseShare: 0.52, advancedShare: 0.42, highTowerShare: 0.42, utilization: 0.8, answerSeconds: 8,
};
const AGGRESSIVE: SelfPlayStrategy = {
    name: 'aggressive', offenseShare: 0.58, advancedShare: 0.55, highTowerShare: 0.5, utilization: 0.78, answerSeconds: 8,
};
const DEFENSIVE: SelfPlayStrategy = {
    name: 'defensive', offenseShare: 0.46, advancedShare: 0.35, highTowerShare: 0.4, utilization: 0.83, answerSeconds: 8,
};

describe('multiplayer balance self-play', () => {
    it('does not give either seat an advantage in mirrored play', () => {
        const results = Array.from({ length: 400 }, (_, index) => simulateSelfPlay(`mirror-${index}`, [BALANCED, BALANCED]));
        const firstWins = results.filter((result) => result.winner === 0).length;
        const secondWins = results.filter((result) => result.winner === 1).length;
        const completedDurations = results.filter((result) => result.winner !== null).map((result) => result.durationSeconds).sort((a, b) => a - b);
        expect(Math.abs(firstWins - secondWins)).toBeLessThanOrEqual(50);
        expect(completedDurations.length).toBeGreaterThanOrEqual(280);
        expect(completedDurations[Math.floor(completedDurations.length / 2)]).toBeGreaterThanOrEqual(180);
        expect(completedDurations[Math.floor(completedDurations.length / 2)]).toBeLessThanOrEqual(600);
    });

    it('keeps sensible aggressive and defensive strategies competitive', () => {
        const results = Array.from({ length: 400 }, (_, index) => {
            const strategies: [SelfPlayStrategy, SelfPlayStrategy] = index % 2 === 0
                ? [AGGRESSIVE, DEFENSIVE]
                : [DEFENSIVE, AGGRESSIVE];
            return simulateSelfPlay(`styles-${index}`, strategies);
        });
        const aggressiveWins = results.filter((result, index) => result.winner === (index % 2 === 0 ? 0 : 1)).length;
        const defensiveWins = results.filter((result, index) => result.winner === (index % 2 === 0 ? 1 : 0)).length;
        const completedDurations = results.filter((result) => result.winner !== null).map((result) => result.durationSeconds).sort((a, b) => a - b);
        expect(aggressiveWins).toBeGreaterThan(60);
        expect(defensiveWins).toBeGreaterThan(60);
        expect(completedDurations.length).toBeGreaterThanOrEqual(250);
        expect(completedDurations[Math.floor(completedDurations.length / 2)]).toBeGreaterThanOrEqual(180);
        expect(completedDurations[Math.floor(completedDurations.length / 2)]).toBeLessThanOrEqual(600);
    });

    it('remains playable across ordinary placement utilization', () => {
        for (const utilization of [0.72, 0.88]) {
            const strategy = { ...BALANCED, name: `utilization-${utilization}`, utilization };
            const results = Array.from({ length: 200 }, (_, index) => simulateSelfPlay(`util-${utilization}-${index}`, [strategy, strategy]));
            const completed = results.filter((result) => result.winner !== null);
            expect(completed.length).toBeGreaterThan(utilization < 0.8 ? 180 : 60);
        }
    });
});
