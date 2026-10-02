'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Upload } from 'lucide-react';
import { looksLikePdf } from '@/lib/vehicleGuide';
import styles from './ReferentielTab.module.css';

interface ReferentielStatus {
    ready: boolean;
    fileName?: string;
    pageCount?: number;
    readyAt?: string | null;
    pending?: { id: string; fileName: string; status: string; pageCount: number | null; processedPages: number } | null;
}

interface ProcessResponse {
    processedPages: number;
    pageCount: number;
    done: boolean;
    error?: string;
}

interface ReferentielTabProps {
    showToast: (message: string, type: 'success' | 'error') => void;
}

type Phase =
    | { step: 'idle' }
    | { step: 'uploading'; percent: number }
    | { step: 'indexing'; processed: number; total: number | null };

/**
 * Envoie le fichier directement à R2 (URL signée) : le PDF ne passe jamais par
 * une fonction Vercel. `XMLHttpRequest` et non `fetch`, pour la progression d'envoi.
 */
function putWithProgress(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', 'application/pdf');
        xhr.upload.onprogress = e => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Envoi refusé (HTTP ${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Échec de l'envoi du fichier (réseau ou CORS)"));
        xhr.send(file);
    });
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({})) as T & { error?: string };
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');
    return data;
}

/** Onglet SUPER_ADMIN : import du PDF du référentiel secourisme et suivi de l'indexation. */
export default function ReferentielTab({ showToast }: ReferentielTabProps) {
    const [status, setStatus] = useState<ReferentielStatus | null>(null);
    const [phase, setPhase] = useState<Phase>({ step: 'idle' });
    const inputRef = useRef<HTMLInputElement>(null);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch('/api/referentiel');
            if (res.ok) setStatus(await res.json() as ReferentielStatus);
        } catch {
            // L'état affiché reste celui d'avant ; l'import peut quand même être lancé.
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    async function handleFile(file: File) {
        if (!looksLikePdf(file)) {
            showToast('Le fichier doit être un PDF.', 'error');
            return;
        }
        try {
            setPhase({ step: 'uploading', percent: 0 });
            const { id, uploadUrl } = await postJson<{ id: string; uploadUrl: string }>('/api/referentiel/upload', { fileName: file.name });
            await putWithProgress(uploadUrl, file, percent => setPhase({ step: 'uploading', percent }));

            await runIndexing(id, 1, 0, null);
            showToast('Référentiel importé et indexé.', 'success');
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : "Échec de l'import", 'error');
        } finally {
            setPhase({ step: 'idle' });
            if (inputRef.current) inputRef.current.value = '';
            void refresh();
        }
    }

    /** Appelle `process` lot après lot, jusqu'à la bascule (`done`). */
    async function runIndexing(id: string, fromPage: number, processed: number, total: number | null) {
        setPhase({ step: 'indexing', processed, total });
        let next = fromPage;
        for (;;) {
            const result = await postJson<ProcessResponse>('/api/referentiel/process', { id, fromPage: next });
            setPhase({ step: 'indexing', processed: result.processedPages, total: result.pageCount });
            if (result.done) return;
            next = result.processedPages + 1;
        }
    }

    /** Reprend un import interrompu (onglet fermé, coupure) là où il s'était arrêté, sans renvoyer le fichier. */
    async function handleResume(pending: NonNullable<ReferentielStatus['pending']>) {
        try {
            await runIndexing(pending.id, pending.processedPages + 1, pending.processedPages, pending.pageCount);
            showToast('Référentiel importé et indexé.', 'success');
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : "Échec de l'import", 'error');
        } finally {
            setPhase({ step: 'idle' });
            void refresh();
        }
    }

    const busy = phase.step !== 'idle';
    const percent = phase.step === 'uploading'
        ? phase.percent
        : phase.step === 'indexing' && phase.total
            ? Math.round((phase.processed / phase.total) * 100)
            : 0;

    return (
        <section className={styles.container}>
            <div className={styles.current}>
                <BookOpen size={18} aria-hidden="true" />
                {status?.ready ? (
                    <div>
                        <div className={styles.currentName}>{status.fileName}</div>
                        <div className={styles.meta}>
                            {status.pageCount} pages indexées
                            {status.readyAt ? ` · importé le ${new Date(status.readyAt.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR')}` : ''}
                        </div>
                    </div>
                ) : (
                    <div className={styles.meta}>Aucun référentiel importé</div>
                )}
            </div>

            {status?.pending && !busy && (
                <div className={styles.meta}>
                    <p>
                        Un import précédent est resté inachevé ({status.pending.fileName}
                        {status.pending.status === 'processing' && status.pending.pageCount
                            ? ` — ${status.pending.processedPages}/${status.pending.pageCount} pages`
                            : ''}). Un nouvel import l&apos;abandonne.
                    </p>
                    {status.pending.status === 'processing' && (
                        <button type="button" className="btn btn-primary" onClick={() => void handleResume(status.pending!)}>
                            Reprendre l&apos;indexation
                        </button>
                    )}
                </div>
            )}

            <div>
                <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    aria-label="Fichier PDF du référentiel"
                    disabled={busy}
                    className={styles.fileInput}
                    onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) void handleFile(file);
                    }}
                />
                <p className={styles.help}>
                    <Upload size={14} aria-hidden="true" /> L&apos;ancien référentiel reste actif jusqu&apos;à la fin de l&apos;indexation du nouveau.
                </p>
            </div>

            {busy && (
                <div role="status" aria-live="polite">
                    <div className={styles.progressLabel}>
                        {phase.step === 'uploading'
                            ? `Envoi du fichier… ${phase.percent} %`
                            : `Indexation… pages ${phase.step === 'indexing' ? phase.processed : 0}/${phase.step === 'indexing' && phase.total ? phase.total : '…'}`}
                    </div>
                    <div
                        className={styles.progressTrack}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                    >
                        <div className={styles.progressBar} style={{ width: `${percent}%` }} />
                    </div>
                </div>
            )}
        </section>
    );
}
