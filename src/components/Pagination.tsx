'use client';

import { useId, type SubmitEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import styles from './Pagination.module.css';

interface PaginationProps {
    page: number;
    totalPages: number;
    onChange: (page: number) => void;
    /** Nom accessible de la barre (`aria-label` du `<nav>`). */
    label: string;
    /** Texte à gauche, par ex. « 11 à 20 sur 25 événements ». */
    summary?: ReactNode;
    /** Contrôles additionnels à côté du résumé (choix du nombre de lignes…). */
    children?: ReactNode;
    /** Ajoute première / dernière page et « Aller à la page » — pour les longues listes. */
    extended?: boolean;
    /** Variante compacte pour les cartes et panneaux étroits. */
    compact?: boolean;
}

/** Barre de pagination commune : précédente / « Page X sur Y » / suivante. */
export default function Pagination({ page, totalPages, onChange, label, summary, children, extended = false, compact = false }: PaginationProps) {
    const jumpId = useId();
    const go = (target: number) => onChange(Math.min(Math.max(1, target), totalPages));

    const handleJump = (e: SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        const raw = String(new FormData(e.currentTarget).get('page') ?? '').trim();
        const value = Number(raw);
        if (raw && Number.isInteger(value) && value !== page) go(value);
    };

    const buttonClass = `btn btn-secondary ${styles.button}`;

    return (
        <nav className={`${styles.pagination} ${compact ? styles.compact : ''}`} aria-label={label}>
            {(summary || children) && (
                <div className={styles.side}>
                    {summary && <span>{summary}</span>}
                    {children}
                </div>
            )}
            <div className={styles.controls}>
                {extended && (
                    <button type="button" className={buttonClass} onClick={() => go(1)} disabled={page <= 1} aria-label="Première page" title="Première page">
                        <ChevronsLeft size={16} aria-hidden="true" />
                    </button>
                )}
                <button type="button" className={buttonClass} onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Page précédente" title="Page précédente">
                    <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <span className={styles.current} aria-live="polite">Page {page} sur {totalPages}</span>
                <button type="button" className={buttonClass} onClick={() => go(page + 1)} disabled={page >= totalPages} aria-label="Page suivante" title="Page suivante">
                    <ChevronRight size={16} aria-hidden="true" />
                </button>
                {extended && (
                    <button type="button" className={buttonClass} onClick={() => go(totalPages)} disabled={page >= totalPages} aria-label="Dernière page" title="Dernière page">
                        <ChevronsRight size={16} aria-hidden="true" />
                    </button>
                )}
                {extended && totalPages > 2 && (
                    // `key` : le champ revient au numéro courant après chaque changement de page.
                    <form key={page} className={styles.jump} onSubmit={handleJump}>
                        <label htmlFor={jumpId}>Aller à</label>
                        <input
                            id={jumpId}
                            name="page"
                            type="number"
                            min={1}
                            max={totalPages}
                            defaultValue={page}
                            className={`form-input ${styles.jumpInput}`}
                        />
                        <button type="submit" className={buttonClass}>OK</button>
                    </form>
                )}
            </div>
        </nav>
    );
}
