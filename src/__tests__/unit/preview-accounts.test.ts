import { describe, it, expect } from 'vitest';
import { PREVIEW_ACCOUNTS } from '@/lib/preview-accounts';

describe('PREVIEW_ACCOUNTS', () => {
    it('a des clés uniques', () => {
        const keys = PREVIEW_ACCOUNTS.map(a => a.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('a des emails uniques', () => {
        const emails = PREVIEW_ACCOUNTS.map(a => a.email);
        expect(new Set(emails).size).toBe(emails.length);
    });

    it('utilise toujours le domaine @preview.local', () => {
        for (const account of PREVIEW_ACCOUNTS) {
            expect(account.email.endsWith('@preview.local')).toBe(true);
        }
    });

    it('a une clé cohérente avec le préfixe de son email', () => {
        for (const account of PREVIEW_ACCOUNTS) {
            const emailLocalPart = account.email.split('@')[0];
            expect(account.key).toBe(emailLocalPart);
        }
    });

    it('renseigne tous les champs requis pour chaque compte', () => {
        for (const account of PREVIEW_ACCOUNTS) {
            expect(account.name).toBeTruthy();
            expect(account.badge).toBeTruthy();
            expect(account.color).toMatch(/^#[0-9a-f]{6}$/i);
            expect(account.label).toBeTruthy();
        }
    });
});
