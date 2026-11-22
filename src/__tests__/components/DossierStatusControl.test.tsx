import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import DossierStatusControl from '@/components/fleetTracking/DossierStatusControl';
import type { DossierCloseReason, DossierStatus } from '@/lib/fleetTracking/dossiers';

function setup(initial: DossierStatus = 'NEW') {
    const onPatch = vi.fn();
    // Reproduit le parent : le serveur renvoie le dossier mis à jour.
    function Harness() {
        const [d, setD] = useState<{ status: DossierStatus; closeReason: DossierCloseReason | null }>({ status: initial, closeReason: null });
        return (
            <DossierStatusControl
                dossier={d}
                busy={false}
                onPatch={body => {
                    onPatch(body);
                    setD({ status: body.status as DossierStatus, closeReason: (body.closeReason as DossierCloseReason | undefined) ?? null });
                }}
            />
        );
    }
    render(<Harness />);
    return onPatch;
}

describe('DossierStatusControl', () => {
    it('Nouveau → En attente envoie { status: WAITING }', () => {
        const onPatch = setup();
        fireEvent.change(screen.getByLabelText('Statut du dossier'), { target: { value: 'WAITING' } });
        expect(onPatch).toHaveBeenCalledWith({ status: 'WAITING' });
    });

    it('clore exige un motif : confirmation désactivée sans motif', () => {
        const onPatch = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Clore le dossier' }));
        const confirm = screen.getByRole('button', { name: 'Confirmer la clôture' }) as HTMLButtonElement;
        expect(confirm.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Motif de clôture'), { target: { value: 'REPAIRED' } });
        expect(confirm.disabled).toBe(false);
        fireEvent.click(confirm);
        expect(onPatch).toHaveBeenCalledWith({ status: 'CLOSED', closeReason: 'REPAIRED' });
    });

    it('annuler referme le formulaire sans rien envoyer', () => {
        const onPatch = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Clore le dossier' }));
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(screen.getByLabelText('Statut du dossier')).toBeTruthy();
        expect(onPatch).not.toHaveBeenCalled();
    });

    it('clore puis rouvrir : le sélecteur de statut revient, pas l\'ancien formulaire', () => {
        const onPatch = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Clore le dossier' }));
        fireEvent.change(screen.getByLabelText('Motif de clôture'), { target: { value: 'INSURANCE' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer la clôture' }));
        expect(screen.getByText('Motif : Pris en charge par l\'assurance')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Rouvrir le dossier' }));
        expect(onPatch).toHaveBeenLastCalledWith({ status: 'OPEN' });
        expect(screen.getByLabelText('Statut du dossier')).toBeTruthy();
        expect(screen.queryByLabelText('Motif de clôture')).toBeNull();
    });
});
