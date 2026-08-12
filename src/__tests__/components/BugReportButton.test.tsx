import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({ useSession: () => mockUseSession() }));

vi.mock('@/lib/bugReportLogger', () => ({
    installInterceptors: vi.fn(),
    removeInterceptors: vi.fn(),
    getConsoleLogs: vi.fn(() => []),
    getNetworkLogs: vi.fn(() => []),
}));

vi.mock('@/components/BugReportModal', () => ({
    default: ({ onClose }: { onClose: () => void }) => (
        <div data-testid="bug-report-modal">
            <button onClick={onClose}>Fermer</button>
        </div>
    ),
}));

import BugReportButton from '@/components/BugReportButton';

beforeEach(() => {
    mockUseSession.mockReturnValue({ status: 'authenticated' });
});

describe('BugReportButton', () => {
    it('ne rend rien si non authentifié', () => {
        mockUseSession.mockReturnValue({ status: 'unauthenticated' });
        const { container } = render(<BugReportButton />);
        expect(container.firstChild).toBeNull();
    });

    it('affiche le bouton flottant si authentifié', () => {
        render(<BugReportButton />);
        expect(screen.getByRole('button', { name: 'Signaler un bug' })).toBeTruthy();
    });

    it('ouvre la modale de signalement au clic', () => {
        render(<BugReportButton />);
        expect(screen.queryByTestId('bug-report-modal')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Signaler un bug' }));
        expect(screen.getByTestId('bug-report-modal')).toBeTruthy();
    });

    it('ferme la modale via son onClose', () => {
        render(<BugReportButton />);
        fireEvent.click(screen.getByRole('button', { name: 'Signaler un bug' }));
        fireEvent.click(screen.getByText('Fermer'));
        expect(screen.queryByTestId('bug-report-modal')).toBeNull();
    });
});
