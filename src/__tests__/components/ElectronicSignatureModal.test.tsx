import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ElectronicSignatureModal, { type SignatureData } from '@/components/expenses/ElectronicSignatureModal';

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ElectronicSignatureModal', () => {
    it('ne rend rien si isOpen est false', () => {
        const { container } = render(
            <ElectronicSignatureModal isOpen={false} onClose={vi.fn()} onSign={vi.fn()} signerName="Jean Dupont" signerEmail="jean@test.com" roleTitle="Demandeur" />
        );
        expect(container.firstChild).toBeNull();
    });

    it('pré-remplit le nom du signataire et la fonction par défaut', () => {
        render(
            <ElectronicSignatureModal isOpen onClose={vi.fn()} onSign={vi.fn()} signerName="Jean Dupont" signerEmail="jean@test.com" roleTitle="Demandeur" />
        );
        expect(screen.getByDisplayValue('Jean Dupont')).toBeTruthy();
        expect(screen.getByDisplayValue('Bénévole local')).toBeTruthy();
        expect(screen.getByText('jean@test.com')).toBeTruthy();
    });

    it('refuse la signature sans case d\'engagement cochée', () => {
        const onSign = vi.fn();
        render(
            <ElectronicSignatureModal isOpen onClose={vi.fn()} onSign={onSign} signerName="Jean Dupont" signerEmail="jean@test.com" roleTitle="Demandeur" />
        );
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: /Signer et soumettre/ }));

        expect(window.alert).toHaveBeenCalledWith('Veuillez cocher la case d’engagement pour valider votre signature.');
        expect(onSign).not.toHaveBeenCalled();
    });

    it('refuse une signature stylisée sans texte saisi', () => {
        const onSign = vi.fn();
        render(
            <ElectronicSignatureModal isOpen onClose={vi.fn()} onSign={onSign} signerName="Jean Dupont" signerEmail="jean@test.com" roleTitle="Demandeur" />
        );
        fireEvent.change(screen.getByDisplayValue('Jean Dupont'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: /Signer et soumettre/ }));

        expect(window.alert).toHaveBeenCalledWith('Veuillez saisir votre prénom et nom.');
        expect(onSign).not.toHaveBeenCalled();
    });

    it('signe avec le mode stylisé (happy path) et appelle onSign', () => {
        const onSign = vi.fn();
        render(
            <ElectronicSignatureModal isOpen onClose={vi.fn()} onSign={onSign} signerName="Jean Dupont" signerEmail="jean@test.com" roleTitle="Demandeur" />
        );

        fireEvent.click(screen.getByRole('button', { name: /Signer et soumettre/ }));

        expect(onSign).toHaveBeenCalledTimes(1);
        const [signatureData, functionTitle] = onSign.mock.calls[0] as [SignatureData, string];
        expect(signatureData.mode).toBe('typed');
        expect(signatureData.name).toBe('Jean Dupont');
        expect(signatureData.userEmail).toBe('jean@test.com');
        expect(signatureData.hash).toMatch(/^ysg_/);
        expect(functionTitle).toBe('Bénévole local');
    });

    it('utilise "valider" plutôt que "soumettre" pour un rôle non-Demandeur', () => {
        render(
            <ElectronicSignatureModal isOpen onClose={vi.fn()} onSign={vi.fn()} signerName="Jean Dupont" signerEmail="jean@test.com" roleTitle="Responsable / Valideur" />
        );
        expect(screen.getByRole('button', { name: /Signer et valider/ })).toBeTruthy();
    });

    it('bascule vers le mode manuscrit et exige un tracé', () => {
        const onSign = vi.fn();
        render(
            <ElectronicSignatureModal isOpen onClose={vi.fn()} onSign={onSign} signerName="Jean Dupont" signerEmail="jean@test.com" roleTitle="Demandeur" />
        );

        fireEvent.click(screen.getByRole('button', { name: /Tracer à la main/ }));
        expect(screen.getByText('Dessinez votre signature ici...')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /Signer et soumettre/ }));
        expect(window.alert).toHaveBeenCalledWith('Veuillez effectuer votre tracé manuscrit.');
        expect(onSign).not.toHaveBeenCalled();
    });

    it('appelle onClose au clic sur Annuler', () => {
        const onClose = vi.fn();
        render(
            <ElectronicSignatureModal isOpen onClose={onClose} onSign={vi.fn()} signerName="Jean Dupont" signerEmail="jean@test.com" roleTitle="Demandeur" />
        );
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('désactive les boutons pendant le chargement', () => {
        render(
            <ElectronicSignatureModal isOpen onClose={vi.fn()} onSign={vi.fn()} signerName="Jean Dupont" signerEmail="jean@test.com" roleTitle="Demandeur" loading />
        );
        expect((screen.getByRole('button', { name: 'Annuler' }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: /Signer et soumettre/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('réinitialise le formulaire à chaque réouverture', () => {
        const { rerender } = render(
            <ElectronicSignatureModal isOpen={false} onClose={vi.fn()} onSign={vi.fn()} signerName="Jean Dupont" signerEmail="jean@test.com" roleTitle="Demandeur" initialFunction="Président local" />
        );
        rerender(
            <ElectronicSignatureModal isOpen onClose={vi.fn()} onSign={vi.fn()} signerName="Jean Dupont" signerEmail="jean@test.com" roleTitle="Demandeur" initialFunction="Président local" />
        );
        expect(screen.getByDisplayValue('Président local')).toBeTruthy();
    });

    // Régression : l'aperçu est peint sur un fond clair figé, mais l'encre suivait
    // `var(--text-primary)` — clair sur clair en thème sombre, signature illisible.
    it('peint la signature stylisée en encre sombre, sans variable de thème', () => {
        const { getAllByText } = render(
            <ElectronicSignatureModal isOpen onClose={vi.fn()} onSign={vi.fn()} signerName="Jean Dupont" signerEmail="jean@test.com" role="requester" />
        );
        // Le nom apparaît aussi en en-tête : l'aperçu est celui rendu en italique.
        const apercu = getAllByText('Jean Dupont')
            .find(el => (el as HTMLElement).style.fontStyle === 'italic') as HTMLElement;
        expect(apercu).toBeTruthy();
        expect(apercu.style.color).toBe('rgb(30, 41, 59)');
        expect(apercu.style.color).not.toContain('var(');
        expect(apercu.style.borderBottom).not.toContain('var(');
    });

});
