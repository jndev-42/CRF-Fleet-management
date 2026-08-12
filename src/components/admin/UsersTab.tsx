'use client';

import { useState, useEffect } from 'react';
import UsersTable from './UsersTable';
import AddUserModal from './modals/AddUserModal';
import DeleteUserModal from './modals/DeleteUserModal';
import ManageUserULsModal from './modals/ManageUserULsModal';
import type { User, ULEntry } from './types';

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
    userUlId?: string;
    onRefreshUsers?: () => void;
}

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
    userUlId,
    onRefreshUsers,
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

    async function handleConfirmDelete() {
        if (!userToDelete) return;
        try {
            await onDeleteUser(userToDelete.email);
            showToast(`Utilisateur ${userToDelete.email} supprimé`);
            setUserToDelete(null);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Erreur lors de la suppression', 'error');
        }
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

            <UsersTable
                users={currentUsers}
                currentPage={currentPage}
                totalPages={totalPages}
                rangeStart={currentUsers.length > 0 ? indexOfFirstUser + 1 : 0}
                rangeEnd={Math.min(indexOfLastUser, filteredUsers.length)}
                totalCount={filteredUsers.length}
                onPageChange={setCurrentPage}
                isAdmin={isAdmin}
                isReadOnly={isReadOnly}
                availableULs={availableULs}
                userULs={userULs}
                onAssignUL={assignUL}
                originalUserEmail={originalUserEmail}
                onImpersonate={onImpersonate}
                onValidatePapers={onValidatePapers}
                onManageULs={setSelectedUserForULs}
                onRequestDelete={(email, name) => setUserToDelete({ email, name })}
            />

            {isAdmin && showAddModal && (
                <AddUserModal
                    availableRoles={availableRoles}
                    availableULs={availableULs}
                    userUlId={userUlId}
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
                <DeleteUserModal
                    userToDelete={userToDelete}
                    onClose={() => setUserToDelete(null)}
                    onConfirm={handleConfirmDelete}
                />
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
                    onRefreshUsers={onRefreshUsers}
                />
            )}
        </>
    );
}
