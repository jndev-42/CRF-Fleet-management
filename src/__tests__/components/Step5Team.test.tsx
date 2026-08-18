import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Step5Team from '@/components/missions/steps/Step5Team';
import type { MissionFormData } from '@/components/missions/MissionWizard';

const baseData: MissionFormData = {
    mission_type: 'DPS', mission_name: '', mission_date: '2026-01-01', location: '',
    volunteers: '', pegass_ok: true, vehicle_id: null, driver_id: null, victim_count: 0,
    presence_ul: null, team_dynamics: null, all_found_place: null, member_difficulties: null,
    free_comment: null, mission_comment: null, had_acr: false, had_hemorrhage: false,
    had_complex_care: false, needs_followup: false,
};

describe('Step5Team', () => {
    it('affiche le nom de l\'UL du soumetteur dans le libellé quand fourni', () => {
        render(<Step5Team data={baseData} onChange={vi.fn()} currentUserUlName="Paris 18" />);
        expect(screen.getByText('Présence UL Paris 18 ?')).toBeTruthy();
    });

    it('retombe sur "mon UL" quand le nom de l\'UL est indisponible', () => {
        render(<Step5Team data={baseData} onChange={vi.fn()} />);
        expect(screen.getByText('Présence mon UL ?')).toBeTruthy();
    });

    it('n\'affiche jamais "UL 18" en dur', () => {
        render(<Step5Team data={baseData} onChange={vi.fn()} currentUserUlName="Lyon" />);
        expect(screen.queryByText(/UL 18/)).toBeNull();
        expect(screen.getByText('Présence UL Lyon ?')).toBeTruthy();
    });

    it('émet presence_ul (et non ul18_present) au clic sur Oui', () => {
        const onChange = vi.fn();
        render(<Step5Team data={baseData} onChange={onChange} currentUserUlName="Paris 18" />);
        fireEvent.click(screen.getByRole('button', { name: 'Oui' }));
        expect(onChange).toHaveBeenCalledWith({ presence_ul: true });
    });

    it('efface les champs dépendants et repasse presence_ul à false sur Non', () => {
        const onChange = vi.fn();
        render(<Step5Team data={{ ...baseData, presence_ul: true }} onChange={onChange} currentUserUlName="Paris 18" />);
        // Several "Non" toggles are visible once dynamics fields are revealed —
        // the presence toggle is the first one rendered.
        fireEvent.click(screen.getAllByRole('button', { name: 'Non' })[0]);
        expect(onChange).toHaveBeenCalledWith({
            presence_ul: false, team_dynamics: null, all_found_place: null, member_difficulties: null, free_comment: null,
        });
    });

    it('révèle les champs de dynamique d\'équipe uniquement quand presence_ul est true', () => {
        const { rerender } = render(<Step5Team data={baseData} onChange={vi.fn()} />);
        expect(screen.queryByText('Dynamique d\'équipe *')).toBeNull();

        rerender(<Step5Team data={{ ...baseData, presence_ul: true }} onChange={vi.fn()} />);
        expect(screen.getByText('Dynamique d\'équipe *')).toBeTruthy();
    });
});
