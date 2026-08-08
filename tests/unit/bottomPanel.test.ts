import { describe, expect, it } from 'vitest';
import { getAnswerNumberPadKeys } from '../../src/ui/BottomPanel';

describe('answer number pad keys', () => {
    it('uses a standard numpad digit layout with only the needed fraction key', () => {
        const keys = getAnswerNumberPadKeys('3/4');

        expect(keys.slice(0, 9)).toEqual(['7', '8', '9', '4', '5', '6', '1', '2', '3']);
        expect(keys.slice(9, 12)).toEqual(['/', '0', 'backspace']);
        expect(keys).toContain('/');
        expect(keys).not.toContain('.');
        expect(keys).not.toContain('submit');
    });

    it('keeps zero centred when no special character is needed', () => {
        const keys = getAnswerNumberPadKeys('42');

        expect(keys.slice(9, 12)).toEqual(['spacer', '0', 'backspace']);
    });

    it('adds a decimal point without a submit key', () => {
        const keys = getAnswerNumberPadKeys('0.75');

        expect(keys).toContain('.');
        expect(keys).not.toContain('submit');
    });
});
