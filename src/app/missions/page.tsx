'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, AlertCircle } from 'lucide-react';
import { MISSION_TYPE_LABELS } from '@/lib/mission-supplies';
import { isAdminOrAbove, isReadOnlyManager } from '@/lib/roles';
import styles from './missions.module.css';

interface MissionReport {
    id: string;
    mission_type: string;
    mission_name: string;
    mission_date: string;
    location: string;
    victim_count: number;
    ul18_present: boolean | null;
    had_acr: boolean;
    had_hemorrhage: boolean;
    had_complex_care: boolean;
    needs_followup: boolean;
    submitted_at: string;
    submitter_name: string | null;
    vehicle_name: string | null;
}

export default function MissionsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [reports, setReports] = useState<MissionReport[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState('');

    const roles = (session?.user?.roles || ['GUEST']) as string[];
    const canAccess = isAdminOrAbove(roles) || isReadOnlyManager(roles) || roles.includes('CI/RPAPS');
    const canCreate = isAdminOrAbove(roles) || roles.includes('CI/RPAPS');

    useEffect(() => {
        if (status === 'unauthenticated' || (status === 'authenticated' && !canAccess)) {
            router.push('/vehicles');
        }
    }, [status, canAccess, router]);

    useEffect(() => {
        if (status === 'authenticated' && canAccess) {
            fetchReports();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchReports depends on typeFilter and is recreated each render
    }, [status, typeFilter]);

    async function fetchReports() {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: '50' });
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

    const hasIncidents = (r: MissionReport) => r.had_acr || r.had_hemorrhage || r.had_complex_care;

    if (status === 'loading') return <div className="page-loading">Chargement...</div>;

    return (
        <main id="main-content" className="page-container">
            <div className="page-header">
                <h1 className="page-title">Comptes rendus de mission</h1>
                {canCreate && (
                    <Link href="/missions/new" className="btn btn-primary">
                        <Plus size={16} />
                        Nouveau compte rendu
                    </Link>
                )}
            </div>

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
                    <p>Aucun compte rendu trouvé.</p>
                    {canCreate && (
                        <Link href="/missions/new" className="btn btn-primary">
                            <Plus size={16} />
                            Créer le premier compte rendu
                        </Link>
                    )}
                </div>
            ) : (
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Mission</th>
                                <th>Lieu</th>
                                <th className={styles.centerCol}>Victimes</th>
                                <th className={styles.centerCol}>UL 18</th>
                                <th className={styles.centerCol}>Incidents</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {reports.map(r => (
                                <tr key={r.id} className={styles.tableRow}>
                                    <td className={styles.dateCell}>{r.mission_date}</td>
                                    <td>
                                        <span className={`${styles.typeBadge} ${styles[`type${r.mission_type}`]}`}>
                                            {MISSION_TYPE_LABELS[r.mission_type] ?? r.mission_type}
                                        </span>
                                    </td>
                                    <td className={styles.nameCell}>
                                        <span className={styles.missionName}>{r.mission_name}</span>
                                        {r.submitter_name && (
                                            <span className={styles.submitterName}>{r.submitter_name}</span>
                                        )}
                                    </td>
                                    <td className={styles.locationCell}>{r.location}</td>
                                    <td className={styles.centerCol}>{r.victim_count > 0 ? r.victim_count : '—'}</td>
                                    <td className={styles.centerCol}>
                                        {r.ul18_present === null ? '—' : r.ul18_present ? 'Oui' : 'Non'}
                                    </td>
                                    <td className={styles.centerCol}>
                                        {hasIncidents(r) ? (
                                            <span className={styles.incidentBadge} title="Incidents signalés">
                                                <AlertCircle size={15} />
                                                {r.needs_followup && ' Suivi'}
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td>
                                        <Link href={`/missions/${r.id}`} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}>
                                            Voir
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </main>
    );
}
