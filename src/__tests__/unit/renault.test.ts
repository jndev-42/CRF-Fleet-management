import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRenaultVehicleData } from '@/lib/renault';

vi.mock('@/lib/db', () => ({
    db: {
        execute: vi.fn().mockResolvedValue({ rows: [] }),
    },
}));

const GIGYA_API_KEY = '3_VgdkgtIRH3AdHvJm-cjV2ug2EFE0lxt0IJzMC4MFqZjFpn_GYFXVdNZ19L7wZX0N';

describe('Renault API authentication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.RENAULT_MAIL = 'test@example.com';
        process.env.RENAULT_PASS = 'password';

        // Mock fetch globally
        global.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
            const urlStr = url.toString();
            if (urlStr.includes('accounts.login')) {
                return {
                    ok: true,
                    json: async () => ({
                        errorCode: 0,
                        sessionInfo: { cookieValue: 'mock-cookie' }
                    })
                };
            }
            if (urlStr.includes('getAccountInfo')) {
                return {
                    ok: true,
                    json: async () => ({
                        errorCode: 0,
                        data: { personId: 'mock-person-id' }
                    })
                };
            }
            if (urlStr.includes('getJWT')) {
                return {
                    ok: true,
                    json: async () => ({
                        id_token: 'mock-id-token'
                    })
                };
            }
            if (urlStr.includes('persons/mock-person-id')) {
                return {
                    ok: true,
                    json: async () => ({
                        accounts: [{ accountType: 'MYRENAULT', accountId: 'mock-account-id' }]
                    })
                };
            }
            if (urlStr.includes('cockpit')) {
                return {
                    ok: true,
                    json: async () => ({
                        data: { attributes: { totalMileage: 12345 } }
                    })
                };
            }
            return {
                ok: false,
                status: 404,
                json: async () => ({ error: 'Not found' })
            };
        }) as any;
    });

    it('should use the correct Gigya API key in authentication requests', async () => {
        await getRenaultVehicleData('MOCKVIN123');

        const fetchCalls = (global.fetch as any).mock.calls;

        // Find calls to Gigya endpoints
        const loginCall = fetchCalls.find((call: any) => call[0].toString().includes('login'));
        const accountInfoCall = fetchCalls.find((call: any) => call[0].toString().includes('getAccountInfo'));
        const jwtCall = fetchCalls.find((call: any) => call[0].toString().includes('getJWT'));

        expect(loginCall).toBeDefined();
        expect(new URL(loginCall[0].toString()).searchParams.get('apikey')).toBe(GIGYA_API_KEY);

        expect(accountInfoCall).toBeDefined();
        expect(new URL(accountInfoCall[0].toString()).searchParams.get('apikey')).toBe(GIGYA_API_KEY);

        expect(jwtCall).toBeDefined();
        expect(new URL(jwtCall[0].toString()).searchParams.get('apikey')).toBe(GIGYA_API_KEY);
    });
});
