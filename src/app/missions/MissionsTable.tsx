'use client';

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { MISSION_TYPE_LABELS } from '@/lib/mission-supplies';
import styles from './missions.module.css';

export interface MissionReport {
    id: string;
    mission_type: string;
    mission_name: string;
    mission_date: string;
    location: string;
    victim_count: number;
    presence_ul: boolean | null;
    had_acr: boolean;
    had_hemorrhage: boolean;
    had_complex_care: boolean;
    needs_followup: boolean;
    submitted_at: string;
    submitter_name: string | null;
    vehicle_name: string | null;
    /** Nom de l'UL de rattachement du rapport — null si le rapport est rattaché à une DT */
    ul_name: string | null;
    /** Code DT de rattachement — null si le rapport est rattaché à une UL */
    dt_code: string | null;
}

const hasIncidents = (r: MissionReport) => r.had_acr || r.had_hemorrhage || r.had_complex_care;

/** Tag de rattachement : UL réelle, ou entité DT synthétique. Les deux ne sont
 *  jamais renseignés ensemble (invariant garanti côté API). */
function AttachmentTag({ report }: { report: MissionReport }) {
    if (report.ul_name) {
        return <span className={styles.attachmentTag}>{report.ul_name}</span>;
    }
    if (report.dt_code) {
        return <span className={`${styles.attachmentTag} ${styles.attachmentTagDt}`}>{report.dt_code}</span>;
    }
    return <>—</>;
}

interface MissionsTableProps {
    reports: MissionReport[];
}

export default function MissionsTable({ reports }: MissionsTableProps) {
    return (
        <div className={styles.tableWrapper}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Mission</th>
                        <th>Lieu</th>
                        <th className={styles.centerCol}>Victimes</th>
                        <th className={styles.centerCol}>UL / DT</th>
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
                                <AttachmentTag report={r} />
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
    );
}
