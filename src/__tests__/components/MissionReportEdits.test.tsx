/**
 * Tests composants — accident bénévole et historique des modifications :
 *   - Step6Incidents : bloc « Accident bénévole » (Oui/Non, description, vidage)
 *   - MissionEditHistory : entrées, date Europe/Paris, « ancienne → nouvelle »
 *   - fiche /missions/[id] : onglet historique absent/présent, bouton « Modifier » selon can_edit
 *   - /missions/[id]/edit : refus sans droit de modifier
 *   - liste /missions : RESP_MISSION arrive sur « Tous les rapports », sans création
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: vi.fn(() => ({ push })),
    useParams: vi.fn(() => ({ id: 'r1' })),
    usePathname: vi.fn(() => '/missions/r1/edit'),
}));
vi.mock('next-auth/react', () => ({ useSession: vi.fn() }));

import Step6Incidents from '@/components/missions/steps/Step6Incidents';
import MissionEditHistory, { formatEditDate } from '@/components/missions/MissionEditHistory';
import MissionDetailPage from '@/app/missions/[id]/page';
import EditMissionPage from '@/app/missions/[id]/edit/page';
import MissionsPage from '@/app/missions/page';
import MissionWizard from '@/components/missions/MissionWizard';
import Step2Vehicle from '@/components/missions/steps/Step2Vehicle';
import MissionsTable, { type MissionReport } from '@/app/missions/MissionsTable';
import type { MissionFormData } from '@/components/missions/MissionWizard';
import { useSession } from 'next-auth/react';

const mockUseSession = vi.mocked(useSession);

function mockSession(roles: string[]) {
    mockUseSession.mockReturnValue({
        status: 'authenticated',
        data: { user: { id: 'me', roles, ulId: 'ul-18', availableULs: [{ id: 'ul-18', name: 'Paris 18', isHome: true }] } },
    } as never);
}

const formData: MissionFormData = {
    selected_ul_id: 'ul-18', selected_dt_code: null, mission_type: 'DPS', mission_name: 'M',
    mission_date: '2026-03-15', location: 'L', volunteers: '', pegass_ok: true, vehicle_id: null,
    driver_id: null, victim_count: 0, presence_ul: null, team_dynamics: null, all_found_place: null,
    member_difficulties: null, free_comment: null, mission_comment: null, had_acr: false,
    had_hemorrhage: false, had_complex_care: false, needs_followup: false,
    volunteer_accident: false, volunteer_accident_details: '',
    intervention_types: {}, intervention_natures: {},
};

function detail(overrides: Record<string, unknown> = {}) {
    return {
        id: 'r1', submitted_by: 'me', submitted_at: '2026-03-15T10:00:00Z', submitter_name: 'Moi',
        submitter_email: 'me@test.com', mission_type: 'RESEAU', mission_name: 'Poste Test',
        mission_date: '2026-03-15', location: 'Paris', volunteers: 'Jean', pegass_ok: true,
        vehicle_id: null, vehicle_name: null, vehicle_type: null, driver_id: null, driver_name: null,
        driver_email: null, victim_count: 0, presence_ul: null, team_dynamics: null,
        all_found_place: null, member_difficulties: null, free_comment: null, mission_comment: null,
        had_acr: false, had_hemorrhage: false, had_complex_care: false, needs_followup: false,
        volunteer_accident: false, volunteer_accident_details: null,
        drive_folder_id: null, signed_report_drive_id: null, ulName: 'Paris 18', dtCode: null,
        supplies: {}, interventions: { mode: {}, nature: {} }, can_edit: false, edits: [],
        ...overrides,
    };
}

function mockFetchJson(body: unknown, status = 200) {
    vi.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(body), { status })));
}

beforeEach(() => {
    vi.restoreAllMocks();
    push.mockClear();
});

describe('Step6Incidents — accident bénévole', () => {
    it('Non par défaut, sans champ de description', () => {
        render(<Step6Incidents data={formData} onChange={vi.fn()} />);
        expect(screen.getByText('Accident bénévole')).toBeTruthy();
        expect(screen.queryByLabelText(/Description de l'accident/)).toBeNull();
    });

    it('Oui : déclare l\'accident ; la description apparaît et se saisit', () => {
        const onChange = vi.fn();
        const { rerender } = render(<Step6Incidents data={formData} onChange={onChange} />);
        const group = screen.getByRole('group', { name: 'Accident bénévole' });
        fireEvent.click(group.querySelectorAll('button')[0]);
        expect(onChange).toHaveBeenCalledWith({ volunteer_accident: true });

        rerender(<Step6Incidents data={{ ...formData, volunteer_accident: true }} onChange={onChange} />);
        const textarea = screen.getByLabelText(/Description de l'accident/);
        fireEvent.change(textarea, { target: { value: 'Entorse' } });
        expect(onChange).toHaveBeenCalledWith({ volunteer_accident_details: 'Entorse' });
    });

    it('Non : vide la description', () => {
        const onChange = vi.fn();
        render(<Step6Incidents data={{ ...formData, volunteer_accident: true, volunteer_accident_details: 'x' }} onChange={onChange} />);
        const group = screen.getByRole('group', { name: 'Accident bénévole' });
        fireEvent.click(group.querySelectorAll('button')[1]);
        expect(onChange).toHaveBeenCalledWith({ volunteer_accident: false, volunteer_accident_details: '' });
    });
});

describe('MissionEditHistory', () => {
    it('affiche auteur, date et heure de Paris, et chaque champ ancienne → nouvelle', () => {
        render(<MissionEditHistory edits={[{
            id: 'e1',
            edited_at: '2026-03-15T13:05:00.000Z',
            editor_name: 'Alice',
            changes: [{ field: 'location', label: 'Lieu', old: 'A', new: 'B' }],
        }]} />);
        expect(screen.getByText('Alice')).toBeTruthy();
        // 13:05 UTC = 14:05 à Paris (heure d'hiver).
        expect(screen.getByText('15/03/2026 à 14:05')).toBeTruthy();
        expect(screen.getByText('Lieu')).toBeTruthy();
        expect(screen.getByText('A')).toBeTruthy();
        expect(screen.getByText('B')).toBeTruthy();
    });

    it('formatEditDate gère l\'heure d\'été', () => {
        expect(formatEditDate('2026-07-01T08:00:00.000Z')).toBe('01/07/2026 à 10:00');
    });

    const makeEdits = (n: number) => Array.from({ length: n }, (_, i) => ({
        id: `e${i + 1}`,
        edited_at: '2026-03-15T13:05:00.000Z',
        editor_name: `Éditeur ${i + 1}`,
        changes: [{ field: 'location', label: 'Lieu', old: 'A', new: 'B' }],
    }));

    it('2 modifications au plus : tout sur une page, sans pagination', () => {
        render(<MissionEditHistory edits={makeEdits(2)} />);
        expect(screen.getByText('Éditeur 1')).toBeTruthy();
        expect(screen.getByText('Éditeur 2')).toBeTruthy();
        expect(screen.queryByRole('navigation', { name: /Pagination de l'historique/ })).toBeNull();
    });

    it('5 modifications : 2 par page, navigation précédente / suivante', () => {
        render(<MissionEditHistory edits={makeEdits(5)} />);
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
        expect(screen.getByText('Éditeur 1')).toBeTruthy();
        expect(screen.getByText('Éditeur 2')).toBeTruthy();
        expect(screen.queryByText('Éditeur 3')).toBeNull();
        expect(screen.getByText('Page 1 sur 3')).toBeTruthy();
        expect(screen.getByText('1 à 2 sur 5 modifications')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Page précédente' }) as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
        expect(screen.getByText('Éditeur 3')).toBeTruthy();
        expect(screen.getByText('Éditeur 4')).toBeTruthy();
        expect(screen.queryByText('Éditeur 1')).toBeNull();
        expect(screen.getByText('Page 2 sur 3')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
        expect(screen.getAllByRole('listitem')).toHaveLength(1);
        expect(screen.getByText('Éditeur 5')).toBeTruthy();
        expect(screen.getByText('5 à 5 sur 5 modifications')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Page suivante' }) as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Page précédente' }));
        expect(screen.getByText('Éditeur 3')).toBeTruthy();
    });
});

describe('Fiche /missions/[id]', () => {
    it('rapport jamais modifié : pas d\'onglet historique ; sans droit : pas de bouton Modifier', async () => {
        mockSession(['CADRE']);
        mockFetchJson(detail());
        render(<MissionDetailPage />);
        await screen.findByText('Informations mission');
        expect(screen.queryByRole('tab', { name: /Historique des modifications/ })).toBeNull();
        expect(screen.queryByRole('link', { name: /Modifier/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull();
    });

    it('rapport modifié : onglet historique, entrées listées ; can_edit : bouton Modifier', async () => {
        mockSession(['RESP_MISSION']);
        mockFetchJson(detail({
            can_edit: true,
            volunteer_accident: true,
            volunteer_accident_details: 'Entorse',
            edits: [
                { id: 'e2', edited_at: '2026-03-16T09:00:00Z', editor_name: 'Bruno', changes: [{ field: 'location', label: 'Lieu', old: 'A', new: 'B' }] },
                { id: 'e1', edited_at: '2026-03-15T09:00:00Z', editor_name: 'Alice', changes: [{ field: 'location', label: 'Lieu', old: 'Paris', new: 'A' }] },
            ],
        }));
        render(<MissionDetailPage />);
        await screen.findByText('Informations mission');
        expect(screen.getByText('Entorse')).toBeTruthy();
        const link = screen.getByRole('link', { name: /Modifier/ });
        expect(link.getAttribute('href')).toBe('/missions/r1/edit');
        // RESP_MISSION ne supprime pas.
        expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull();

        fireEvent.click(screen.getByRole('tab', { name: /Historique des modifications \(2\)/ }));
        const names = screen.getAllByText(/^(Alice|Bruno)$/).map(el => el.textContent);
        expect(names).toEqual(['Bruno', 'Alice']);
        expect(screen.queryByText('Informations mission')).toBeNull();
    });
});

describe('Fiche /missions/[id] — photos et rapport signé', () => {
    const folder = 'mission-com-photos/paris-18/dps-20260315-100000-a1b2';
    const signed = 'mission-report-photo/paris-18/dps-20260315-100000-c3d4/0a1b2c3d-rapport.jpg';

    it('références R2 : bouton Photos et rapport signé lu via /api/media/file', async () => {
        mockSession(['CADRE']);
        mockFetchJson(detail({ drive_folder_id: folder, signed_report_drive_id: signed }));
        render(<MissionDetailPage />);
        await screen.findByText('Informations mission');
        expect(screen.getByRole('button', { name: 'Voir les photos de communication' })).toBeTruthy();
        const img = screen.getByAltText('Rapport de mission signé') as HTMLImageElement;
        expect(img.src).toContain(`/api/media/file?key=${encodeURIComponent(signed)}`);
    });

    it('ids Drive résiduels : ni bouton Photos ni rapport signé', async () => {
        mockSession(['CADRE']);
        mockFetchJson(detail({ drive_folder_id: '1AbCdriveFolder', signed_report_drive_id: '1XyZdriveFile' }));
        render(<MissionDetailPage />);
        await screen.findByText('Informations mission');
        expect(screen.queryByRole('button', { name: 'Voir les photos de communication' })).toBeNull();
        expect(screen.queryByAltText('Rapport de mission signé')).toBeNull();
        expect(screen.queryByText('Rapport signé')).toBeNull();
    });
});

describe('Fiche /missions/[id] — bouton Supprimer', () => {
    it.each([
        [['ADMIN'], true],
        [['SUPER_ADMIN'], true],
        [['ADMIN', 'INACTIF'], false],
    ])('rôles %j → bouton présent : %s', async (roles, present) => {
        mockSession(roles as string[]);
        mockFetchJson(detail());
        render(<MissionDetailPage />);
        await screen.findByText('Informations mission');
        expect(screen.queryByRole('button', { name: /Supprimer/ }) !== null).toBe(present);
    });
});

describe('/missions/[id]/edit', () => {
    it('sans droit de modifier : affiche un refus, pas le formulaire', async () => {
        mockSession(['CADRE']);
        mockFetchJson(detail({ can_edit: false }));
        render(<EditMissionPage />);
        await screen.findByText('Modification impossible');
        expect(screen.queryByText(/Enregistrer les modifications/)).toBeNull();
    });

    it('401 : redirige vers la connexion en revenant sur la page', async () => {
        mockSession(['CI/RPAPS']);
        mockFetchJson({ error: 'Non authentifié' }, 401);
        render(<EditMissionPage />);
        await waitFor(() => expect(push).toHaveBeenCalledWith(`/login?callbackUrl=${encodeURIComponent('/missions/r1/edit')}`));
        expect(screen.queryByText('Modification impossible')).toBeNull();
    });

    it('404 : compte rendu introuvable', async () => {
        mockSession(['ADMIN']);
        mockFetchJson({ error: 'Compte rendu non trouvé' }, 404);
        render(<EditMissionPage />);
        await screen.findByText('Compte rendu introuvable');
        expect(screen.queryByText(/pas le droit/)).toBeNull();
    });

    it('500 ou erreur réseau : erreur de chargement générique', async () => {
        mockSession(['ADMIN']);
        mockFetchJson({ error: 'boom' }, 500);
        const { unmount } = render(<EditMissionPage />);
        await screen.findByText('Chargement impossible');
        unmount();
        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
        render(<EditMissionPage />);
        await screen.findByText('Chargement impossible');
    });

    it('rapport inaccessible (403) : refus', async () => {
        mockSession(['CHVL']);
        mockFetchJson({ error: 'Accès refusé' }, 403);
        render(<EditMissionPage />);
        await screen.findByText('Modification impossible');
    });

    it('avec droit : wizard pré-rempli, sans étape UL / DT', async () => {
        mockSession(['RESP_MISSION']);
        mockFetchJson(detail({ can_edit: true }));
        render(<EditMissionPage />);
        await screen.findByText('Modifier le compte rendu');
        expect(screen.getByRole('heading', { name: /Étape 1 \/ \d+ — Général/ })).toBeTruthy();
        expect((screen.getByDisplayValue('Poste Test') as HTMLInputElement).value).toBe('Poste Test');
    });
});

describe('Liste /missions — périmètre par défaut selon le rôle', () => {
    it.each([
        [['ADMIN'], 'mine'],
        [['CI/RPAPS'], 'mine'],
        [['CADRE'], 'all'],
        [['PRESIDENT'], 'all'],
        [['RESP_MISSION'], 'all'],
    ])('rôles %j → scope=%s', async (roles, scope) => {
        mockSession(roles as string[]);
        const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ reports: [], total: 0 }), { status: 200 })));
        render(<MissionsPage />);
        await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
        expect(String(fetchSpy.mock.calls[0][0])).toContain(`scope=${scope}`);
    });
});

describe('Liste /missions — RESP_MISSION', () => {
    it('arrive sur « Tous les rapports » de son UL, sans bouton de création', async () => {
        mockSession(['RESP_MISSION']);
        const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ reports: [], total: 0 }), { status: 200 })));
        render(<MissionsPage />);
        await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
        expect(String(fetchSpy.mock.calls[0][0])).toContain('scope=all');
        expect(screen.getByRole('tab', { name: /Tous les rapports/ }).getAttribute('aria-selected')).toBe('true');
        expect(screen.queryByRole('link', { name: /Nouveau compte rendu/ })).toBeNull();
        expect(push).not.toHaveBeenCalled();
    });
});

describe('MissionWizard — mode édition', () => {
    it('sans étapes UL / DT, rapport signé ni photos ; enregistre en PATCH sans upload', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ success: true, changed: true }), { status: 200 })));
        const onSuccess = vi.fn();
        render(
            <MissionWizard
                edit={{ reportId: 'r1', formData: { ...formData, mission_type: 'DPS' }, supplies: {}, hasSignedReport: true }}
                onSuccess={onSuccess}
            />,
        );
        const heading = screen.getByRole('heading', { name: /Étape 1 \/ (\d+) — Général/ });
        const total = Number(/\/ (\d+)/.exec(heading.textContent ?? '')![1]);
        // Général, Équipage, Matériel, Oxygène, Équipe, Incidents, Commentaire — même en DPS.
        expect(total).toBe(7);
        for (let i = 1; i < total; i++) fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        expect(screen.queryByRole('button', { name: 'Passer' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('r1'));
        const patchCall = fetchSpy.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
        expect(patchCall?.[0]).toBe('/api/missions/r1');
        const body = JSON.parse((patchCall![1] as RequestInit).body as string);
        expect(body).toMatchObject({ mission_name: 'M', volunteer_accident: false, volunteer_accident_details: null });
        expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/api/media/upload'))).toBe(false);
    });

    it('accident = Oui sans description : bloqué à l\'étape Incidents', () => {
        vi.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
        render(
            <MissionWizard
                edit={{ reportId: 'r1', formData: { ...formData, volunteer_accident: true }, supplies: {}, hasSignedReport: true }}
                onSuccess={vi.fn()}
            />,
        );
        for (let i = 0; i < 6; i++) {
            if (screen.queryByRole('heading', { name: /— Incidents$/ })) break;
            fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        }
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        expect(screen.getByRole('alert').textContent).toContain('Décrivez l\'accident');
    });
});

describe('MissionWizard — édition sans rapport signé', () => {
    it('passer de RESEAU à DPS/PAPS est bloqué à l\'étape Général', () => {
        vi.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
        render(
            <MissionWizard
                edit={{ reportId: 'r1', formData: { ...formData, mission_type: 'RESEAU' }, supplies: {}, hasSignedReport: false }}
                onSuccess={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('radio', { name: 'PAPS' }));
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        expect(screen.getByRole('alert').textContent).toContain('pas de rapport signé');
        expect(screen.getByRole('heading', { name: /— Général$/ })).toBeTruthy();
    });

    it('un rapport déjà DPS sans rapport signé (ancien) reste modifiable', () => {
        vi.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
        render(
            <MissionWizard
                edit={{ reportId: 'r1', formData: { ...formData, mission_type: 'DPS' }, supplies: {}, hasSignedReport: false }}
                onSuccess={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByRole('heading', { name: /— Équipage$/ })).toBeTruthy();
    });

    it('un rapport RESEAU sans rapport signé reste modifiable', () => {
        vi.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
        render(
            <MissionWizard
                edit={{ reportId: 'r1', formData: { ...formData, mission_type: 'RESEAU' }, supplies: {}, hasSignedReport: false }}
                onSuccess={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByRole('heading', { name: /— Équipage$/ })).toBeTruthy();
    });
});

describe('Step2Vehicle — valeurs enregistrées absentes des listes', () => {
    it('listes refusées (403) : véhicule et conducteur enregistrés restent sélectionnés, avec leur nom', async () => {
        vi.spyOn(global, 'fetch').mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403 })));
        render(
            <Step2Vehicle
                data={{ ...formData, vehicle_id: 'v-other-ul', driver_id: 'u-driver' }}
                onChange={vi.fn()}
                stored={{ vehicle: { id: 'v-other-ul', name: 'VPSP Paris 4' }, driver: { id: 'u-driver', name: 'Bruno' } }}
            />,
        );
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        const vehicle = screen.getByLabelText('Véhicule utilisé') as HTMLSelectElement;
        const driver = screen.getByLabelText('Chauffeur') as HTMLSelectElement;
        expect(vehicle.value).toBe('v-other-ul');
        expect(vehicle.selectedOptions[0].textContent).toBe('VPSP Paris 4');
        expect(driver.value).toBe('u-driver');
        expect(driver.selectedOptions[0].textContent).toBe('Bruno');
    });

    it('après avoir choisi une autre valeur, la valeur enregistrée reste proposée et resélectionnable', async () => {
        vi.spyOn(global, 'fetch').mockImplementation((input: string | URL | Request) => {
            const url = String(input);
            const body = url.includes('vehicles') ? [{ id: 'v1', name: 'VL 18', type: 'VL' }] : { users: [] };
            return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
        });
        const onChange = vi.fn();
        // L'éditeur a déjà choisi « VL 18 » : la valeur enregistrée (autre UL) n'est plus sélectionnée.
        render(
            <Step2Vehicle
                data={{ ...formData, vehicle_id: 'v1', driver_id: null }}
                onChange={onChange}
                stored={{ vehicle: { id: 'v-other-ul', name: 'VPSP Paris 4' }, driver: { id: 'u-driver', name: 'Bruno' } }}
            />,
        );
        await screen.findByText('VL 18 (VL)');
        expect(screen.getByRole('option', { name: 'VPSP Paris 4' })).toBeTruthy();
        expect(screen.getByRole('option', { name: 'Bruno' })).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Véhicule utilisé'), { target: { value: 'v-other-ul' } });
        expect(onChange).toHaveBeenCalledWith({ vehicle_id: 'v-other-ul', driver_id: null });
        fireEvent.change(screen.getByLabelText('Chauffeur'), { target: { value: 'u-driver' } });
        expect(onChange).toHaveBeenCalledWith({ driver_id: 'u-driver' });
    });

    it('valeur présente dans la liste chargée : pas d\'option en double', async () => {
        vi.spyOn(global, 'fetch').mockImplementation((input: string | URL | Request) => {
            const url = String(input);
            const body = url.includes('vehicles') ? [{ id: 'v1', name: 'VL 18', type: 'VL' }] : { users: [] };
            return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
        });
        render(
            <Step2Vehicle
                data={{ ...formData, vehicle_id: 'v1' }}
                onChange={vi.fn()}
                stored={{ vehicle: { id: 'v1', name: 'VL 18' }, driver: null }}
            />,
        );
        await screen.findByText('VL 18 (VL)');
        expect(screen.queryByRole('option', { name: 'VL 18' })).toBeNull();
    });
});

describe('MissionsTable — accident bénévole', () => {
    it('affiche le pictogramme d\'incident pour un accident bénévole seul', () => {
        const report: MissionReport = {
            id: 'r1', mission_type: 'RESEAU', mission_name: 'M', mission_date: '2026-03-15', location: 'L',
            victim_count: 0, presence_ul: null, had_acr: false, had_hemorrhage: false, had_complex_care: false,
            needs_followup: false, volunteer_accident: true, submitted_at: '2026-03-15T10:00:00Z',
            submitter_name: null, vehicle_name: null, ul_name: 'Paris 18', dt_code: null,
        };
        const { rerender } = render(<MissionsTable reports={[report]} />);
        expect(screen.getAllByTitle('Incidents signalés').length).toBeGreaterThan(0);
        rerender(<MissionsTable reports={[{ ...report, volunteer_accident: false }]} />);
        expect(screen.queryAllByTitle('Incidents signalés')).toHaveLength(0);
    });
});
