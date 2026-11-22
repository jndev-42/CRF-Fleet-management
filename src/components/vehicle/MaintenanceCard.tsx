import DetailCard from '@/components/vehicle/DetailCard';
import { Vehicle, MaintenanceRecord } from '@/app/vehicles/[id]/types';
import { getNextCtDate, getRevisionDisplay, formatDuration } from '@/lib/maintenanceUtils';

interface MaintenanceCardProps {
    vehicle: Vehicle;
    records: MaintenanceRecord[];
    onClick: () => void;
    onEdit?: () => void;
}

function diffDays(target: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const t = new Date(target);
    t.setHours(0, 0, 0, 0);
    return Math.round((t.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function ctColor(days: number): { bg: string; border: string; value: string } {
    if (days < 0) {
        return {
            bg: 'rgba(239, 68, 68, 0.07)',
            border: 'rgba(239, 68, 68, 0.4)',
            value: 'var(--status-maintenance)',
        };
    }
    if (days <= 30) {
        return {
            bg: 'rgba(245, 158, 11, 0.07)',
            border: 'rgba(245, 158, 11, 0.4)',
            value: 'var(--status-inuse)',
        };
    }
    return {
        bg: 'rgba(16, 185, 129, 0.07)',
        border: 'rgba(16, 185, 129, 0.3)',
        value: 'var(--status-available)',
    };
}

/** Échéance formatée : « dans 9 mois », « En retard (2 mois) », « Aujourd'hui ». */
function dueLabel(days: number): string {
    if (days < 0) return `En retard (${formatDuration(Math.abs(days))})`;
    if (days === 0) return "Aujourd'hui";
    return `dans ${formatDuration(days)}`;
}

function lower(label: string): string {
    return label.replace(/^En retard/, 'en retard').replace(/^Aujourd'hui/, "aujourd'hui");
}

export default function MaintenanceCard({ vehicle, records, onClick, onEdit }: MaintenanceCardProps) {
    const nextCt = getNextCtDate(vehicle, records);
    const revision = getRevisionDisplay(vehicle, records);

    const ctDays = nextCt ? diffDays(nextCt) : null;
    const revDays = revision?.nextDate ? diffDays(revision.nextDate) : null;

    const remainingKm = revision?.remainingKm ?? null;
    const kmOverdue = remainingKm !== null && remainingKm < 0;
    const kmLabel = remainingKm !== null ? Math.abs(remainingKm).toLocaleString('fr-FR') : '';

    // Valeur de la carte : l'échéance la plus proche, nommée. Une révision dépassée en km est en retard.
    let nearest: { text: string; days: number } | null = null;
    if (ctDays !== null) nearest = { text: `CT ${lower(dueLabel(ctDays))}`, days: ctDays };
    if (kmOverdue) {
        nearest = { text: `Révision dépassée de ${kmLabel} km`, days: -1 };
    } else if (revDays !== null && (nearest === null || revDays < nearest.days)) {
        nearest = { text: `Révision ${lower(dueLabel(revDays))}`, days: revDays };
    }

    const colors = nearest ? ctColor(nearest.days) : undefined;
    const value = nearest ? nearest.text : '—';

    let revisionText: string | null = null;
    if (kmOverdue) {
        revisionText = `dépassée de ${kmLabel} km`;
    } else if (revision) {
        const dateOverdue = revDays !== null && revDays < 0;
        const parts: string[] = [];
        if (revDays !== null) parts.push(dueLabel(revDays));
        if (remainingKm !== null && !dateOverdue) {
            parts.push(`${revDays !== null ? 'ou' : 'dans'} ${kmLabel} km`);
        }
        revisionText = parts.join(' ');
    }

    return (
        <DetailCard
            title="Entretien"
            value={value}
            subtitle="Voir l'historique"
            backgroundColor={colors?.bg}
            borderColor={colors?.border}
            valueStyle={colors?.value ? { color: colors.value } : undefined}
            onEdit={onEdit}
            onClick={onClick}
        >
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                <div>Contrôle technique : {ctDays !== null ? dueLabel(ctDays) : '—'}</div>
                {revisionText !== null && <div>Révision : {revisionText}</div>}
            </div>
        </DetailCard>
    );
}
