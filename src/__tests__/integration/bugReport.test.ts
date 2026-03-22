/**
 * Tests d'intégration — POST /api/bugs/report
 *
 * Stratégie : appel direct du handler Next.js avec de vrais objets Request.
 * - Auth mockée (pas de vraie session)
 * - GitHub fetch mockée (pas d'appels réseau réels)
 * - Pas de DB impliquée (ce endpoint n'écrit pas en base)
 *
 * Cas couverts :
 *  1. 401 sans session
 *  2. 403 pour un utilisateur GUEST uniquement
 *  3. 400 pour un body Zod invalide (titre manquant, titre trop long)
 *  4. 502 si GITHUB_TOKEN absent
 *  5. 502 si l'API GitHub répond avec une erreur
 *  6. 201 happy path — retourne l'URL de l'issue créée
 *  7. Le corps GitHub inclut le nom, email, rôle, description et logs
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { POST } from '@/app/api/bugs/report/route';
import { auth } from '@/auth';

const mockedAuth = vi.mocked(auth);

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/bugs/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  title: 'Le bouton de checkout plante',
  description: 'Quand je clique sur checkout il ne se passe rien.',
  logs: '[2026-03-12] [ERROR] Cannot read properties of undefined',
  networkLogs: '[2026-03-12] GET /api/vehicles → 200 (45ms)',
  userAgent: 'Mozilla/5.0',
  pageUrl: 'http://localhost:3000/vehicles/VL001',
};

// Sauvegarde et restauration de GITHUB_TOKEN
const originalToken = process.env.GITHUB_TOKEN;

beforeEach(() => {
  process.env.GITHUB_TOKEN = 'ghp_test_token';
});

afterEach(() => {
  process.env.GITHUB_TOKEN = originalToken;
  vi.restoreAllMocks();
});

describe('POST /api/bugs/report — auth & authorization', () => {
  it('retourne 401 sans session', async () => {
    // @ts-expect-error — null session for test
    mockedAuth.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it('retourne 403 pour un utilisateur GUEST uniquement', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'guest@dev.local', roles: ['GUEST'] } } as never);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
  });

  it('autorise un utilisateur avec le rôle CHVL', async () => {
    mockedAuth.mockResolvedValue({ user: { name: 'Jean', email: 'jean@dev.local', roles: ['CHVL'] } } as never);
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 201, json: async () => ({ html_url: 'https://github.com/issues/1' }) } as Response);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
  });
});

describe('POST /api/bugs/report — validation Zod', () => {
  beforeEach(() => {
    mockedAuth.mockResolvedValue({ user: { name: 'Jean', email: 'jean@dev.local', roles: ['RESPO'] } } as never);
  });

  it('retourne 400 si le titre est absent', async () => {
    const res = await POST(makeRequest({ description: 'test' }));
    expect(res.status).toBe(400);
  });

  it('retourne 400 si le titre est vide', async () => {
    const res = await POST(makeRequest({ ...validBody, title: '' }));
    expect(res.status).toBe(400);
  });

  it('retourne 400 si le titre dépasse 200 caractères', async () => {
    const res = await POST(makeRequest({ ...validBody, title: 'x'.repeat(201) }));
    expect(res.status).toBe(400);
  });

  it('retourne 400 si description dépasse 5000 caractères', async () => {
    const res = await POST(makeRequest({ ...validBody, description: 'x'.repeat(5001) }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/bugs/report — GitHub integration', () => {
  beforeEach(() => {
    mockedAuth.mockResolvedValue({ user: { name: 'Alice Dupont', email: 'alice@dev.local', roles: ['ADMIN'] } } as never);
  });

  it('retourne 502 si GITHUB_TOKEN n\'est pas configuré', async () => {
    delete process.env.GITHUB_TOKEN;
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
  });

  it('retourne 502 si l\'API GitHub répond avec une erreur', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 422, text: async () => 'Validation Failed' } as Response);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(502);
  });

  it('retourne 201 avec l\'URL de l\'issue en cas de succès', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ html_url: 'https://github.com/jndev-42/CRF-Fleet-management/issues/42' }),
    } as Response);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    const data = await res.json() as { issueUrl: string };
    expect(data.issueUrl).toBe('https://github.com/jndev-42/CRF-Fleet-management/issues/42');
  });

  it('le corps envoyé à GitHub inclut le nom, email, rôle et la description', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ html_url: 'https://github.com/issues/1' }),
    } as Response);

    await POST(makeRequest(validBody));

    const callArgs = fetchSpy.mock.calls[0];
    const requestBody = JSON.parse(callArgs[1]?.body as string) as { title: string; body: string; labels: string[] };

    expect(requestBody.title).toBe(validBody.title);
    expect(requestBody.body).toContain('Alice Dupont');
    expect(requestBody.body).toContain('alice@dev.local');
    expect(requestBody.body).toContain('ADMIN');
    expect(requestBody.body).toContain(validBody.description);
    expect(requestBody.body).toContain(validBody.logs);
    expect(requestBody.body).toContain(validBody.networkLogs);
    expect(requestBody.labels).toContain('bug');
    expect(requestBody.labels).toContain('user-report');
  });

  it('appelle l\'API GitHub avec les bons headers', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ html_url: 'https://github.com/issues/1' }),
    } as Response);

    await POST(makeRequest(validBody));

    const callArgs = fetchSpy.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer ghp_test_token');
    expect(headers['Accept']).toBe('application/vnd.github+json');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });
});
