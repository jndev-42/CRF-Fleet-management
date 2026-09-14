/**
 * Test d'intégration — l'identité du déclarant n'atteint jamais le document PDF.
 *
 * Pourquoi un fichier à part : ce test remplace le moteur de rendu de
 * `@react-pdf/renderer` par un espion, afin d'inspecter les données EXACTES remises au
 * document. Les autres tests PDF (`incidents.test.ts`) exercent le rendu réel et
 * doivent le garder — les deux mocks ne peuvent donc pas cohabiter dans un fichier.
 *
 * Pourquoi ne pas simplement chercher le nom dans les octets du PDF : les flux de
 * contenu sont compressés et le texte y est encodé via un sous-ensemble de police —
 * une recherche en clair passerait TOUJOURS, y compris sur un PDF qui affiche le nom
 * en gros. Le verrou doit donc être posé à la frontière des données, pas sur le binaire.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

const renderedProps: Record<string, unknown>[] = [];
// Seul `renderToBuffer` est remplacé : le reste du module reste réel, sans quoi
// `StyleSheet.create()` casse à l'import du composant.
vi.mock('@react-pdf/renderer', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@react-pdf/renderer')>();
    return {
        ...actual,
        renderToBuffer: vi.fn(async (element: { props: Record<string, unknown> }) => {
            renderedProps.push(element.props);
            return Buffer.from('%PDF-fake');
        }),
    };
});

import { GET as GET_PDF } from '@/app/api/incidents/[id]/pdf/route';
import { auth } from '@/auth';
import { seedVehicle, seedUser, seedIncident } from './setup';

beforeEach(() => {
    vi.clearAllMocks();
    renderedProps.length = 0;
});

describe('GET /api/incidents/[id]/pdf — anonymat du document', () => {
    it("ne transmet aucune identité de déclarant au document", async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'user-1', email: 'reporter@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' },
        } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedUser({ id: 'user-1', email: 'reporter@test.com', name: 'Jean Declarant' });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-1', status: 'SUBMITTED' });

        const res = await GET_PDF(
            new Request('http://localhost/api/incidents/incident-1/pdf'),
            { params: Promise.resolve({ id: 'incident-1' }) }
        );

        expect(res.status).toBe(200);
        expect(renderedProps).toHaveLength(1);

        const report = renderedProps[0].report as Record<string, unknown>;
        // Contrôle de non-vacuité : le rapport transmis est bien celui attendu.
        expect(report.vehicleName).toBe('VL186');
        // Le verrou : aucun champ d'identité, quelle que soit son orthographe.
        expect(report).not.toHaveProperty('userName');
        expect(report).not.toHaveProperty('userEmail');
        const serialized = JSON.stringify(report);
        expect(serialized).not.toContain('Jean Declarant');
        expect(serialized).not.toContain('reporter@test.com');
    });
});
