'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import MissionWizard from '@/components/missions/MissionWizard';
import { reportToWizardState, type MissionReportForEdit } from '@/lib/missions/edit-form';

interface ReportForEditPage extends MissionReportForEdit {
    id: string;
    ulName: string | null;
    can_edit: boolean;
    vehicle_name: string | null;
    driver_name: string | null;
    driver_email: string | null;
    signed_report_drive_id: string | null;
}

/** Échec du chargement : refus (403 ou pas de droit), introuvable (404), autre erreur. */
type LoadError = 'forbidden' | 'not_found' | 'error';

const LOAD_ERRORS: Record<LoadError, { title: string; message: string }> = {
    forbidden: { title: 'Modification impossible', message: 'Vous n\'avez pas le droit de modifier ce compte rendu.' },
    not_found: { title: 'Compte rendu introuvable', message: 'Ce compte rendu n\'existe pas ou a été supprimé.' },
    error: { title: 'Chargement impossible', message: 'Le compte rendu n\'a pas pu être chargé. Réessayez dans un instant.' },
};

/** /missions/[id]/edit — modification d'un compte rendu déjà envoyé (wizard en mode édition). */
export default function EditMissionPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();
    const params = useParams<{ id: string }>();

    const [report, setReport] = useState<ReportForEditPage | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<LoadError | null>(null);

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/login');
    }, [status, router]);

    useEffect(() => {
        if (status === 'authenticated') fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- params.id est stable pour la page
    }, [status]);

    async function fetchReport() {
        // Redirection vers la connexion : reste sur « Chargement… » plutôt que d'afficher une erreur.
        let redirecting = false;
        try {
            const res = await fetch(`/api/missions/${params.id}`);
            if (res.status === 401) {
                redirecting = true;
                router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
                return;
            }
            if (!res.ok) {
                setLoadError(res.status === 403 ? 'forbidden' : res.status === 404 ? 'not_found' : 'error');
                return;
            }
            const data: ReportForEditPage = await res.json();
            if (!data.can_edit) setLoadError('forbidden');
            else setReport(data);
        } catch (e) {
            console.error('Erreur chargement compte rendu', e);
            setLoadError('error');
        } finally {
            if (!redirecting) setLoading(false);
        }
    }

    if (status === 'unauthenticated') return null;
    if (status === 'loading' || loading) return <div className="page-loading">Chargement...</div>;

    if (loadError || !report) {
        const { title, message } = LOAD_ERRORS[loadError ?? 'error'];
        return (
            <main id="main-content" className="page-container">
                <div className="card" role="alert" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <Lock size={20} aria-hidden="true" style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    <div>
                        <h1 className="page-title" style={{ fontSize: '1.1rem', margin: '0 0 0.5rem' }}>{title}</h1>
                        <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary)' }}>{message}</p>
                        <Link href={loadError === 'not_found' ? '/missions' : `/missions/${params.id}`} className="btn btn-secondary">
                            <ArrowLeft size={15} /> {loadError === 'not_found' ? 'Retour aux comptes rendus' : 'Retour au compte rendu'}
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    const initial = reportToWizardState(report);

    return (
        <main id="main-content" className="page-container">
            <div className="page-header">
                <h1 className="page-title">Modifier le compte rendu</h1>
            </div>
            <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Le rattachement, les photos et le rapport signé ne sont pas modifiables.
                Chaque enregistrement est conservé dans l&apos;historique des modifications.
            </p>

            <MissionWizard
                currentUserId={session?.user?.id}
                currentUserName={session?.user?.name ?? undefined}
                currentUserUlName={report.ulName ?? undefined}
                edit={{
                    reportId: report.id,
                    ...initial,
                    hasSignedReport: Boolean(report.signed_report_drive_id),
                    storedVehicle: report.vehicle_id ? { id: report.vehicle_id, name: report.vehicle_name ?? report.vehicle_id } : null,
                    storedDriver: report.driver_id
                        ? { id: report.driver_id, name: report.driver_name ?? report.driver_email ?? report.driver_id }
                        : null,
                }}
                onSuccess={id => router.push(`/missions/${id}`)}
            />
        </main>
    );
}
