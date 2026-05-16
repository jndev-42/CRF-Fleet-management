'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import UsersTab from '@/components/admin/UsersTab';
import MenusTab from '@/components/admin/MenusTab';

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

type TabId = 'users' | 'menus';

export default function AdminPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [availableRoles, setAvailableRoles] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('users');
    const { data: session, status } = useSession();
    const router = useRouter();

    const sessionRoles = (session?.user?.roles || []) as string[];
    const isAdmin = sessionRoles.includes('ADMIN');
    const isRespo = sessionRoles.includes('RESPO');
    const canAccess = isAdmin || isRespo;

    useEffect(() => {
        if (status === 'unauthenticated' || (status === 'authenticated' && !canAccess)) {
            router.push('/');
        }
    }, [status, canAccess, router]);

    useEffect(() => {
        if (status === 'authenticated' && canAccess) {
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
            setUsers(data.users ?? []);
            setAvailableRoles(data.availableRoles ?? []);
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
        const isAdding = !currentRoles.includes(roleName);
        let newRoles = isAdding
            ? [...currentRoles, roleName]
            : currentRoles.filter(r => r !== roleName);

        if (isAdding) {
            if (roleName === 'GUEST') {
                newRoles = ['GUEST'];
            } else {
                newRoles = newRoles.filter(r => r !== 'GUEST');
            }
        }

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
                setUsers(previousUsers);
                throw new Error('Failed to update roles');
            }
        } catch {
            setUsers(previousUsers);
            showToast('Erreur lors de la mise à jour', 'error');
        }
    }

    async function validatePapers(userId: string, userName: string | null) {
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(userId)}/validate-papers`, {
                method: 'PATCH',
            });

            if (res.ok) {
                const body = await res.json();
                const today = body.last_validation ?? new Date().toISOString().slice(0, 10);
                const validatedBy = body.validated_by ?? null;
                setUsers(prev => prev.map(u =>
                    u.id === userId
                        ? { ...u, papiers_valides: 1, last_validation: today, start_date_invalidation_process: null, validated_by: validatedBy }
                        : u
                ));
                window.dispatchEvent(new CustomEvent('license-validated'));
                showToast(`Papiers validés pour ${userName || userId}`);
            } else {
                const data = await res.json();
                showToast(data.error || 'Erreur lors de la validation', 'error');
            }
        } catch {
            showToast('Erreur lors de la validation des papiers', 'error');
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
        const newUser: User = {
            id: data.id,
            email,
            name,
            createdAt: new Date().toISOString(),
            roles,
            papiers_valides: 1,
            last_validation: null,
            start_date_invalidation_process: null,
            validated_by: null,
        };
        setUsers(prev => [...prev, newUser].sort((a, b) => a.email.localeCompare(b.email)));
    }

    async function deleteUser(email: string) {
        const res = await fetch(`/api/users/${encodeURIComponent(email)}`, {
            method: 'DELETE',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur lors de la suppression');
        setUsers(prev => prev.filter(u => u.email !== email));
    }

    if (loading || status === 'loading') {
        return (
            <div className="loading-container">
                <div className="loading-spinner" />
            </div>
        );
    }

    if (status === 'unauthenticated' || !canAccess) return null;

    return (
        <div className="page-container" style={{ padding: '0px 24px', maxWidth: '1200px', margin: '0 auto' }}>
            {toast && (
                <div className={`toast ${toast.type}`}>
                    {toast.type === 'success' ? '✅' : '❌'} {toast.message}
                </div>
            )}

            <div style={{ marginBottom: '24px' }}>
                <h1 className="page-title">Administration</h1>
                <p className="page-description">
                    {isAdmin
                        ? 'Gérez les utilisateurs, leurs rôles et les paramètres de l\'application.'
                        : 'Validez les papiers des chauffeurs.'}
                </p>
            </div>

            <div className="tab-bar" role="tablist" style={{ marginBottom: '24px' }}>
                <button
                    role="tab"
                    aria-selected={activeTab === 'users'}
                    className={`tab-btn${activeTab === 'users' ? ' active' : ''}`}
                    onClick={() => setActiveTab('users')}
                >
                    Utilisateurs
                </button>
                {isAdmin && (
                    <button
                        role="tab"
                        aria-selected={activeTab === 'menus'}
                        className={`tab-btn${activeTab === 'menus' ? ' active' : ''}`}
                        onClick={() => setActiveTab('menus')}
                    >
                        Menus
                    </button>
                )}
            </div>

            {activeTab === 'users' && (
                <UsersTab
                    users={users}
                    availableRoles={availableRoles}
                    isAdmin={isAdmin}
                    onToggleRole={toggleRole}
                    onValidatePapers={validatePapers}
                    onCreateUser={createUser}
                    onDeleteUser={deleteUser}
                    showToast={showToast}
                />
            )}

            {activeTab === 'menus' && isAdmin && <MenusTab />}
        </div>
    );
}
