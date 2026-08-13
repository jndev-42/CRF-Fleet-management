import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockInit = vi.fn().mockResolvedValue(undefined);
const mockPromptPush = vi.fn().mockResolvedValue(undefined);
const mockAddTags = vi.fn();

vi.mock('react-onesignal', () => ({
    default: {
        init: (...args: unknown[]) => mockInit(...args),
        Slidedown: { promptPush: () => mockPromptPush() },
        User: { addTags: (tags: Record<string, string>) => mockAddTags(tags) },
    },
}));

import { OneSignalProvider } from '@/components/OneSignalProvider';

beforeEach(() => {
    vi.restoreAllMocks();
    mockInit.mockClear();
    mockPromptPush.mockClear();
    mockAddTags.mockClear();
    mockInit.mockResolvedValue(undefined);
    mockPromptPush.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'serviceWorker', {
        value: { getRegistrations: vi.fn().mockResolvedValue([]) },
        configurable: true,
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('OneSignalProvider', () => {
    it('ne rend rien dans le DOM', () => {
        const { container } = render(<OneSignalProvider appId="app-1" availableULs={[]} globalRoles={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('n\'initialise pas OneSignal sans appId', async () => {
        render(<OneSignalProvider appId="" availableULs={[]} globalRoles={[]} />);
        await waitFor(() => expect(mockInit).not.toHaveBeenCalled());
    });

    it('initialise OneSignal avec le bon appId (happy path)', async () => {
        render(<OneSignalProvider appId="app-1" availableULs={[]} globalRoles={[]} />);
        await waitFor(() => expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({ appId: 'app-1' })));
    });

    it('envoie les tags de rôle par UL', async () => {
        render(<OneSignalProvider
            appId="app-1"
            availableULs={[{ id: 'ul-1', name: 'Paris', slug: 'paris', isHome: true, roles: ['ADMIN'] }]}
            globalRoles={['CHVL']}
        />);

        await waitFor(() => expect(mockAddTags).toHaveBeenCalledWith(expect.objectContaining({
            'role_ul-1_ADMIN': 'true',
            'role_ADMIN': 'true',
        })));
    });

    it('retombe sur les rôles globaux si l\'UL n\'en a pas', async () => {
        render(<OneSignalProvider
            appId="app-1"
            availableULs={[{ id: 'ul-1', name: 'Paris', slug: 'paris', isHome: true }]}
            globalRoles={['CHVL']}
        />);

        await waitFor(() => expect(mockAddTags).toHaveBeenCalledWith(expect.objectContaining({
            'role_ul-1_CHVL': 'true',
        })));
    });
});
