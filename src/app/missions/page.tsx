'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, QrCode } from 'lucide-react';
import { MISSION_TYPE_LABELS } from '@/lib/mission-supplies';
import { isAdminOrAbove, isReadOnlyManager } from '@/lib/roles';
import MissionsTable, { type MissionReport } from './MissionsTable';
import ULQRCodeModal from '@/components/missions/ULQRCodeModal';
import styles from './missions.module.css';

type Scope = 'mine' | 'all';

export default function MissionsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [reports, setReports] = useState<MissionReport[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState('');
    const [scope, setScope] = useState<Scope>('mine');
    const [showQrCode, setShowQrCode] = useState(false);

    const roles = (session?.user?.roles || ['GUEST']) as string[];
    const canAccess = isAdminOrAbove(roles) || isReadOnlyManager(roles) || roles.includes('CI/RPAPS');
    const canCreate = isAdminOrAbove(roles) || roles.includes('CI/RPAPS');
    // « Tous les rapports » suit l'UL active du sélecteur de la Navbar ; l'API
    // refuse le scope à quiconque n'est pas cadre/président/admin.
    const canSeeAll = isAdminOrAbove(roles) || isReadOnlyManager(roles);

    const activeUlName = session?.user?.availableULs?.find(ul => ul.id === session?.user?.ulId)?.name;
    // Le bouton QR Code cible l'UL active du gestionnaire — comme le sélecteur
    // « Tous les rapports », il n'a pas de sens sans UL active réelle.
    const activeUlId = session?.user?.ulId;
    const hasActiveUl = Boolean(activeUlId && activeUlId !== 'default');

    useEffect(() => {
        if (status === 'unauthenticated' || (status === 'authenticated' && !canAccess)) {
            router.push('/vehicles');
        }
    }, [status, canAccess, router]);

    useEffect(() => {
        if (status === 'authenticated' && canAccess) {
            fetchReports();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchReports depends on typeFilter/scope and is recreated each render
    }, [status, typeFilter, scope]);

    async function fetchReports() {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: '50', scope });
            if (typeFilter) params.set('type', typeFilter);
            const res = await fetch(`/api/missions?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setReports(data.reports ?? []);
                setTotal(data.total ?? 0);
            }
        } catch (e) {
            console.error('Erreur chargement missions', e);
        } finally {
            setLoading(false);
        }
    }

    if (status === 'loading') return <div className="page-loading">Chargement...</div>;

    return (
        <main id="main-content" className="page-container">
            <div className="page-header">
                <h1 className="page-title">Comptes rendus de mission</h1>
                {canSeeAll && hasActiveUl && (
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowQrCode(true)}
                    >
                        <QrCode size={16} />
                        QR Code {activeUlName ? `— ${activeUlName}` : ''}
                    </button>
                )}
                {canCreate && (
                    <Link href="/missions/new" className="btn btn-primary">
                        <Plus size={16} />
                        Nouveau compte rendu
                    </Link>
                )}
            </div>

            {canSeeAll && (
                <div className="filters-bar" role="tablist" aria-label="Périmètre des comptes rendus">
                    <button
                        role="tab"
                        aria-selected={scope === 'mine'}
                        className={`filter-btn${scope === 'mine' ? ' active' : ''}`}
                        onClick={() => setScope('mine')}
                    >
                        Mes rapports
                    </button>
                    <button
                        role="tab"
                        aria-selected={scope === 'all'}
                        className={`filter-btn${scope === 'all' ? ' active' : ''}`}
                        onClick={() => setScope('all')}
                    >
                        {activeUlName ? `Tous les rapports — ${activeUlName}` : 'Tous les rapports'}
                    </button>
                </div>
            )}

            <div className="filters-bar">
                <button
                    className={`filter-btn${typeFilter === '' ? ' active' : ''}`}
                    onClick={() => setTypeFilter('')}
                >
                    Tous ({total})
                </button>
                {(['RESEAU', 'DPS', 'PAPS'] as const).map(type => (
                    <button
                        key={type}
                        className={`filter-btn${typeFilter === type ? ' active' : ''}`}
                        onClick={() => setTypeFilter(type)}
                    >
                        {MISSION_TYPE_LABELS[type]}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="page-loading">Chargement...</div>
            ) : reports.length === 0 ? (
                <div className={styles.emptyState}>
                    <p>
                        {scope === 'all'
                            ? 'Aucun compte rendu pour l\'UL sélectionnée.'
                            : 'Aucun compte rendu trouvé.'}
                    </p>
                    {canCreate && scope === 'mine' && (
                        <Link href="/missions/new" className="btn btn-primary">
                            <Plus size={16} />
                            Créer le premier compte rendu
                        </Link>
                    )}
                </div>
            ) : (
                <MissionsTable reports={reports} />
            )}

            {showQrCode && activeUlId && (
                <ULQRCodeModal
                    ulId={activeUlId}
                    ulName={activeUlName ? `Unité Locale ${activeUlName}` : 'votre UL'}
                    canRegenerate={canSeeAll}
                    onClose={() => setShowQrCode(false)}
                />
            )}
        </main>
    );
}
