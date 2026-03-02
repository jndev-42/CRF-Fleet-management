'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

    useEffect(() => {
        if (status === 'unauthenticated' || (status === 'authenticated' && !session?.user?.roles?.includes('ADMIN'))) {
            router.push('/');  // non-admins shouldn't even be here
        }
    }, [status, session, router]);

    useEffect(() => {
        if (status === 'authenticated' && session?.user?.roles?.includes('ADMIN')) {
            fetchUsers();
        }
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
        } catch (error) {
            setUsers(previousUsers); // Revert on failure
            showToast('Erreur lors de la mise à jour', 'error');
        }
    }

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

            <div className="page-header" style={{ marginBottom: '24px' }}>
                <h1 className="page-title">Gestion des Utilisateurs</h1>
                <p className="page-description">Définissez les rôles et permissions des utilisateurs.</p>
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
                            {users.map(user => (
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
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div >
    );
}
