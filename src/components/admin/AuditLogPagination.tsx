'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './AuditLogTab.module.css';

interface AuditLogPaginationProps {
    page: number;
    totalPages: number;
    total: number;
    pageSize: number;
    onChange: (page: number) => void;
}

/** Barre « Page X sur Y » du journal d'audit, avec page précédente / suivante. */
export default function AuditLogPagination({ page, totalPages, total, pageSize, onChange }: AuditLogPaginationProps) {
    const first = (page - 1) * pageSize + 1;
    const last = Math.min(page * pageSize, total);

    return (
        <nav className={styles.pagination} aria-label="Pagination du journal d'audit">
            <span>
                {first} à {last} sur {total} événement{total > 1 ? 's' : ''}
            </span>
            <div className={styles.paginationControls}>
                <button
                    type="button"
                    className={`btn btn-secondary ${styles.pageButton}`}
                    onClick={() => onChange(page - 1)}
                    disabled={page <= 1}
                    aria-label="Page précédente"
                    title="Page précédente"
                >
                    <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <span className={styles.pageCurrent} aria-live="polite">Page {page} sur {totalPages}</span>
                <button
                    type="button"
                    className={`btn btn-secondary ${styles.pageButton}`}
                    onClick={() => onChange(page + 1)}
                    disabled={page >= totalPages}
                    aria-label="Page suivante"
                    title="Page suivante"
                >
                    <ChevronRight size={16} aria-hidden="true" />
                </button>
            </div>
        </nav>
    );
}
