/**
 * Tests du panneau de filtres de la Vue DT.
 *
 * Fichiers testés : src/app/vehicles/DtFilterPanel.tsx, src/app/vehicles/dtFilters.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DtFilterPanel from '@/app/vehicles/DtFilterPanel';
import { applyDtFilters, buildDtSummary, buildDtFilterParams, parseDtFilterParams, type DtMode } from '@/app/vehicles/dtFilters';
import { parseDtWindow, type DtAvailabilityStatus } from '@/lib/dtAvailability';
import type { DashboardVehicle } from '@/app/vehicles/types';

// Mercredi 7 octobre 2026, 10:07 (heure locale du navigateur de test).
const NOW = new Date(2026, 9, 7, 10, 7);

function vehicle(id: string, type: string, status: DtAvailabilityStatus): DashboardVehicle {
    return {
        id, name: id, type, plate: `${id}-PL`, status: 'AVAILABLE', hasActiveMaintenance: false,
        parkingSpot: null, fuelLevel: 50, mileage: 1000, hasDSA: false, notes: null, vin: null,
        connection: null, fuelType: null, transmission: null, ulName: 'Paris 18', trips: [],
        availability: { status, missionSince: null, reservations: [] },
    };
}

const VEHICLES = [
    vehicle('VPSP-libre', 'VPSP', 'AVAILABLE'),
    vehicle('VPSP-reserve', 'VPSP', 'RESERVED'),
    vehicle('VL-libre', 'vl', 'AVAILABLE'),
    vehicle('VL-maint', 'VL', 'MAINTENANCE'),
];

/** Harnais : même câblage que la page (état contrôlé + filtrage à facettes), sans URL. */
function Harness(props: { initialMode?: DtMode; initialFrom?: string | null; initialTo?: string | null }) {
    const [mode, setMode] = useState<DtMode>(props.initialMode ?? 'now');
    const [from, setFrom] = useState<string | null>(props.initialFrom ?? null);
    const [to, setTo] = useState<string | null>(props.initialTo ?? null);
    const [dispo, setDispo] = useState<DtAvailabilityStatus[]>([]);
    const [types, setTypes] = useState<string[]>([]);

    const check = mode === 'period' ? parseDtWindow(from, to, NOW) : null;
    const periodError = check && !check.ok ? check : null;
    const facets = applyDtFilters(VEHICLES, { dispo, types });
    const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

    return (
        <>
            <DtFilterPanel
                mode={mode}
                from={from}
                to={to}
                periodError={periodError}
                dispo={dispo}
                dispoCounts={periodError ? null : facets.dispoCounts}
                types={facets.activeTypes}
                typeOptions={facets.typeOptions}
                summary={buildDtSummary({ count: facets.visible.length, types: facets.activeTypes, dispo, mode, from, to, now: NOW })}
                busy={false}
                onModeChange={(m) => {
                    setMode(m);
                    if (m === 'now') { setFrom(null); setTo(null); }
                    else { setFrom(new Date(2026, 9, 8, 8).toISOString()); setTo(new Date(2026, 9, 8, 20).toISOString()); }
                }}
                onPeriodChange={(f, t) => { setMode('period'); setFrom(f.toISOString()); setTo(t.toISOString()); }}
                onToggleDispo={(s) => setDispo((d) => toggle(d, s))}
                onToggleType={(t) => setTypes((ts) => toggle(ts, t))}
                onReset={() => { setMode('now'); setFrom(null); setTo(null); setDispo([]); setTypes([]); }}
                now={NOW}
            />
            <ul aria-label="Résultats">
                {facets.visible.map((v) => <li key={v.id}>{v.name}</li>)}
            </ul>
        </>
    );
}

const results = () => within(screen.getByRole('list', { name: 'Résultats' })).queryAllByRole('listitem').map((li) => li.textContent);

describe('DtFilterPanel', () => {
    it('bascule Maintenant → Période : champs préremplis, puce « Potentiellement disponibles » ajoutée', () => {
        render(<Harness />);
        const now = screen.getByRole('radio', { name: 'Maintenant' });
        expect(now.getAttribute('aria-checked')).toBe('true');
        expect(screen.queryByLabelText('Début')).toBeNull();
        expect(screen.queryByRole('button', { name: /Potentiellement disponibles/ })).toBeNull();

        fireEvent.click(screen.getByRole('radio', { name: 'Période' }));

        expect(screen.getByRole('radio', { name: 'Période' }).getAttribute('aria-checked')).toBe('true');
        expect((screen.getByLabelText('Début') as HTMLInputElement).value).toBe('2026-10-08T08:00');
        expect((screen.getByLabelText('Fin') as HTMLInputElement).value).toBe('2026-10-08T20:00');
        expect(screen.getByRole('button', { name: /Potentiellement disponibles/ })).toBeTruthy();
    });

    it('les flèches changent d’option dans le groupe Quand', () => {
        const onModeChange = vi.fn();
        render(
            <DtFilterPanel
                mode="now" from={null} to={null} periodError={null} dispo={[]} dispoCounts={null}
                types={[]} typeOptions={[]} summary="" busy={false}
                onModeChange={onModeChange} onPeriodChange={vi.fn()} onToggleDispo={vi.fn()}
                onToggleType={vi.fn()} onReset={vi.fn()} now={NOW}
            />,
        );
        fireEvent.keyDown(screen.getByRole('radio', { name: 'Maintenant' }), { key: 'ArrowRight' });
        expect(onModeChange).toHaveBeenCalledWith('period');
    });

    it('raccourcis : remplissent les champs et apparaissent actifs tant qu’ils correspondent', () => {
        render(<Harness initialMode="period" initialFrom={new Date(2026, 9, 8, 8).toISOString()} initialTo={new Date(2026, 9, 8, 20).toISOString()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Demain' }));
        expect((screen.getByLabelText('Début') as HTMLInputElement).value).toBe('2026-10-08T00:00');
        expect((screen.getByLabelText('Fin') as HTMLInputElement).value).toBe('2026-10-08T23:59');
        expect(screen.getByRole('button', { name: 'Demain' }).getAttribute('aria-pressed')).toBe('true');

        fireEvent.click(screen.getByRole('button', { name: 'Ce week-end' }));
        expect((screen.getByLabelText('Début') as HTMLInputElement).value).toBe('2026-10-10T00:00');
        expect((screen.getByLabelText('Fin') as HTMLInputElement).value).toBe('2026-10-11T23:59');
        expect(screen.getByRole('button', { name: 'Demain' }).getAttribute('aria-pressed')).toBe('false');

        fireEvent.click(screen.getByRole('button', { name: 'Aujourd’hui' }));
        expect((screen.getByLabelText('Début') as HTMLInputElement).value).toBe('2026-10-07T10:00');
        expect((screen.getByLabelText('Fin') as HTMLInputElement).value).toBe('2026-10-07T23:59');

        fireEvent.click(screen.getByRole('button', { name: '7 prochains jours' }));
        expect((screen.getByLabelText('Début') as HTMLInputElement).value).toBe('2026-10-07T10:00');
        expect((screen.getByLabelText('Fin') as HTMLInputElement).value).toBe('2026-10-14T10:00');
    });

    it('puces : OU dans un groupe, ET entre groupes, compteurs à facettes', () => {
        render(<Harness />);
        // Types normalisés : « vl » et « VL » tombent dans la même puce.
        expect(screen.getByRole('button', { name: 'VL, 2 véhicules' })).toBeTruthy();
        expect(results()).toHaveLength(4);

        fireEvent.click(screen.getByRole('button', { name: 'VPSP, 2 véhicules' }));
        expect(results()).toEqual(['VPSP-libre', 'VPSP-reserve']);
        expect(screen.getByRole('button', { name: 'VPSP, 2 véhicules' }).getAttribute('aria-pressed')).toBe('true');
        // Le filtre Type agit sur les compteurs de Disponibilité, pas sur ses propres compteurs.
        expect(screen.getByRole('button', { name: 'Maintenance, 0 véhicule' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'VL, 2 véhicules' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'VL, 2 véhicules' }));
        expect(results()).toHaveLength(4); // OU

        fireEvent.click(screen.getByRole('button', { name: 'Disponibles, 2 véhicules' }));
        expect(results()).toEqual(['VPSP-libre', 'VL-libre']); // ET
        expect(screen.getByRole('button', { name: 'VPSP, 1 véhicule' })).toBeTruthy();
        expect(screen.getByText('2 véhicules · VPSP, VL · disponibles maintenant')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
        expect(results()).toHaveLength(4);
        expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Maintenant' }));
    });

    it('fin ≤ début : message relié au champ Fin, compteurs « — »', () => {
        render(<Harness initialMode="period" initialFrom={new Date(2026, 9, 8, 8).toISOString()} initialTo={new Date(2026, 9, 8, 20).toISOString()} />);

        fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-10-08T07:00' } });

        const fin = screen.getByLabelText('Fin');
        expect(screen.getByRole('alert').textContent).toContain('La fin doit être après le début.');
        expect(fin.getAttribute('aria-invalid')).toBe('true');
        expect(fin.getAttribute('aria-describedby')).toBe('dt-period-error');
        expect(screen.getByRole('button', { name: 'VPSP, nombre inconnu' }).textContent).toContain('—');
    });

    it('début placé après la fin : la fin est décalée en conservant la durée', () => {
        render(<Harness initialMode="period" initialFrom={new Date(2026, 9, 8, 8).toISOString()} initialTo={new Date(2026, 9, 8, 20).toISOString()} />);

        fireEvent.change(screen.getByLabelText('Début'), { target: { value: '2026-10-09T09:00' } });

        expect((screen.getByLabelText('Fin') as HTMLInputElement).value).toBe('2026-10-09T21:00');
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('période passée : message et lien « Revenir à Maintenant »', () => {
        render(<Harness initialMode="period" initialFrom={new Date(2026, 9, 1, 8).toISOString()} initialTo={new Date(2026, 9, 1, 20).toISOString()} />);

        expect(screen.getByRole('alert').textContent).toContain('Cette période est terminée.');
        fireEvent.click(screen.getByRole('button', { name: 'Revenir à Maintenant' }));

        expect(screen.getByRole('radio', { name: 'Maintenant' }).getAttribute('aria-checked')).toBe('true');
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('phrase de synthèse d’une période entamée', () => {
        const summary = buildDtSummary({
            count: 1, types: [], dispo: [], mode: 'period',
            from: new Date(2026, 9, 7, 8).toISOString(), to: new Date(2026, 9, 7, 20).toISOString(), now: NOW,
        });
        expect(summary).toMatch(/^1 véhicule · tous types · tous statuts du .* au .* · calculé à partir de maintenant \(10:07\)$/);
    });
});

describe('dtFilters — URL', () => {
    it('aller-retour état ↔ URL, défauts omis, autres paramètres conservés', () => {
        const from = new Date(2026, 9, 10, 8).toISOString();
        const to = new Date(2026, 9, 10, 20).toISOString();
        const params = buildDtFilterParams(new URLSearchParams('autre=1'), true, {
            mode: 'period', from, to, dispo: ['AVAILABLE', 'RESERVED'], types: ['VPSP', 'VL'],
        });
        expect(params.get('autre')).toBe('1');
        expect(params.get('dispo')).toBe('disponible,reserve');
        expect(parseDtFilterParams(params)).toEqual({
            isDt: true,
            state: { mode: 'period', from, to, dispo: ['AVAILABLE', 'RESERVED'], types: ['VPSP', 'VL'] },
        });

        const defaults = buildDtFilterParams(new URLSearchParams(), true, { mode: 'now', from: null, to: null, dispo: [], types: [] });
        expect(defaults.toString()).toBe('vue=dt');
        expect(buildDtFilterParams(params, false, { mode: 'now', from: null, to: null, dispo: [], types: [] }).toString()).toBe('autre=1');
    });

    it('valeurs invalides ignorées', () => {
        const parsed = parseDtFilterParams(new URLSearchParams('vue=dt&quand=periode&debut=nimportequoi&fin=2026-10-10T18:00:00.000Z&dispo=disponible,inconnu&type=vpsp,,VPSP'));
        expect(parsed.state).toEqual({ mode: 'now', from: null, to: null, dispo: ['AVAILABLE'], types: ['VPSP'] });
    });
});
