import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import Step0ULSelection from '@/components/missions/steps/Step0ULSelection';
import type { MissionFormData } from '@/components/missions/MissionWizard';

const baseData: MissionFormData = {
    selected_ul_id: null, selected_dt_code: null,
    mission_type: 'DPS', mission_name: '', mission_date: '2026-01-01', location: '',
    volunteers: '', pegass_ok: true, vehicle_id: null, driver_id: null, victim_count: 0,
    presence_ul: null, team_dynamics: null, all_found_place: null, member_difficulties: null,
    free_comment: null, mission_comment: null, had_acr: false, had_hemorrhage: false,
    had_complex_care: false, needs_followup: false,
};

/** Deux UL partagent « DT 75 » : la liste DT doit dédupliquer. */
const UL_FIXTURE = {
    uls: [
        { id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18', dtCode: 'DT 75' },
        { id: 'ul-paris-4', name: 'Paris 4', slug: 'paris-4', dtCode: 'DT 75' },
        { id: 'ul-lyon-3', name: 'Lyon 3', slug: 'lyon-3', dtCode: null },
    ],
};

function mockUlFetch(handler: () => Promise<Response>) {
    const mock = vi.fn().mockImplementation(handler);
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

const okResponse = async () => new Response(JSON.stringify(UL_FIXTURE), { status: 200 });

async function findLoadedSelect() {
    const select = await screen.findByLabelText('Structure de rattachement *') as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
    return select;
}

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Step0ULSelection', () => {
    it('liste toutes les UL et une entrée par DT distincte', async () => {
        mockUlFetch(okResponse);
        render(<Step0ULSelection data={baseData} onChange={vi.fn()} />);

        const select = await findLoadedSelect();
        const values = Array.from(select.options).map(o => o.value);

        expect(values).toContain('ul:ul-paris-18');
        expect(values).toContain('ul:ul-paris-4');
        expect(values).toContain('ul:ul-lyon-3');
        // « DT 75 » est porté par deux UL mais ne doit apparaître qu'une fois,
        // et l'UL sans dtCode ne crée aucune entrée DT.
        expect(values.filter(v => v === 'dt:DT 75')).toHaveLength(1);
        expect(values.filter(v => v.startsWith('dt:'))).toHaveLength(1);
    });

    it('sélectionner une UL renseigne selected_ul_id et efface selected_dt_code', async () => {
        mockUlFetch(okResponse);
        const onChange = vi.fn();
        // Part d'un état où une DT était déjà choisie, pour prouver l'exclusivité.
        render(<Step0ULSelection data={{ ...baseData, selected_dt_code: 'DT 75' }} onChange={onChange} />);

        fireEvent.change(await findLoadedSelect(), { target: { value: 'ul:ul-lyon-3' } });

        expect(onChange).toHaveBeenCalledWith({ selected_ul_id: 'ul-lyon-3', selected_dt_code: null });
    });

    it('sélectionner une DT renseigne selected_dt_code et efface selected_ul_id', async () => {
        mockUlFetch(okResponse);
        const onChange = vi.fn();
        render(<Step0ULSelection data={{ ...baseData, selected_ul_id: 'ul-paris-18' }} onChange={onChange} />);

        fireEvent.change(await findLoadedSelect(), { target: { value: 'dt:DT 75' } });

        expect(onChange).toHaveBeenCalledWith({ selected_ul_id: null, selected_dt_code: 'DT 75' });
    });

    it('revenir sur « — Sélectionner — » remet les deux champs à null', async () => {
        mockUlFetch(okResponse);
        const onChange = vi.fn();
        render(<Step0ULSelection data={{ ...baseData, selected_ul_id: 'ul-paris-18' }} onChange={onChange} />);

        fireEvent.change(await findLoadedSelect(), { target: { value: '' } });

        expect(onChange).toHaveBeenCalledWith({ selected_ul_id: null, selected_dt_code: null });
    });

    it('reflète la sélection courante portée par `data`', async () => {
        mockUlFetch(okResponse);
        render(<Step0ULSelection data={{ ...baseData, selected_dt_code: 'DT 75' }} onChange={vi.fn()} />);

        expect((await findLoadedSelect()).value).toBe('dt:DT 75');
    });

    it('affiche une erreur quand le chargement des UL échoue', async () => {
        mockUlFetch(async () => new Response('boom', { status: 500 }));
        render(<Step0ULSelection data={baseData} onChange={vi.fn()} />);

        expect(await screen.findByRole('alert')).toHaveProperty(
            'textContent',
            expect.stringContaining('Impossible de charger la liste des UL'),
        );
        expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    });

    it('« Réessayer » relance le chargement et débloque l\'étape', async () => {
        // Premier appel en échec, second réussi : l'étape 1 n'a pas de « Précédent »,
        // donc sans ce bouton l'utilisateur resterait coincé.
        const fetchMock = mockUlFetch(async () => new Response('boom', { status: 500 }));
        render(<Step0ULSelection data={baseData} onChange={vi.fn()} />);

        await screen.findByRole('button', { name: 'Réessayer' });
        fetchMock.mockImplementation(okResponse);

        fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

        const select = await findLoadedSelect();
        expect(Array.from(select.options).map(o => o.value)).toContain('ul:ul-paris-18');
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
