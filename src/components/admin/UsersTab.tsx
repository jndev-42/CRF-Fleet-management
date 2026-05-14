'use client';

import { useState } from 'react';
import RoleLegend from '@/components/users/RoleLegend';

interface User {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    roles: string[];
    papiers_valides: number;
    last_validation: string | null;
    start_date_invalidation_process: string | null;
    validated_by: string | null;
}

interface UsersTabProps {
    users: User[];
    availableRoles: string[];
    isAdmin: boolean;
    onToggleRole: (email: string, roleName: string, currentRoles: string[]) => Promise<void>;
    onValidatePapers: (userId: string, userName: string | null) => Promise<void>;
    onCreateUser: (email: string, name: string, roles: string[]) => Promise<void>;
    onDeleteUser: (email: string) => Promise<void>;
    showToast: (message: string, type?: 'success' | 'error') => void;
}

const DRIVER_ROLES = ['CHVL', 'CHVPSP'];

export default function UsersTab({
    users,
    availableRoles,
    isAdmin,
    onToggleRole,
    onValidatePapers,
    onCreateUser,
    onDeleteUser,
    showToast,
}: UsersTabProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const usersPerPage = 6;
    const [showAddModal, setShowAddModal] = useState(false);
    const [userToDelete, setUserToDelete] = useState<{ email: string; name: string | null } | null>(null);

    const filteredUsers = users.filter(user => {
        const searchLower = searchQuery.toLowerCase();
        return (
            user.email.toLowerCase().includes(searchLower) ||
            (user.name && user.name.toLowerCase().includes(searchLower))
        );
    });

    const totalPages = Math.ceil(filteredUsers.length / usersPerPage) || 1;
    const indexOfLastUser = currentPage * usersPerPage;
    const indexOfFirstUser = indexOfLastUser - usersPerPage;
    const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);

    function handleSearch(value: string) {
        setSearchQuery(value);
        setCurrentPage(1);
    }

    return (
        <>
            <div className="page-header" style={{ marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ position: 'relative', minWidth: '250px', maxWidth: '350px' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                    <input
                        type="search"
                        placeholder="Rechercher par nom ou email..."
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 12px 10px 36px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-primary)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            outline: 'none',
                            fontSize: '14px'
                        }}
                    />
                </div>
                {isAdmin && (
                    <button
                        className="btn btn-primary"
                        onClick={() => setShowAddModal(true)}
                    >
                        ➕ Ajouter un utilisateur
                    </button>
                )}
            </div>

            {isAdmin && <RoleLegend />}

            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-primary)' }}>
                                <th style={{ padding: '16px', fontWeight: 600 }}>Email</th>
                                <th style={{ padding: '16px', fontWeight: 600 }}>Nom</th>
                                {isAdmin && <th style={{ padding: '16px', fontWeight: 600 }}>Rôles</th>}
                                <th style={{ padding: '16px', fontWeight: 600 }}>Papiers</th>
                                <th style={{ padding: '16px', fontWeight: 600 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={isAdmin ? 5 : 4} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        Aucun utilisateur trouvé.
                                    </td>
                                </tr>
                            ) : (
                                currentUsers.map(user => {
                                    const isDriver = user.roles.some(r => DRIVER_ROLES.includes(r));
                                    const papersValid = user.papiers_valides === 1;

                                    return (
                                        <tr key={user.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                                            <td style={{ padding: '16px' }}>{user.email}</td>
                                            <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{user.name || '—'}</td>
                                            {isAdmin && (
                                                <td style={{ padding: '16px' }}>
                                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                        {availableRoles.map(role => {
                                                            const hasRole = user.roles.includes(role);
                                                            return (
                                                                <label key={role} style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px',
                                                                    background: hasRole ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.05)',
                                                                    border: `1px solid ${hasRole ? '#3B82F6' : 'var(--border-primary)'}`,
                                                                    borderRadius: '100px',
                                                                    padding: '4px 10px',
                                                                    fontSize: '13px',
                                                                    cursor: 'pointer',
                                                                    color: hasRole ? '#60A5FA' : 'var(--text-secondary)',
                                                                    transition: 'all 0.2s',
                                                                    userSelect: 'none'
                                                                }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={hasRole}
                                                                        onChange={() => onToggleRole(user.email, role, user.roles)}
                                                                        style={{ display: 'none' }}
                                                                    />
                                                                    {role}
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                            )}
                                            <td style={{ padding: '16px' }}>
                                                {!isDriver ? (
                                                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>—</span>
                                                ) : papersValid ? (
                                                    <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <span style={{ color: '#22C55E', fontSize: '13px', fontWeight: 600 }}>
                                                            ✅ Valides{user.last_validation ? ` (${user.last_validation})` : ''}
                                                        </span>
                                                        {user.validated_by && (
                                                            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                                par {user.validated_by}
                                                            </span>
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#EF4444', fontSize: '13px', fontWeight: 600 }}>
                                                        ❌ Non validés
                                                        {user.start_date_invalidation_process
                                                            ? ` — depuis ${user.start_date_invalidation_process}`
                                                            : ''}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    {isDriver && !papersValid && (
                                                        <button
                                                            className="btn btn-secondary"
                                                            style={{ fontSize: '13px', padding: '6px 12px' }}
                                                            onClick={() => onValidatePapers(user.id, user.name)}
                                                            title="Marquer les papiers comme validés"
                                                        >
                                                            🪪 Valider les papiers
                                                        </button>
                                                    )}
                                                    {isAdmin && (
                                                        <button
                                                            className="btn btn-danger"
                                                            style={{ fontSize: '13px', padding: '6px 12px', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                                                            onClick={() => setUserToDelete({ email: user.email, name: user.name })}
                                                            title="Supprimer l'utilisateur"
                                                        >
                                                            🗑️
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px',
                    borderTop: '1px solid var(--border-primary)',
                    background: 'var(--bg-secondary)',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Affichage de <strong>{currentUsers.length > 0 ? indexOfFirstUser + 1 : 0}</strong> à <strong>{Math.min(indexOfLastUser, filteredUsers.length)}</strong> sur <strong>{filteredUsers.length}</strong> utilisateur(s)
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            style={{
                                padding: '6px 12px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-primary)',
                                background: currentPage === 1 ? 'rgba(255,255,255,0.05)' : 'var(--bg-tertiary)',
                                color: currentPage === 1 ? 'var(--text-secondary)' : 'var(--text-primary)',
                                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                fontSize: '13px',
                                transition: 'all 0.2s'
                            }}
                        >
                            Précédent
                        </button>
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', margin: '0 4px' }}>
                            Page {currentPage} sur {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            style={{
                                padding: '6px 12px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-primary)',
                                background: currentPage === totalPages ? 'rgba(255,255,255,0.05)' : 'var(--bg-tertiary)',
                                color: currentPage === totalPages ? 'var(--text-secondary)' : 'var(--text-primary)',
                                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                                fontSize: '13px',
                                transition: 'all 0.2s'
                            }}
                        >
                            Suivant
                        </button>
                    </div>
                </div>
            </div>

            {isAdmin && showAddModal && (
                <AddUserModal
                    availableRoles={availableRoles}
                    onClose={() => setShowAddModal(false)}
                    onSuccess={async (email, name, roles) => {
                        try {
                            await onCreateUser(email, name, roles);
                            setShowAddModal(false);
                            showToast(`Utilisateur ${email} ajouté avec succès !`);
                        } catch (err: unknown) {
                            showToast(err instanceof Error ? err.message : 'Erreur lors de la création', 'error');
                        }
                    }}
                />
            )}

            {isAdmin && userToDelete && (
                <div className="modal-overlay" onClick={() => setUserToDelete(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">⚠️ Confirmation de suppression</h2>
                            <button className="modal-close" onClick={() => setUserToDelete(null)}>✕</button>
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
                            <button className="btn btn-secondary" onClick={() => setUserToDelete(null)}>
                                Annuler
                            </button>
                            <button
                                className="btn"
                                style={{ background: '#EF4444', color: 'white' }}
                                onClick={async () => {
                                    try {
                                        await onDeleteUser(userToDelete.email);
                                        showToast(`Utilisateur ${userToDelete.email} supprimé`);
                                        setUserToDelete(null);
                                    } catch (err: unknown) {
                                        showToast(err instanceof Error ? err.message : 'Erreur lors de la suppression', 'error');
                                    }
                                }}
                            >
                                Supprimer définitivement
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function AddUserModal({
    availableRoles,
    onClose,
    onSuccess
}: {
    availableRoles: string[];
    onClose: () => void;
    onSuccess: (email: string, name: string, roles: string[]) => Promise<void>;
}) {
    const [form, setForm] = useState({ email: '', name: '' });
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);

    function toggleRole(role: string) {
        setSelectedRoles(prev =>
            prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
        );
    }

    async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        setSubmitting(true);
        try {
            await onSuccess(form.email.trim(), form.name.trim(), selectedRoles);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">➕ Ajouter un utilisateur</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">Email *</label>
                            <input
                                className="form-input"
                                type="email"
                                placeholder="prenom.nom@croix-rouge.fr"
                                value={form.email}
                                onChange={e => setForm({ ...form, email: e.target.value })}
                                required
                                autoFocus
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Nom complet *</label>
                            <input
                                className="form-input"
                                type="text"
                                placeholder="Prénom NOM"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Rôles initiaux (optionnel)</label>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                                {availableRoles.map(role => {
                                    const active = selectedRoles.includes(role);
                                    return (
                                        <label key={role} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            background: active ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${active ? '#3B82F6' : 'var(--border-primary)'}`,
                                            borderRadius: '100px',
                                            padding: '4px 10px',
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                            color: active ? '#60A5FA' : 'var(--text-secondary)',
                                            transition: 'all 0.2s',
                                            userSelect: 'none'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={active}
                                                onChange={() => toggleRole(role)}
                                                style={{ display: 'none' }}
                                            />
                                            {role}
                                        </label>
                                    );
                                })}
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                                ℹ️ Les rôles peuvent être modifiés après la création.
                            </p>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Annuler
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Création...' : '✅ Créer l\'utilisateur'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
