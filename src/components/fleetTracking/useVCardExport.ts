'use client';

import { useCallback, useState } from 'react';
import { CONTACTS_URL, readError } from './useFleetContacts';

const FALLBACK_NAME = 'Prestataires.vcf';

/** Nom proposé par `Content-Disposition`, sinon un nom par défaut. */
function fileNameFrom(res: Response): string {
    const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '');
    return match?.[1] ?? FALLBACK_NAME;
}

/**
 * Export `.vcf` : le fichier n'est proposé au téléchargement que sur une réponse
 * 200 ; sinon le message d'erreur de l'API est renvoyé (jamais un fichier JSON
 * d'erreur enregistré sous `.vcf`).
 */
export function useVCardExport() {
    const [exporting, setExporting] = useState(false);

    const exportVCard = useCallback(async (): Promise<string | null> => {
        setExporting(true);
        try {
            const res = await fetch(`${CONTACTS_URL}/vcard`, { cache: 'no-store' });
            if (!res.ok) return await readError(res, 'Export impossible');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileNameFrom(res);
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 0);
            return null;
        } catch {
            return 'Export impossible';
        } finally {
            setExporting(false);
        }
    }, []);

    return { exporting, exportVCard };
}
