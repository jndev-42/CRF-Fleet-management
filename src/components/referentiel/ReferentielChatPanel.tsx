'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Send, X } from 'lucide-react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';
import { splitHighlight } from '@/lib/referentiel/highlight';
import VehicleGuideReader from '@/components/vehicle/VehicleGuideReader';
import styles from './ReferentielChatPanel.module.css';

export const REFERENTIEL_DISCLAIMER = 'Extraits du référentiel — ne remplace ni la formation ni la régulation (15)';
const MIN_QUESTION_LENGTH = 2;

interface SearchResult {
    page: number;
    title: string;
    excerpt: string;
}

interface Exchange {
    id: number;
    question: string;
    state: 'loading' | 'done' | 'error';
    results: SearchResult[];
}

interface ReaderTarget {
    url: string;
    fileName: string;
    page: number;
}

interface ReferentielChatPanelProps {
    onClose: () => void;
}

/**
 * Panneau du chatbot : aucune génération de texte, on affiche les pages les plus
 * pertinentes du référentiel officiel avec un extrait surligné et un accès direct
 * à la page dans la liseuse. L'historique vit dans le state React, rien n'est conservé.
 */
export default function ReferentielChatPanel({ onClose }: ReferentielChatPanelProps) {
    const [ready, setReady] = useState<boolean | null>(null);
    const [exchanges, setExchanges] = useState<Exchange[]>([]);
    const [question, setQuestion] = useState('');
    const [reader, setReader] = useState<ReaderTarget | null>(null);
    const [readerError, setReaderError] = useState<string | null>(null);
    const [openingPage, setOpeningPage] = useState<number | null>(null);
    // Échap ferme la liseuse (qui gère sa propre touche), pas le panneau dessous.
    useEscapeKey(onClose, reader === null);
    const nextId = useRef(1);
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/referentiel')
            .then(res => (res.ok ? res.json() : Promise.reject(new Error('status'))))
            .then((data: { ready?: boolean }) => { if (!cancelled) setReady(Boolean(data.ready)); })
            .catch(() => { if (!cancelled) setReady(false); });
        return () => { cancelled = true; };
    }, []);

    // Le champ est désactivé tant que l'état n'est pas connu : on le focalise dès qu'il s'active.
    useEffect(() => {
        if (ready) inputRef.current?.focus();
    }, [ready]);

    useEffect(() => {
        endRef.current?.scrollIntoView?.({ block: 'end' });
    }, [exchanges]);

    const ask = useCallback(async (text: string) => {
        const id = nextId.current++;
        setExchanges(prev => [...prev, { id, question: text, state: 'loading', results: [] }]);
        const finish = (patch: Partial<Exchange>) =>
            setExchanges(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)));
        try {
            const res = await fetch(`/api/referentiel/search?q=${encodeURIComponent(text)}`);
            if (!res.ok) throw new Error('search');
            const data = await res.json() as { results?: SearchResult[] };
            finish({ state: 'done', results: data.results ?? [] });
        } catch {
            finish({ state: 'error' });
        }
    }, []);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const text = question.trim();
        if (text.length < MIN_QUESTION_LENGTH) return;
        setQuestion('');
        void ask(text);
    }

    async function openPage(page: number) {
        setReaderError(null);
        setOpeningPage(page);
        try {
            const res = await fetch('/api/referentiel/file-url');
            if (!res.ok) throw new Error('file-url');
            const data = await res.json() as { url: string; fileName: string };
            setReader({ url: data.url, fileName: data.fileName, page });
        } catch {
            setReaderError("Impossible d'ouvrir le référentiel.");
        } finally {
            setOpeningPage(null);
        }
    }

    return (
        <>
            <section role="dialog" aria-label="Référentiel secourisme" className={styles.panel}>
                <header className={styles.header}>
                    <BookOpen size={18} aria-hidden="true" />
                    <h2 className={styles.title}>Référentiel secourisme</h2>
                    <button type="button" onClick={onClose} aria-label="Fermer le chat" className={styles.closeButton}>
                        <X size={18} />
                    </button>
                </header>

                <div className={styles.messages} aria-live="polite">
                    {ready === null && <p className={styles.hint}>Chargement…</p>}
                    {ready === false && <p className={styles.hint}>Aucun référentiel importé</p>}
                    {ready && exchanges.length === 0 && (
                        <p className={styles.hint}>
                            Posez une question (ex. « hémorragie », « PLS », « RCP enfant ») : les pages les plus pertinentes du guide s&apos;affichent.
                        </p>
                    )}
                    {exchanges.map(exchange => (
                        <div key={exchange.id} className={styles.exchange}>
                            <div className={styles.question}>{exchange.question}</div>
                            {exchange.state === 'loading' && <p className={styles.hint}>Recherche…</p>}
                            {exchange.state === 'error' && <p role="alert" className={styles.error}>La recherche a échoué. Réessayez.</p>}
                            {exchange.state === 'done' && exchange.results.length === 0 && (
                                <p className={styles.hint}>Aucun passage trouvé. Essayez d&apos;autres mots.</p>
                            )}
                            {exchange.results.map(result => (
                                <article key={result.page} className={styles.result}>
                                    <div className={styles.resultHead}>
                                        <span className={styles.resultTitle}>{result.title || `Page ${result.page}`}</span>
                                        <button
                                            type="button"
                                            className={styles.openButton}
                                            onClick={() => void openPage(result.page)}
                                            disabled={openingPage !== null}
                                        >
                                            Ouvrir p. {result.page}
                                        </button>
                                    </div>
                                    <p className={styles.excerpt}>
                                        {splitHighlight(result.excerpt).map((segment, i) =>
                                            segment.mark
                                                ? <mark key={i} className={styles.mark}>{segment.text}</mark>
                                                : <span key={i}>{segment.text}</span>)}
                                    </p>
                                </article>
                            ))}
                        </div>
                    ))}
                    {readerError && <p role="alert" className={styles.error}>{readerError}</p>}
                    <div ref={endRef} />
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        placeholder="Votre question…"
                        aria-label="Votre question"
                        maxLength={200}
                        disabled={ready !== true}
                        className={styles.input}
                    />
                    <button
                        type="submit"
                        aria-label="Envoyer"
                        disabled={ready !== true || question.trim().length < MIN_QUESTION_LENGTH}
                        className={styles.sendButton}
                    >
                        <Send size={16} />
                    </button>
                </form>
                <p className={styles.disclaimer}>{REFERENTIEL_DISCLAIMER}</p>
            </section>

            {reader && (
                <VehicleGuideReader
                    rangeUrl={reader.url}
                    initialPage={reader.page}
                    label="Référentiel secourisme"
                    fileName={reader.fileName}
                    onClose={() => setReader(null)}
                />
            )}
        </>
    );
}
