'use client';

import { useEffect, useState } from 'react';

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
    const [logs, setLogs] = useState<InvStockLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/inventory/history?itemId=${itemId}`)
            .then(res => res.json())
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
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
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
                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)' }}>
                                    <tr style={{ borderBottom: '1px solid var(--border-primary)', textAlign: 'left' }}>
                                        <th style={{ padding: '8px' }}>Date</th>
                                        <th style={{ padding: '8px' }}>Utilisateur</th>
                                        <th style={{ padding: '8px' }}>Action</th>
                                        <th style={{ padding: '8px' }}>Note</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map(log => (
                                        <tr key={log.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                                            <td style={{ padding: '8px' }}>{new Date(log.timestamp).toLocaleString()}</td>
                                            <td style={{ padding: '8px' }}>{log.userName}</td>
                                            <td style={{ padding: '8px', fontWeight: 600, color: log.change > 0 ? 'green' : 'red' }}>
                                                {log.change > 0 ? `+${log.change}` : log.change}
                                            </td>
                                            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{log.note || '—'}</td>
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
