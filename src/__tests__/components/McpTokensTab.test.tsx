import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import McpTokensTab from '@/components/admin/McpTokensTab';
import type { McpTokenItem } from '@/components/admin/useMcpTokens';

const RAW = `crf_mcp_${'A'.repeat(43)}`;

function item(overrides: Partial<McpTokenItem> = {}): McpTokenItem {
    return {
        id: 't1',
        userId: 'u-admin',
        userEmail: 'admin@croix-rouge.fr',
        userName: 'Admin CRF',
        name: 'Claude bureau',
        tokenPrefix: 'crf_mcp_AbCd',
        scope: 'read',
        createdAt: '2026-10-01T10:00:00.000Z',
        expiresAt: '2099-01-01T10:00:00.000Z',
        lastUsedAt: null,
        revokedAt: null,
        mine: true,
        ...overrides,
    };
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

let tokens: McpTokenItem[];
let requests: { url: string; method: string; body: unknown }[];

function mockApi(postResponse: () => Response = () => json({ token: RAW, item: item() }, 201)) {
    requests = [];
    vi.spyOn(global, 'fetch').mockImplementation((async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (method === 'POST') {
            const res = postResponse();
            if (res.ok) tokens = [item({ id: 'new', name: 'Nouveau' }), ...tokens];
            return res;
        }
        if (method === 'DELETE') {
            tokens = tokens.map(t => (url.endsWith(t.id) ? { ...t, revokedAt: '2026-10-24T10:00:00.000Z' } : t));
            return json({ success: true });
        }
        return json({ tokens });
    }) as typeof fetch);
}

const showToast = vi.fn();

beforeEach(() => {
    tokens = [item(), item({ id: 't2', name: 'Ancien', revokedAt: '2026-10-10T10:00:00.000Z' }), item({ id: 't3', name: 'Périmé', expiresAt: '2020-01-01T00:00:00.000Z' })];
    showToast.mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('McpTokensTab', () => {
    it("liste les jetons avec leur préfixe et leur état, sans colonne propriétaire pour un ADMIN", async () => {
        mockApi();
        render(<McpTokensTab isSuperAdmin={false} showToast={showToast} />);
        expect(await screen.findByText('Claude bureau')).toBeTruthy();
        expect(screen.queryByText('Propriétaire')).toBeNull();
        const rows = screen.getAllByRole('row').slice(1);
        expect(within(rows[0]).getByText('crf_mcp_AbCd…')).toBeTruthy();
        expect(within(rows[0]).getByText('Actif')).toBeTruthy();
        expect(within(rows[1]).getByText('Révoqué')).toBeTruthy();
        expect(within(rows[2]).getByText('Expiré')).toBeTruthy();
        // Seul un jeton actif se révoque.
        expect(screen.getAllByRole('button', { name: /Révoquer le jeton/ })).toHaveLength(1);
    });

    it('un SUPER_ADMIN voit le propriétaire', async () => {
        mockApi();
        render(<McpTokensTab isSuperAdmin showToast={showToast} />);
        expect(await screen.findByText('Propriétaire')).toBeTruthy();
        expect(screen.getAllByText('Admin CRF').length).toBeGreaterThan(0);
    });

    it('crée un jeton (nom, portée, validité) et ne l’affiche qu’une fois', async () => {
        mockApi();
        render(<McpTokensTab isSuperAdmin={false} showToast={showToast} />);
        await screen.findByText('Claude bureau');

        fireEvent.change(screen.getByLabelText('Nom'), { target: { value: '  Nouveau  ' } });
        fireEvent.change(screen.getByLabelText('Portée'), { target: { value: 'write' } });
        expect(screen.getByText(/peut modifier et supprimer des données/)).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Validité'), { target: { value: '365' } });
        fireEvent.click(screen.getByRole('button', { name: 'Générer le jeton' }));

        expect((await screen.findByLabelText("Jeton d'accès")).textContent).toBe(RAW);
        expect(requests.find(r => r.method === 'POST')?.body).toEqual({ name: 'Nouveau', scope: 'write', validityDays: 365 });
        expect(screen.getByText(/il ne sera plus jamais affiché/)).toBeTruthy();
        // Les exemples de configuration ne contiennent jamais le jeton : il passe par une variable d'environnement.
        expect(document.body.textContent?.split(RAW)).toHaveLength(2);

        fireEvent.click(screen.getByRole('button', { name: "J'ai copié le jeton" }));
        expect(screen.queryByLabelText("Jeton d'accès")).toBeNull();
        expect(screen.queryByText(new RegExp(RAW))).toBeNull();
    });

    it("affiche l'erreur de l'API à la création (limite de 10)", async () => {
        mockApi(() => json({ error: 'Nombre maximal de jetons actifs atteint (10)' }, 409));
        render(<McpTokensTab isSuperAdmin={false} showToast={showToast} />);
        await screen.findByText('Claude bureau');
        fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'x' } });
        fireEvent.click(screen.getByRole('button', { name: 'Générer le jeton' }));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Nombre maximal de jetons actifs atteint (10)', 'error'));
        expect(screen.queryByLabelText("Jeton d'accès")).toBeNull();
    });

    it('révoque un jeton après confirmation', async () => {
        mockApi();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<McpTokensTab isSuperAdmin={false} showToast={showToast} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Révoquer le jeton Claude bureau' }));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Jeton révoqué.', 'success'));
        expect(requests.some(r => r.method === 'DELETE' && r.url === '/api/mcp-tokens/t1')).toBe(true);
        await waitFor(() => expect(screen.getAllByText('Révoqué')).toHaveLength(2));
    });

    it("n'appelle pas l'API si la révocation est annulée", async () => {
        mockApi();
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<McpTokensTab isSuperAdmin={false} showToast={showToast} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Révoquer le jeton Claude bureau' }));
        expect(requests.some(r => r.method === 'DELETE')).toBe(false);
    });

    it("affiche l'URL du serveur MCP et des exemples qui lisent le jeton dans CRF_MCP_TOKEN", async () => {
        mockApi();
        render(<McpTokensTab isSuperAdmin={false} showToast={showToast} />);
        const url = `${window.location.origin}/api/mcp`;
        expect(await screen.findByText(url)).toBeTruthy();
        expect(screen.getByText('export CRF_MCP_TOKEN=crf_mcp_…')).toBeTruthy();
        expect(screen.getByText(`claude mcp add --transport http crf-fleet ${url} --header "Authorization: Bearer $CRF_MCP_TOKEN"`)).toBeTruthy();
        expect(screen.getByText(/"Authorization": "Bearer \$\{CRF_MCP_TOKEN\}"/)).toBeTruthy();
        expect(screen.getByText(/Ne versionnez jamais le jeton/)).toBeTruthy();
    });

    it('donne une configuration Claude Desktop via le pont mcp-remote, sans espace dans args', async () => {
        mockApi();
        render(<McpTokensTab isSuperAdmin={false} showToast={showToast} />);
        const url = `${window.location.origin}/api/mcp`;
        const block = await screen.findByText(/"mcp-remote"/);
        const config = JSON.parse(block.textContent ?? '');
        expect(config.mcpServers['crf-fleet']).toEqual({
            command: 'npx',
            args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${CRF_AUTH_HEADER}'],
            env: { CRF_AUTH_HEADER: 'Bearer crf_mcp_…' },
        });
        expect(config.mcpServers['crf-fleet'].args.some((a: string) => a.includes(' '))).toBe(false);
    });

    it('signale un échec de copie dans le presse-papiers', async () => {
        mockApi();
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('refusé')) } });
        render(<McpTokensTab isSuperAdmin={false} showToast={showToast} />);
        await screen.findByText('Claude bureau');
        fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'x' } });
        fireEvent.click(screen.getByRole('button', { name: 'Générer le jeton' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Copier' }));
        expect(await screen.findByText('Copie impossible : sélectionnez le jeton et copiez-le manuellement.')).toBeTruthy();
    });
});
