'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Camera, Trash2 } from 'lucide-react';
import { SUPPLIES_BY_CATEGORY, MISSION_TYPE_LABELS, TEAM_DYNAMICS_LABELS } from '@/lib/mission-supplies';
import type { SupplyCategory } from '@/lib/mission-supplies';
import MissionPhotosModal from '@/components/missions/MissionPhotosModal';
import styles from './mission-detail.module.css';

interface SupplyEntry {
    id: string;
    item_name: string;
    quantity_used: number;
}

interface MissionDetail {
    id: string;
    submitted_by: string;
    submitted_at: string;
    submitter_name: string | null;
    submitter_email: string | null;
    mission_type: string;
    mission_name: string;
    mission_date: string;
    location: string;
    volunteers: string;
    pegass_ok: boolean;
    vehicle_id: string | null;
    vehicle_name: string | null;
    vehicle_type: string | null;
    driver_id: string | null;
    driver_name: string | null;
    driver_email: string | null;
    victim_count: number;
    ul18_present: boolean | null;
    team_dynamics: string | null;
    all_found_place: boolean | null;
    member_difficulties: boolean | null;
    free_comment: string | null;
    had_acr: boolean;
    had_hemorrhage: boolean;
    had_complex_care: boolean;
    needs_followup: boolean;
    drive_folder_id: string | null;
    signed_report_drive_id: string | null;
    supplies: Record<string, SupplyEntry[]>;
}

function boolLabel(val: boolean | null): string {
    if (val === null) return '—';
    return val ? 'Oui' : 'Non';
}

export default function MissionDetailPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const params = useParams<{ id: string }>();

    const [report, setReport] = useState<MissionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);
    const [photosOpen, setPhotosOpen] = useState(false);

    const roles = (session?.user?.roles || ['GUEST']) as string[];
    const isAdmin = roles.includes('ADMIN');

    useEffect(() => {
        if (status === 'unauthenticated') { router.push('/'); return; }
        if (status === 'authenticated') fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- params.id is stable
    }, [status]);

    async function fetchReport() {
        try {
            const res = await fetch(`/api/missions/${params.id}`);
            if (res.status === 404 || res.status === 403) { router.push('/missions'); return; }
            if (res.ok) setReport(await res.json());
        } catch (e) {
            console.error('Erreur chargement compte rendu', e);
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete() {
        if (!confirm('Supprimer définitivement ce compte rendu ?')) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/missions/${params.id}`, { method: 'DELETE' });
            if (res.ok) router.push('/missions');
            else alert('Erreur lors de la suppression.');
        } catch {
            alert('Erreur réseau.');
        } finally {
            setDeleting(false);
        }
    }

    if (status === 'loading' || loading) return <div className="page-loading">Chargement...</div>;
    if (!report) return null;

    const hasIncidents = report.had_acr || report.had_hemorrhage || report.had_complex_care;
    const supplyCategories = Object.keys(report.supplies) as SupplyCategory[];

    return (
        <main id="main-content" className="page-container">
            <div className="page-header">
                <div className={styles.headerLeft}>
                    <Link href="/missions" className={styles.backLink}>
                        <ArrowLeft size={16} />
                        Retour
                    </Link>
                    <h1 className="page-title">{report.mission_name}</h1>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {report.drive_folder_id && (
                        <button
                            className="btn btn-secondary"
                            onClick={() => setPhotosOpen(true)}
                            aria-label="Voir les photos de communication"
                        >
                            <Camera size={15} />
                            Photos
                        </button>
                    )}
                    {isAdmin && (
                        <button
                            className="btn btn-danger"
                            onClick={handleDelete}
                            disabled={deleting}
                            aria-label="Supprimer ce compte rendu"
                        >
                            <Trash2 size={15} />
                            {deleting ? 'Suppression...' : 'Supprimer'}
                        </button>
                    )}
                </div>
            </div>

            {/* Meta info */}
            <div className={styles.metaBar}>
                <span className={`${styles.typeBadge} ${styles[`type${report.mission_type}`]}`}>
                    {MISSION_TYPE_LABELS[report.mission_type] ?? report.mission_type}
                </span>
                <span className={styles.metaItem}>{report.mission_date}</span>
                <span className={styles.metaItem}>{report.location}</span>
                {report.submitter_name && <span className={styles.metaItem}>Par {report.submitter_name}</span>}
            </div>

            <div className={styles.grid}>
                {/* Section 1 — Infos mission */}
                <div className="card">
                    <h2 className={styles.cardTitle}>Informations mission</h2>
                    <dl className={styles.dl}>
                        <dt>Type</dt><dd>{MISSION_TYPE_LABELS[report.mission_type] ?? report.mission_type}</dd>
                        <dt>Date</dt><dd>{report.mission_date}</dd>
                        <dt>Lieu</dt><dd>{report.location}</dd>
                        <dt>Victimes prises en charge</dt><dd>{report.victim_count}</dd>
                        <dt>Inscriptions Pegass</dt><dd>{boolLabel(report.pegass_ok)}</dd>
                        {report.vehicle_name && <><dt>Véhicule</dt><dd>{report.vehicle_name}</dd></>}
                        {report.driver_name && <><dt>Chauffeur</dt><dd>{report.driver_name}</dd></>}
                        <dt>Bénévoles</dt><dd>{report.volunteers || 'Voir Pegass'}</dd>
                    </dl>
                </div>

                {/* Incidents */}
                {hasIncidents && (
                    <div className={`card ${styles.incidentCard}`}>
                        <h2 className={styles.cardTitle}>
                            <AlertCircle size={18} className={styles.incidentIcon} />
                            Incidents critiques
                        </h2>
                        <ul className={styles.incidentList}>
                            {report.had_acr && <li>Arrêt cardio-respiratoire (ACR)</li>}
                            {report.had_hemorrhage && <li>Hémorragie grave</li>}
                            {report.had_complex_care && <li>Prise en charge complexe</li>}
                        </ul>
                        {report.needs_followup && (
                            <p className={styles.followupNote}>Suivi nécessaire signalé.</p>
                        )}
                    </div>
                )}

                {/* Rapport signé */}
                {report.signed_report_drive_id && (
                    <div className="card">
                        <h2 className={styles.cardTitle}>Rapport signé</h2>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={`/api/drive/photos/${report.signed_report_drive_id}`}
                            alt="Rapport de mission signé"
                            style={{
                                width: '100%',
                                borderRadius: 6,
                                border: '1px solid var(--border-primary)',
                                marginTop: '0.5rem',
                            }}
                        />
                    </div>
                )}

                {/* Dynamique équipe */}
                {report.ul18_present === true && (
                    <div className="card">
                        <h2 className={styles.cardTitle}>Dynamique d&apos;équipe</h2>
                        <dl className={styles.dl}>
                            <dt>Présence UL 18</dt><dd>Oui</dd>
                            {report.team_dynamics && <><dt>Dynamique</dt><dd>{TEAM_DYNAMICS_LABELS[report.team_dynamics] ?? report.team_dynamics}</dd></>}
                            <dt>Chacun a trouvé sa place</dt><dd>{boolLabel(report.all_found_place)}</dd>
                            <dt>Membres en difficulté</dt><dd>{boolLabel(report.member_difficulties)}</dd>
                            {report.free_comment && <><dt>Commentaire</dt><dd>{report.free_comment}</dd></>}
                        </dl>
                    </div>
                )}
            </div>

            {/* Matériel utilisé */}
            {supplyCategories.length > 0 && (
                <section className={styles.suppliesSection}>
                    <h2 className={styles.sectionTitle}>Matériel consommé</h2>
                    <div className={styles.suppliesGrid}>
                        {supplyCategories.map(cat => {
                            const def = SUPPLIES_BY_CATEGORY[cat];
                            const items = report.supplies[cat] ?? [];
                            return (
                                <div key={cat} className="card">
                                    <h3 className={styles.cardTitle}>{def?.label ?? cat}</h3>
                                    <table className={styles.supplyTable}>
                                        <tbody>
                                            {items.map(item => (
                                                <tr key={item.id}>
                                                    <td>{item.item_name}</td>
                                                    <td className={styles.qtyCell}>{item.quantity_used}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {photosOpen && report.drive_folder_id && (
                <MissionPhotosModal folderId={report.drive_folder_id} onClose={() => setPhotosOpen(false)} />
            )}
        </main>
    );
}
