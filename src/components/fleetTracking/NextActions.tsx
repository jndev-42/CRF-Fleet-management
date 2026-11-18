'use client';

import type { FleetTask } from '@/lib/fleetTracking/tasks';
import NextActionRow from './NextActionRow';
import styles from './overview.module.css';
import taskStyles from './tasks.module.css';

interface Props {
    tasks: FleetTask[];
    /** Tâches non terminées de l'UL (badge « N à suivre »). */
    total: number;
    today: string;
    onComplete: (task: FleetTask) => void;
    onEdit: (task: FleetTask) => void;
    onShowAll: () => void;
}

/** Carte « Prochaines actions » : les premières tâches non terminées, dans l'ordre de priorité. */
export default function NextActions({ tasks, total, today, onComplete, onEdit, onShowAll }: Props) {
    return (
        <section className={`card ${styles.panel}`} aria-labelledby="overview-next-actions">
            <div className={styles.panelHead}>
                <h3 id="overview-next-actions" className={styles.panelTitle}>Prochaines actions</h3>
                {total > 0 && <span className={`${taskStyles.pill} ${styles.pillInfo}`}>{total} à suivre</span>}
            </div>
            {tasks.length === 0 ? (
                <p className={`${taskStyles.dim} ${styles.emptyLine}`}>Aucune action à suivre pour l’instant.</p>
            ) : (
                <ul className={styles.actionList}>
                    {tasks.map(t => <NextActionRow key={t.id} task={t} today={today} onComplete={onComplete} onEdit={onEdit} />)}
                </ul>
            )}
            {total > 0 && (
                <div className={styles.panelFoot}>
                    <button type="button" className={styles.linkButton} onClick={onShowAll}>
                        {total > 1 ? `Voir les ${total} tâches →` : 'Voir la tâche →'}
                    </button>
                </div>
            )}
        </section>
    );
}
