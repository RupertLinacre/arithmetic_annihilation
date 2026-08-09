import { describe, expect, it } from 'vitest';
import { createInviteCode, INVITE_CODE_LENGTH } from '../../src/multiplayer/MultiplayerSession';

describe('multiplayer invite codes', () => {
    it('creates compact four-character codes without ambiguous characters', () => {
        const codes = Array.from({ length: 20 }, () => createInviteCode());

        expect(INVITE_CODE_LENGTH).toBe(4);
        expect(codes.every((code) => /^[A-HJ-NP-Z2-9]{4}$/.test(code))).toBe(true);
    });
});
