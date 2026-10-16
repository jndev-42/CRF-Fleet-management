import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Step7SignedReport from '@/components/missions/steps/Step7SignedReport';

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
        render(<Step7SignedReport file={null} onChange={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Appareil photo/ }));

        expect(await screen.findByRole('dialog', { name: 'Scanner de document' })).toBeTruthy();
    });

    it('transmet le PDF scanné à onChange', async () => {
        const onChange = vi.fn();
        render(<Step7SignedReport file={null} onChange={onChange} />);

        fireEvent.click(screen.getByRole('button', { name: /Appareil photo/ }));
        fireEvent.click(await screen.findByText('mock-complete'));

        await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
        const file = onChange.mock.calls[0][0] as File;
        expect(file.name).toBe('compte-rendu-scan.pdf');
        expect(file.type).toBe('application/pdf');
    });
});
