import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Step7SignedReport, { type Step7SignedReportProps } from '@/components/missions/steps/Step7SignedReport';
import type { MissionFormData } from '@/components/missions/MissionWizard';

const FORM = {
    mission_type: 'DPS', signed_report_mode: 'PHOTO',
    crf_observations: '', organizer_observations: '', organizer_name: '', organizer_function: '',
} as MissionFormData;

/** Rend l'étape avec des valeurs par défaut ; `onChange` historique = changement de fichier. */
function Step({ file = null, onChange = vi.fn(), onFormChange = vi.fn(), ...rest }: { file?: File | null; onChange?: (f: File | null) => void; onFormChange?: Step7SignedReportProps['onChange'] } & Partial<Omit<Step7SignedReportProps, 'onChange'>>) {
    return (
        <Step7SignedReport
            data={FORM}
            onChange={onFormChange}
            file={file}
            onFileChange={onChange}
            signatures={{ team: null, organizer: null }}
            onSignaturesChange={vi.fn()}
            signerName="Alice"
            {...rest}
        />
    );
}


vi.mock('@/lib/imageCompression', () => ({
    compressImage: vi.fn((f: File) => Promise.resolve(f)),
    compressImages: vi.fn((files: File[]) => Promise.resolve(files)),
}));

vi.mock('@/components/ui/DocumentScanner', () => ({
    default: ({ onComplete }: { onComplete: (f: File) => void }) => (
        <div role="dialog" aria-label="Scanner de document">
            <button onClick={() => onComplete(new File(['pdf'], 'compte-rendu-scan.pdf', { type: 'application/pdf' }))}>mock-complete</button>
        </div>
    ),
}));

describe('Step7SignedReport — scanner', () => {
    it('« Appareil photo » ouvre le scanner de document', async () => {
        render(<Step />);

        fireEvent.click(screen.getByRole('button', { name: /Appareil photo/ }));

        expect(await screen.findByRole('dialog', { name: 'Scanner de document' })).toBeTruthy();
    });

    it('transmet le PDF scanné à onChange', async () => {
        const onChange = vi.fn();
        render(<Step onChange={onChange} />);

        fireEvent.click(screen.getByRole('button', { name: /Appareil photo/ }));
        fireEvent.click(await screen.findByText('mock-complete'));

        await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
        const file = onChange.mock.calls[0][0] as File;
        expect(file.name).toBe('compte-rendu-scan.pdf');
        expect(file.type).toBe('application/pdf');
    });
});

describe('Step7SignedReport — aperçu', () => {
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

    afterEach(() => {
        URL.createObjectURL = original.create;
        URL.revokeObjectURL = original.revoke;
    });

    it('une seule URL entre deux rendus, révoquée au démontage', () => {
        URL.createObjectURL = vi.fn(() => 'blob:rapport');
        URL.revokeObjectURL = vi.fn();
        const file = new File(['x'], 'rapport.jpg', { type: 'image/jpeg' });

        const { rerender, unmount } = render(<Step file={file} />);
        rerender(<Step file={file} />);

        expect(screen.getByAltText('Aperçu du rapport signé').getAttribute('src')).toBe('blob:rapport');
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();

        unmount();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:rapport');
    });
});

describe('Step7SignedReport — modes', () => {
    it('propose les trois choix et coche le mode courant', () => {
        render(<Step />);
        expect((screen.getByRole('radio', { name: /Prendre en photo/ }) as HTMLInputElement).checked).toBe(true);
        expect(screen.getByRole('radio', { name: /Signer \/ faire signer/ })).toBeTruthy();
        expect(screen.getByRole('radio', { name: /Ne pas fournir de rapport/ })).toBeTruthy();
    });

    it('un changement de choix est transmis', () => {
        const spy = vi.fn();
        render(<Step data={FORM} onFormChange={spy} />);
        fireEvent.click(screen.getByRole('radio', { name: /Ne pas fournir/ }));
        expect(spy).toHaveBeenCalledWith({ signed_report_mode: 'NONE' });
    });

    it('mode NONE : avertissement de responsabilité de l\u2019UL, sans sélecteur de fichier', () => {
        render(<Step data={{ ...FORM, signed_report_mode: 'NONE' }} />);
        expect(screen.getByRole('alert').textContent).toContain('L\u2019UL est responsable de l\u2019absence de rapport de mission signé');
        expect(screen.queryByRole('button', { name: /Appareil photo/ })).toBeNull();
    });

    it('mode APP : observations, signature de l\u2019équipe, organisateur ; signature organisateur désactivée sans nom ni fonction', () => {
        render(<Step data={{ ...FORM, signed_report_mode: 'APP' }} />);
        expect(screen.getByLabelText('Observations Croix-Rouge')).toBeTruthy();
        expect(screen.getByLabelText('Observations organisateur')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Signer en tant que responsable de l.équipe/ })).toBeTruthy();
        expect((screen.getByRole('button', { name: /Faire signer l.organisateur/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('mode APP : signature de l\u2019équipe via la modale', () => {
        const onSignaturesChange = vi.fn();
        render(<Step data={{ ...FORM, signed_report_mode: 'APP' }} onSignaturesChange={onSignaturesChange} />);
        fireEvent.click(screen.getByRole('button', { name: /Signer en tant que responsable de l.équipe/ }));
        expect(screen.getByText('Signature électronique')).toBeTruthy();
        expect(screen.getByRole('checkbox').closest('label')?.textContent).toContain('rapport de mission');
    });
});
