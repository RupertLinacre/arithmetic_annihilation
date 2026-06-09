export class SeededRandom {
    private state: number;

    constructor(seed: number | string) {
        this.state = typeof seed === 'number' ? seed >>> 0 : SeededRandom.hash(seed);
        if (this.state === 0) {
            this.state = 0x6d2b79f5;
        }
    }

    static hash(value: string): number {
        let hash = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    next(): number {
        this.state += 0x6d2b79f5;
        let value = this.state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }

    int(minInclusive: number, maxInclusive: number): number {
        return Math.floor(this.next() * (maxInclusive - minInclusive + 1)) + minInclusive;
    }

    chance(probability: number): boolean {
        return this.next() < probability;
    }

    choice<T>(items: readonly T[]): T {
        if (items.length === 0) {
            throw new Error('Cannot choose from an empty array.');
        }
        return items[this.int(0, items.length - 1)];
    }

    shuffle<T>(items: readonly T[]): T[] {
        const copy = [...items];
        for (let index = copy.length - 1; index > 0; index -= 1) {
            const swapIndex = this.int(0, index);
            [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
        }
        return copy;
    }

    weightedChoice<T>(items: readonly T[], weights: readonly number[]): T {
        if (items.length !== weights.length || items.length === 0) {
            throw new Error('Weighted choice requires matching non-empty items and weights.');
        }
        const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
        if (total <= 0) {
            return items[0];
        }
        let roll = this.next() * total;
        for (let index = 0; index < items.length; index += 1) {
            roll -= Math.max(0, weights[index]);
            if (roll <= 0) {
                return items[index];
            }
        }
        return items[items.length - 1];
    }
}