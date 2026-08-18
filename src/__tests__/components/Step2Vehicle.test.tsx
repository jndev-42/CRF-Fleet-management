import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Step2Vehicle from '@/components/missions/steps/Step2Vehicle';
import type { MissionFormData } from '@/components/missions/MissionWizard';

const baseData: MissionFormData = {
    mission_type: 'DPS', mission_name: '', mission_date: '2026-01-01', location: '',
    volunteers: '', pegass_ok: true, vehicle_id: null, driver_id: null, victim_count: 0,
    presence_ul: null, team_dynamics: null, all_found_place: null, member_difficulties: null,
    free_comment: null, mission_comment: null, had_acr: false, had_hemorrhage: false, had_complex_care: false, needs_followup: false,
};

const vehicles = [{ id: 'VL001', name: 'VL186', type: 'VL' }, { id: 'VPSP001', name: 'VPSP-1', type: 'VPSP' }];
const drivers = [{ id: 'u1', name: 'Jean Dupont', email: 'jean@test.com', roles: ['CHVL'] }, { id: 'u2', name: 'Marie Curie', email: 'marie@test.com', roles: ['CHVPSP'] }];

function mockFetch() {
    vi.spyOn(global, 'fetch').mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/api/vehicles')) return Promise.resolve(new Response(JSON.stringify(vehicles), { status: 200 }));
        if (url.includes('/api/users')) return Promise.resolve(new Response(JSON.stringify({ users: drivers }), { status: 200 }));
        return Promise.resolve(new Response('{}', { status: 200 }));
    });
}

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Step2Vehicle', () => {
    it('charge et affiche les véhicules et chauffeurs disponibles', async () => {
        mockFetch();
        render(<Step2Vehicle data={baseData} onChange={vi.fn()} />);
        await waitFor(() => expect(screen.getByText('VL186 (VL)')).toBeTruthy());
        expect(screen.getByText('Jean Dupont')).toBeTruthy();
    });

    it('met à jour le véhicule sélectionné (happy path)', async () => {
        mockFetch();
        const onChange = vi.fn();
        render(<Step2Vehicle data={baseData} onChange={onChange} />);
        await waitFor(() => screen.getByText('VL186 (VL)'));

        fireEvent.change(screen.getByLabelText('Véhicule utilisé'), { target: { value: 'VL001' } });
        expect(onChange).toHaveBeenCalledWith({ vehicle_id: 'VL001', driver_id: null });
    });

    it('ne montre que les chauffeurs CHVPSP pour un véhicule VPSP', async () => {
        mockFetch();
        render(<Step2Vehicle data={{ ...baseData, vehicle_id: 'VPSP001' }} onChange={vi.fn()} />);
        await waitFor(() => expect(screen.getByText('Marie Curie')).toBeTruthy());
        expect(screen.queryByText('Jean Dupont')).toBeNull();
    });

    it('bascule Pegass à jour', () => {
        mockFetch();
        const onChange = vi.fn();
        render(<Step2Vehicle data={baseData} onChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Non' }));
        expect(onChange).toHaveBeenCalledWith({ pegass_ok: false });
    });

    it('indique que les bénévoles sont requis si Pegass n\'est pas à jour', () => {
        mockFetch();
        render(<Step2Vehicle data={{ ...baseData, pegass_ok: false }} onChange={vi.fn()} />);
        expect(screen.getByText('Requis car inscriptions Pegass non à jour.')).toBeTruthy();
    });

    it('affiche l\'option "Moi" pour l\'utilisateur courant si non-VPSP', async () => {
        mockFetch();
        render(<Step2Vehicle data={baseData} onChange={vi.fn()} currentUserId="u1" currentUserName="Jean Dupont" />);
        await waitFor(() => expect(screen.getByText('Moi (Jean Dupont)')).toBeTruthy());
    });
});
