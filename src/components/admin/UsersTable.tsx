'use client';

import { User as UserIcon } from 'lucide-react';
import type { User, ULEntry } from './types';
import { DRIVER_ROLES } from './types';

interface UsersTableProps {
    users: User[];
    currentPage: number;
    totalPages: number;
    rangeStart: number;
    rangeEnd: number;
    totalCount: number;
    onPageChange: (page: number) => void;
    isAdmin: boolean;
    isReadOnly: boolean;
    availableULs: ULEntry[];
    userULs: Record<string, string>;
    onAssignUL: (email: string, ulId: string) => void;
    originalUserEmail?: string;
    onImpersonate?: (email: string) => Promise<void>;
    onValidatePapers: (userId: string, userName: string | null) => Promise<void>;
    onManageULs: (user: User) => void;
    onRequestDelete: (email: string, name: string | null) => void;
}

export default function UsersTable({
    users,
    currentPage,
    totalPages,
    rangeStart,
    rangeEnd,
    totalCount,
    onPageChange,
    isAdmin,
    isReadOnly,
    availableULs,
    userULs,
    onAssignUL,
    originalUserEmail,
    onImpersonate,
    onValidatePapers,
    onManageULs,
    onRequestDelete,
}: UsersTableProps) {
    return (
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
                        {users.length === 0 ? (
                            <tr>
                                <td colSpan={isAdmin ? 5 : 4} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    Aucun utilisateur trouvé.
                                </td>
                            </tr>
                        ) : (
                            users.map(user => {
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
                                                    onChange={e => onAssignUL(user.email, e.target.value)}
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
                                                    <span style={{ color: 'var(--status-available)', fontSize: '13px', fontWeight: 600 }}>
                                                        ✅ Valides{user.last_validation ? ` (${user.last_validation})` : ''}
                                                    </span>
                                                    {user.validated_by && (
                                                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                            par {user.validated_by}
                                                        </span>
                                                    )}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--status-maintenance)', fontSize: '13px', fontWeight: 600 }}>
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
                                                        onClick={() => onManageULs(user)}
                                                        title="Gérer les droits sur les autres UL"
                                                    >
                                                        🔑 Droits UL
                                                    </button>
                                                )}
                                                {isAdmin && !isReadOnly && (
                                                    <button
                                                        className="btn btn-danger"
                                                        style={{ fontSize: '13px', padding: '6px 12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-maintenance)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                                                        onClick={() => onRequestDelete(user.email, user.name)}
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
                    Affichage de <strong>{rangeStart}</strong> à <strong>{rangeEnd}</strong> sur <strong>{totalCount}</strong> utilisateur(s)
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
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
                        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
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
    );
}
