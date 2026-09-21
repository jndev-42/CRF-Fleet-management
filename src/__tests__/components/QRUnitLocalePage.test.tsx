import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
    useParams: vi.fn(() => ({ token: 'test-token' })),
    useRouter: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
    useSession: vi.fn(() => ({ data: { user: { id: 'u-1', name: 'Test User' } } })),
}));

vi.mock('next/image', () => ({
    default: ({ alt }: { alt: string }) => <span aria-label={alt} data-testid="crf-logo" />,
}));

vi.mock('@/components/missions/MissionWizard', () => ({
    default: vi.fn(({ onSuccess }: { onSuccess: () => void }) => (
        <button data-testid="wizard-submit" onClick={onSuccess}>Envoyer</button>
    )),
}));

import QRUnitLocalePage from '@/app/qr-ul/[token]/page';
import { useRouter } from 'next/navigation';
import MissionWizard from '@/components/missions/MissionWizard';

const mockPush = vi.fn();

beforeEach(() => {
    mockPush.mockClear();
    vi.mocked(MissionWizard).mockClear();
    vi.restoreAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<typeof useRouter>);
});

describe('QRUnitLocalePage', () => {
    it('affiche l\'état de chargement pendant le fetch', () => {
        vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
        render(<QRUnitLocalePage />);
        expect(screen.getByText('Chargement...')).toBeTruthy();
    });

    it('redirige vers /login sur 401', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValueOnce(
            new Response(null, { status: 401 }),
        );
        render(<QRUnitLocalePage />);
        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith(
                '/login?callbackUrl=%2Fqr-ul%2Ftest-token',
            );
        });
    });

    it('affiche la carte d\'erreur sur 403', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValueOnce(
            new Response(JSON.stringify({ error: 'QR code invalide' }), { status: 403 }),
        );
        render(<QRUnitLocalePage />);
        await screen.findByText('Accès impossible');
        expect(screen.getByText('QR code invalide')).toBeTruthy();
    });

    it('affiche la carte d\'erreur sur 404', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValueOnce(
            new Response(JSON.stringify({ error: 'Token inconnu' }), { status: 404 }),
        );
        render(<QRUnitLocalePage />);
        await screen.findByText('Accès impossible');
        expect(screen.getByText('Token inconnu')).toBeTruthy();
    });

    it('affiche la confirmation après soumission et remet le wizard à zéro via « Nouveau rapport »', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValueOnce(
            new Response(JSON.stringify({ id: 'ul-paris-18', name: 'Paris 18' }), { status: 200 }),
        );
        render(<QRUnitLocalePage />);

        // Wizard visible après chargement
        const submitBtn = await screen.findByTestId('wizard-submit');
        expect(vi.mocked(MissionWizard)).toHaveBeenCalledTimes(1);

        // Déclenche onSuccess → carte de confirmation
        fireEvent.click(submitBtn);
        await screen.findByText('Compte rendu envoyé !');
        expect(screen.queryByTestId('wizard-submit')).toBeNull();

        // « Nouveau rapport » → wizard remonte avec un nouveau wizardKey
        fireEvent.click(screen.getByRole('button', { name: 'Nouveau rapport' }));
        await screen.findByTestId('wizard-submit');
        expect(vi.mocked(MissionWizard)).toHaveBeenCalledTimes(2);
    });
});
