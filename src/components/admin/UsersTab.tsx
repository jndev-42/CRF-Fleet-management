'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { User as UserIcon } from 'lucide-react';
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
    homeUlId?: string | null;
    homeUlName?: string | null;
}

interface UsersTabProps {
    users: User[];
    availableRoles: string[];
    isAdmin: boolean;
    isReadOnly?: boolean;
    onValidatePapers: (userId: string, userName: string | null) => Promise<void>;
    onCreateUser: (email: string, name: string, roles: string[], ulId?: string | null) => Promise<void>;
    onDeleteUser: (email: string) => Promise<void>;
    showToast: (message: string, type?: 'success' | 'error') => void;
    originalUserEmail?: string;
    onImpersonate?: (email: string) => Promise<void>;
}

interface ULEntry {
    id: string;
    name: string;
    slug: string;
}

const DRIVER_ROLES = ['CHVL', 'CHVPSP'];

export default function UsersTab({
    users,
    availableRoles,
    isAdmin,
    isReadOnly = false,
    onValidatePapers,
    onCreateUser,
    onDeleteUser,
    showToast,
    originalUserEmail,
    onImpersonate,
}: UsersTabProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const usersPerPage = 6;
    const [showAddModal, setShowAddModal] = useState(false);
    const [userToDelete, setUserToDelete] = useState<{ email: string; name: string | null } | null>(null);
    const [availableULs, setAvailableULs] = useState<ULEntry[]>([]);
    // Map userId -> home UL name
    const [userULs, setUserULs] = useState<Record<string, string>>({});
    const [selectedUserForULs, setSelectedUserForULs] = useState<User | null>(null);

    useEffect(() => {
        const ulsMap: Record<string, string> = {};
        users.forEach(u => {
            if (u.homeUlId) {
                ulsMap[u.email] = u.homeUlId;
            }
        });
        setUserULs(ulsMap);
    }, [users]);

    useEffect(() => {
        if (!isAdmin) return;
        // Load available ULs for the admin panel
        fetch('/api/ul')
            .then(r => r.ok ? r.json() : { uls: [] })
            .then(data => setAvailableULs(data.uls ?? []))
            .catch(() => {});
    }, [isAdmin]);

    async function assignUL(email: string, ulId: string) {
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(email)}/ul`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ulId: ulId || null, isHome: true, action: ulId ? 'add' : 'remove' }),
            });
            if (!res.ok) throw new Error('Erreur');
            setUserULs(prev => ({ ...prev, [email]: ulId }));
            showToast(`UL mise à jour pour ${email}`);
        } catch {
            showToast('Erreur lors de la mise à jour de l\'UL', 'error');
        }
    }

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
                {isAdmin && !isReadOnly && (
                    <button
                        className="btn btn-primary"
                        onClick={() => setShowAddModal(true)}
                    >
                        ➕ Ajouter un utilisateur
                    </button>
                )}
            </div>

            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-primary)' }}>
                                <th style={{ padding: '16px', fontWeight: 600 }}>Email</th>
                                <th style={{ padding: '16px', fontWeight: 600 }}>Nom</th>
                                {isAdmin && <th style={{ padding: '16px', fontWeight: 600 }}>UL</th>}
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
                                                    <select
                                                        value={userULs[user.email] ?? ''}
                                                        onChange={e => assignUL(user.email, e.target.value)}
                                                        style={{
                                                            fontSize: 13,
                                                            padding: '4px 8px',
                                                            borderRadius: 'var(--radius-sm)',
                                                            border: '1px solid var(--border-primary)',
                                                            background: 'var(--bg-secondary)',
                                                            color: 'var(--text-primary)',
                                                            cursor: 'pointer',
                                                        }}
                                                        aria-label={`UL de ${user.email}`}
                                                    >
                                                        <option value="">— default —</option>
                                                        {availableULs.map(ul => (
                                                            <option key={ul.id} value={ul.id}>{ul.name}</option>
                                                        ))}
                                                    </select>
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
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    {originalUserEmail === 'jeannoel.durand@croix-rouge.fr' && user.email !== originalUserEmail && onImpersonate && (
                                                        <button
                                                            className="btn btn-secondary"
                                                            style={{ fontSize: '13px', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                            onClick={() => onImpersonate(user.email)}
                                                            title={`Incarner ${user.name || user.email}`}
                                                        >
                                                            <UserIcon size={16} />
                                                        </button>
                                                    )}
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
                                                    {isAdmin && !isReadOnly && (
                                                        <button
                                                            className="btn btn-secondary"
                                                            style={{ fontSize: '13px', padding: '6px 12px' }}
                                                            onClick={() => setSelectedUserForULs(user)}
                                                            title="Gérer les droits sur les autres UL"
                                                        >
                                                            🔑 Droits UL
                                                        </button>
                                                    )}
                                                    {isAdmin && !isReadOnly && (
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
                    availableULs={availableULs}
                    onClose={() => setShowAddModal(false)}
                    onSuccess={async (email, name, roles, ulId) => {
                        try {
                            await onCreateUser(email, name, roles, ulId);
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

            {isAdmin && selectedUserForULs && (
                <ManageUserULsModal
                    user={selectedUserForULs}
                    availableULs={availableULs}
                    availableRoles={availableRoles}
                    onClose={() => {
                        setSelectedUserForULs(null);
                    }}
                    showToast={showToast}
                />
            )}
        </>
    );
}

function AddUserModal({
    availableRoles,
    availableULs,
    onClose,
    onSuccess
}: {
    availableRoles: string[];
    availableULs: ULEntry[];
    onClose: () => void;
    onSuccess: (email: string, name: string, roles: string[], ulId: string | null) => Promise<void>;
}) {
    const [form, setForm] = useState({ email: '', name: '', ulId: '' });
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
            await onSuccess(form.email.trim(), form.name.trim(), selectedRoles, form.ulId || null);
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
                            <label className="form-label">Unité Locale principale</label>
                            <select
                                className="form-input"
                                value={form.ulId}
                                onChange={e => setForm({ ...form, ulId: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-primary)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    outline: 'none',
                                    fontSize: '14px',
                                }}
                            >
                                <option value="">— default —</option>
                                {availableULs.map(ul => (
                                    <option key={ul.id} value={ul.id}>
                                        Unité Locale {ul.name}
                                    </option>
                                ))}
                            </select>
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

interface UserULPermission {
    ulId: string;
    isHome: boolean;
    roles: string[];
}

function ManageUserULsModal({
    user,
    availableULs,
    availableRoles,
    onClose,
    showToast,
}: {
    user: User;
    availableULs: ULEntry[];
    availableRoles: string[];
    onClose: () => void;
    showToast: (msg: string, type?: 'success' | 'error') => void;
}) {
    const { data: session, update } = useSession();
    const [uls, setUls] = useState<UserULPermission[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        // Load user's existing UL rights
        fetch(`/api/users/${encodeURIComponent(user.email)}/ul`)
            .then(res => res.ok ? res.json() : { uls: [] })
            .then((data: { uls?: Array<{ id: string; isHome: boolean; roles: string[] }> }) => {
                const mapped = (data.uls || []).map((ul) => ({
                    ulId: ul.id,
                    isHome: !!ul.isHome,
                    roles: (ul.isHome && (!ul.roles || ul.roles.length === 0)) ? user.roles : (ul.roles || [])
                }));
                setUls(mapped);
            })
            .catch(() => showToast("Erreur lors de la récupération des droits", "error"))
            .finally(() => setLoading(false));
    }, [user, showToast]);

    function addRow() {
        setUls(prev => [...prev, { ulId: '', isHome: false, roles: [] }]);
    }

    function removeRow(index: number) {
        setUls(prev => prev.filter((_, i) => i !== index));
    }

    function updateRow<K extends keyof UserULPermission>(index: number, field: K, value: UserULPermission[K]) {
        setUls(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
    }

    function toggleRoleInRow(rowIndex: number, role: string) {
        const row = uls[rowIndex];
        const newRoles = row.roles.includes(role)
            ? row.roles.filter(r => r !== role)
            : [...row.roles, role];
        updateRow(rowIndex, 'roles', newRoles);
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        // Validation: no empty UL selections (except if they are deleted), no duplicate ULs
        const validUls = uls.filter(u => u.ulId);
        const uniqueUlIds = new Set(validUls.map(u => u.ulId));
        if (uniqueUlIds.size !== validUls.length) {
            showToast("Chaque Unité Locale ne peut être sélectionnée qu'une seule fois.", "error");
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(user.email)}/ul`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uls: validUls }),
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Erreur de sauvegarde");
            }
            showToast("Droits UL mis à jour avec succès");
            if (user.email === session?.user?.email) {
                await update();
            }
            onClose();
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : "Erreur de sauvegarde";
            showToast(errorMsg, "error");
        } finally {
            setSubmitting(false);
        }
    }

    // Filter available ULs for the dropdown (exclude ULs that are already selected, except for the current row)
    const getAvailableULsForDropdown = (currentRowUlId: string) => {
        return availableULs.filter(ul => 
            ul.id === currentRowUlId || !uls.some(row => row.ulId === ul.id)
        );
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', width: '90%' }}>
                <div className="modal-header">
                    <h2 className="modal-title">🔑 Gérer les droits UL pour {user.name || user.email}</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSave}>
                    <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                        {loading ? (
                            <div className="loading-container" style={{ padding: '32px 0' }}>
                                <div className="loading-spinner" />
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* Droits Home */}
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-secondary)' }}>
                                            🏠 Unité Locale Principale (Appartenance)
                                        </div>
                                        <RoleLegend />
                                    </div>
                                    {uls.filter(u => u.isHome).map((row) => {
                                        const originalIdx = uls.indexOf(row);
                                        const ulName = availableULs.find(u => u.id === row.ulId)?.name || row.ulId || 'default';
                                        return (
                                            <div key={row.ulId} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ fontWeight: 600, fontSize: '14px' }}>Unité Locale {ulName}</div>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                    {availableRoles.map(role => {
                                                        const active = row.roles.includes(role);
                                                        return (
                                                            <label key={role} style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                background: active ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                                                                border: `1px solid ${active ? '#3B82F6' : 'var(--border-primary)'}`,
                                                                borderRadius: '100px',
                                                                padding: '2px 8px',
                                                                fontSize: '12px',
                                                                cursor: 'pointer',
                                                                color: active ? '#60A5FA' : 'var(--text-secondary)',
                                                                transition: 'all 0.2s',
                                                                userSelect: 'none'
                                                            }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={active}
                                                                    onChange={() => toggleRoleInRow(originalIdx, role)}
                                                                    style={{ display: 'none' }}
                                                                />
                                                                {role}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                                    ℹ️ Si aucun rôle n&apos;est sélectionné, l&apos;utilisateur utilisera ses rôles globaux sur cette UL.
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {uls.filter(u => u.isHome).length === 0 && (
                                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                                            Aucune UL principale (appartenance : default).
                                        </div>
                                    )}
                                </div>

                                {/* Droits Externes */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-secondary)' }}>
                                            🌐 Droits additionnels (Autres ULs)
                                        </div>
                                        <button type="button" className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={addRow}>
                                            ➕ Ajouter des droits externes
                                        </button>
                                    </div>

                                    {uls.filter(u => !u.isHome).length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '24px', background: 'rgba(255,255,255,0.01)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-primary)', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                                            Aucun droit externe configuré. L&apos;utilisateur n&apos;a accès qu&apos;à son UL principale.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {uls.map((row, idx) => {
                                                if (row.isHome) return null;
                                                return (
                                                    <div key={idx} style={{
                                                        display: 'flex',
                                                        alignItems: 'flex-start',
                                                        gap: '12px',
                                                        padding: '12px',
                                                        background: 'var(--bg-secondary)',
                                                        borderRadius: 'var(--radius-md)',
                                                        border: '1px solid var(--border-primary)',
                                                    }}>
                                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                            {/* Dropdown Selection */}
                                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                                <select
                                                                    className="form-input"
                                                                    value={row.ulId}
                                                                    onChange={e => updateRow(idx, 'ulId', e.target.value)}
                                                                    required
                                                                    style={{ flex: 1, padding: '6px 10px', fontSize: '13px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                                                >
                                                                    <option value="" disabled>Choisir une Unité Locale...</option>
                                                                    {getAvailableULsForDropdown(row.ulId).map(ul => (
                                                                        <option key={ul.id} value={ul.id}>
                                                                            Unité Locale {ul.name}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <button type="button" className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.2)' }} onClick={() => removeRow(idx)}>
                                                                    Supprimer
                                                                </button>
                                                            </div>

                                                            {/* Role Selection */}
                                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                                {availableRoles.map(role => {
                                                                    const active = row.roles.includes(role);
                                                                    return (
                                                                        <label key={role} style={{
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px',
                                                                            background: active ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                                                                            border: `1px solid ${active ? '#3B82F6' : 'var(--border-primary)'}`,
                                                                            borderRadius: '100px',
                                                                            padding: '2px 8px',
                                                                            fontSize: '12px',
                                                                            cursor: 'pointer',
                                                                            color: active ? '#60A5FA' : 'var(--text-secondary)',
                                                                            transition: 'all 0.2s',
                                                                            userSelect: 'none'
                                                                        }}>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={active}
                                                                                onChange={() => toggleRoleInRow(idx, role)}
                                                                                style={{ display: 'none' }}
                                                                            />
                                                                            {role}
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                            Annuler
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting || loading}>
                            {submitting ? 'Sauvegarde...' : '💾 Enregistrer les droits'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

