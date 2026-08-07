import { describe, expect, it } from 'vitest';
import { getAnswerNumberPadKeys } from '../../src/ui/BottomPanel';

describe('answer number pad keys', () => {
    it('adds only the special characters needed by a fraction answer', () => {
        const keys = getAnswerNumberPadKeys('3/4', true);

        expect(keys).toContain('/');
        expect(keys).toContain('submit');
        expect(keys).not.toContain('.');
    });

    it('adds a decimal point without a submit key for correction entry', () => {
        const keys = getAnswerNumberPadKeys('0.75', false);

        expect(keys).toContain('.');
        expect(keys).not.toContain('submit');
    });
});
