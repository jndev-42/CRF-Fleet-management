'use client';

import { useEffect, useState } from 'react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';
import styles from './InventoryHistoryModal.module.css';

interface InvStockLog {
    id: string;
    itemId: string;
    change: number;
    userName: string;
    timestamp: string;
    note: string | null;
}

interface Props {
    itemId: string;
    itemName: string;
    onClose: () => void;
}

export default function InventoryHistoryModal({ itemId, itemName, onClose }: Props) {
    useEscapeKey(onClose);
    const [logs, setLogs] = useState<InvStockLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/inventory/history?itemId=${itemId}`)
            .then(res => { if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`); return res.json(); })
            .then(data => {
                setLogs(data.logs || []);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, [itemId]);

    return (
        <div className={`modal-overlay ${styles.overlay}`} onClick={onClose}>
            <div className={`modal ${styles.modal}`} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Historique : {itemName}</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    {loading ? (
                        <p>Chargement...</p>
                    ) : logs.length === 0 ? (
                        <p>Aucun historique pour cet article.</p>
                    ) : (
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead className={styles.tableHead}>
                                    <tr className={styles.headRow}>
                                        <th className={styles.cell}>Date</th>
                                        <th className={styles.cell}>Utilisateur</th>
                                        <th className={styles.cell}>Action</th>
                                        <th className={styles.cell}>Note</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map(log => (
                                        <tr key={log.id} className={styles.row}>
                                            <td className={styles.cell}>{new Date(log.timestamp).toLocaleString()}</td>
                                            <td className={styles.cell}>{log.userName}</td>
                                            <td className={styles.changeCell} style={{ color: log.change > 0 ? 'green' : 'red' }}>
                                                {log.change > 0 ? `+${log.change}` : log.change}
                                            </td>
                                            <td className={styles.noteCell}>{log.note || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
                </div>
            </div>
        </div>
    );
}
