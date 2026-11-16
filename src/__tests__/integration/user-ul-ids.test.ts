/**
 * Tests d'intégration — `ulIds` (UL de rattachement) renvoyé par les listes qui alimentent
 * les sélecteurs de personnes (filtre « Mon UL » de UserCombobox).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET } from '@/app/api/users/route';
import { auth } from '@/auth';
import { listActiveUlMembers } from '@/lib/ulMembers';
import { listEligibleDrivers, parseUlIds } from '@/lib/eligibleDrivers';
import { seedUser, seedRoles, seedUserRole, seedUniteLocale, seedUserUL } from './setup';

const mockedAuth = vi.mocked(auth);

describe('ulIds des listes de personnes', () => {
    beforeEach(async () => {
        mockedAuth.mockReset();
        await seedRoles(['SUPER_ADMIN', 'ADMIN', 'CHVL', 'CHVPSP', 'INACTIF', 'GUEST']);
        await seedUniteLocale({ id: 'ul-a', name: 'UL A', slug: 'ul-a' });
        await seedUniteLocale({ id: 'ul-b', name: 'UL B', slug: 'ul-b' });
        await seedUser({ id: 'u-1', email: 'one@croix-rouge.fr', name: 'One' });
        await seedUser({ id: 'u-2', email: 'two@croix-rouge.fr', name: 'Two' });
        await seedUserRole('u-1', 'CHVL');
        await seedUserRole('u-2', 'CHVL');
        await seedUserUL({ userId: 'u-1', ulId: 'ul-a', roles: ['CHVL'] });
        await seedUserUL({ userId: 'u-1', ulId: 'ul-b', roles: ['CHVL'], isHome: false });
        await seedUserUL({ userId: 'u-2', ulId: 'ul-b', roles: ['CHVL'] });
    });

    it('parseUlIds : CSV vide ou absent donne []', () => {
        expect(parseUlIds(null)).toEqual([]);
        expect(parseUlIds('')).toEqual([]);
        expect(parseUlIds('a, b')).toEqual(['a', 'b']);
    });

    it('listActiveUlMembers expose toutes les UL du membre, pas seulement celle demandée', async () => {
        const members = await listActiveUlMembers('ul-a');
        expect(members).toHaveLength(1);
        expect(members[0].id).toBe('u-1');
        expect([...members[0].ulIds].sort()).toEqual(['ul-a', 'ul-b']);
    });

    it('listEligibleDrivers expose les UL de chacun ([] sans rattachement)', async () => {
        await seedUser({ id: 'u-3', email: 'three@croix-rouge.fr', name: 'Three' });
        await seedUserRole('u-3', 'CHVL');
        const drivers = await listEligibleDrivers('VL', 'nobody');
        const byId = Object.fromEntries(drivers.map(d => [d.id, d.ulIds.sort()]));
        expect(byId).toEqual({ 'u-1': ['ul-a', 'ul-b'], 'u-2': ['ul-b'], 'u-3': [] });
    });

    it('GET /api/users (admin) renvoie ulIds, avec et sans filtre de rôle', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'adm', email: 'adm@croix-rouge.fr', roles: ['ADMIN'], ulId: 'ul-a' }, expires: '2099-01-01' } as never);
        for (const qs of ['', '?drivers=true']) {
            const res = await GET(new Request(`http://localhost/api/users${qs}`));
            expect(res.status).toBe(200);
            const { users } = await res.json();
            const one = users.find((u: { id: string }) => u.id === 'u-1');
            expect([...one.ulIds].sort()).toEqual(['ul-a', 'ul-b']);
        }
    });

    it('GET /api/users (RESP_VEHICULE) renvoie ulIds, limité aux membres de son UL', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'rv', email: 'rv@croix-rouge.fr', roles: ['RESP_VEHICULE'], ulId: 'ul-a' }, expires: '2099-01-01' } as never);
        const res = await GET(new Request('http://localhost/api/users?vehicleType=VL'));
        expect(res.status).toBe(200);
        const { users } = await res.json();
        expect(users.map((u: { id: string }) => u.id)).toEqual(['u-1']);
        expect([...users[0].ulIds].sort()).toEqual(['ul-a', 'ul-b']);
    });

    it("n'expose pas une UL où le compte est INACTIF ou GUEST (UserUL.roles)", async () => {
        await seedUserUL({ userId: 'u-2', ulId: 'ul-a', roles: ['CHVL', 'INACTIF'], isHome: false });
        await seedUser({ id: 'u-4', email: 'four@croix-rouge.fr', name: 'Four' });
        await seedUserRole('u-4', 'CHVL');
        await seedUserUL({ userId: 'u-4', ulId: 'ul-a', roles: ['GUEST'] });
        const drivers = await listEligibleDrivers('VL', 'nobody');
        const byId = Object.fromEntries(drivers.map(d => [d.id, d.ulIds.sort()]));
        expect(byId['u-2']).toEqual(['ul-b']);
        expect(byId['u-4']).toEqual([]);
    });
});
