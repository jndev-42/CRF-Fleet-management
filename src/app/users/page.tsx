'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface User {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    roles: string[];
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [availableRoles, setAvailableRoles] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const { data: session, status } = useSession();
    const router = useRouter();

    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const usersPerPage = 6;
    const [showAddModal, setShowAddModal] = useState(false);

    useEffect(() => {
        if (status === 'unauthenticated' || (status === 'authenticated' && !session?.user?.roles?.includes('ADMIN'))) {
            router.push('/');  // non-admins shouldn't even be here
        }
    }, [status, session, router]);

    useEffect(() => {
        if (status === 'authenticated' && session?.user?.roles?.includes('ADMIN')) {
            fetchUsers();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchUsers is defined outside the effect; including it would require useCallback for no practical benefit on this simple admin page
    }, [status, session]);

    async function fetchUsers() {
        try {
            const res = await fetch('/api/users');
            if (res.status === 403) {
                router.push('/');
                return;
            }
            const data = await res.json();
            setUsers(data.users);
            setAvailableRoles(data.availableRoles);
        } catch (error) {
            console.error('Erreur:', error);
        } finally {
            setLoading(false);
        }
    }

    function showToast(message: string, type: 'success' | 'error' = 'success') {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    }

    async function toggleRole(email: string, roleName: string, currentRoles: string[]) {
        const newRoles = currentRoles.includes(roleName)
            ? currentRoles.filter(r => r !== roleName)
            : [...currentRoles, roleName];

        // Optimistic UI update
        const previousUsers = [...users];
        setUsers(users.map(u => u.email === email ? { ...u, roles: newRoles } : u));

        try {
            const res = await fetch(`/api/users/${encodeURIComponent(email)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roles: newRoles })
            });

            if (res.ok) {
                showToast(`Rôles mis à jour pour ${email}`);
            } else {
                setUsers(previousUsers); // Revert on failure
                throw new Error('Failed to update roles');
            }
        } catch {
            setUsers(previousUsers); // Revert on failure
            showToast('Erreur lors de la mise à jour', 'error');
        }
    }

    async function createUser(email: string, name: string, roles: string[]) {
        const res = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name, roles }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        // Optimistically add to list
        const newUser: User = { id: data.id, email, name, createdAt: new Date().toISOString(), roles };
        setUsers(prev => [...prev, newUser].sort((a, b) => a.email.localeCompare(b.email)));
    }

    // --- Search & Pagination Logic ---
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

    useEffect(() => {
        // Reset to first page when search changes
        setCurrentPage(1);
    }, [searchQuery]);

    if (loading || status === 'loading') {
        return (
            <div className="loading-container">
                <div className="loading-spinner" />
            </div>
        );
    }

    if (status === 'unauthenticated' || !session?.user?.roles?.includes('ADMIN')) return null;

    return (
        <div className="page-container" style={{ padding: '0px 24px', maxWidth: '1200px', margin: '0 auto' }}>
            {toast && (
                <div className={`toast ${toast.type}`}>
                    {toast.type === 'success' ? '✅' : '❌'} {toast.message}
                </div>
            )}

            <div className="page-header" style={{ marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="page-title">Gestion des Utilisateurs</h1>
                    <p className="page-description">Définissez les rôles et permissions des utilisateurs.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', minWidth: '250px', maxWidth: '350px' }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                        <input
                            type="search"
                            placeholder="Rechercher par nom ou email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
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
                    <button
                        className="btn btn-primary"
                        onClick={() => setShowAddModal(true)}
                    >
                        ➕ Ajouter un utilisateur
                    </button>
                </div>
            </div>

            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-primary)' }}>
                                <th style={{ padding: '16px', fontWeight: 600 }}>Email</th>
                                <th style={{ padding: '16px', fontWeight: 600 }}>Nom</th>
                                <th style={{ padding: '16px', fontWeight: 600 }}>Rôles</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={3} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        Aucun utilisateur trouvé.
                                    </td>
                                </tr>
                            ) : (
                                currentUsers.map(user => (
                                    <tr key={user.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                                        <td style={{ padding: '16px' }}>{user.email}</td>
                                        <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{user.name || '—'}</td>
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
                                                                onChange={() => toggleRole(user.email, role, user.roles)}
                                                                style={{ display: 'none' }}
                                                            />
                                                            {role}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
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

            {showAddModal && (
                <AddUserModal
                    availableRoles={availableRoles}
                    onClose={() => setShowAddModal(false)}
                    onSuccess={async (email, name, roles) => {
                        try {
                            await createUser(email, name, roles);
                            setShowAddModal(false);
                            showToast(`Utilisateur ${email} ajouté avec succès !`);
                        } catch (err: unknown) {
                            showToast(err instanceof Error ? err.message : 'Erreur lors de la création', 'error');
                        }
                    }}
                />
            )}
        </div>
    );
}

/** Modal for creating a new user — collects email, name and initial roles */
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

    async function handleSubmit(e: React.FormEvent) {
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
