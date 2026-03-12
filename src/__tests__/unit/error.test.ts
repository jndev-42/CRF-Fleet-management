import { describe, it, expect } from 'vitest';
import { getErrorMessage } from '@/lib/utils/error';

describe('getErrorMessage', () => {
    it('returns the message from an Error instance', () => {
        expect(getErrorMessage(new Error('something went wrong'))).toBe('something went wrong');
    });

    it('returns the string as-is for a string value', () => {
        expect(getErrorMessage('oops')).toBe('oops');
    });

    it('converts a number to string', () => {
        expect(getErrorMessage(42)).toBe('42');
    });

    it('converts null to string', () => {
        expect(getErrorMessage(null)).toBe('null');
    });

    it('converts undefined to string', () => {
        expect(getErrorMessage(undefined)).toBe('undefined');
    });
});
