'use client';

interface DeleteUserModalProps {
    userToDelete: { email: string; name: string | null };
    onClose: () => void;
    onConfirm: () => Promise<void>;
}

export default function DeleteUserModal({ userToDelete, onClose, onConfirm }: DeleteUserModalProps) {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                <div className="modal-header">
                    <h2 className="modal-title">⚠️ Confirmation de suppression</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    <p style={{ marginBottom: '16px', lineHeight: '1.5' }}>
                        Êtes-vous sûr de vouloir supprimer l&apos;utilisateur <strong>{userToDelete.name || userToDelete.email}</strong> ?
                    </p>
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '13px', color: '#EF4444' }}>
                        ℹ️ Cette action est irréversible. Les données liées aux missions (conducteur) seront anonymisées mais le compte sera définitivement supprimé.
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        Annuler
                    </button>
                    <button
                        className="btn"
                        style={{ background: '#EF4444', color: 'white' }}
                        onClick={onConfirm}
                    >
                        Supprimer définitivement
                    </button>
                </div>
            </div>
        </div>
    );
}
