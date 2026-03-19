import DetailCard from '@/components/vehicle/DetailCard';
import { Vehicle, MaintenanceRecord } from '@/app/vehicles/[id]/types';
import { getNextCtDate, getNextRevision, formatDuration } from '@/lib/maintenanceUtils';

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
            value: '#DC2626',
        };
    }
    if (days <= 30) {
        return {
            bg: 'rgba(245, 158, 11, 0.07)',
            border: 'rgba(245, 158, 11, 0.4)',
            value: '#D97706',
        };
    }
    return {
        bg: 'rgba(16, 185, 129, 0.07)',
        border: 'rgba(16, 185, 129, 0.3)',
        value: '#059669',
    };
}

export default function MaintenanceCard({ vehicle, records, onClick, onEdit }: MaintenanceCardProps) {
    const nextCt = getNextCtDate(vehicle, records);
    const nextRevision = getNextRevision(vehicle, records);

    const ctDays = nextCt ? diffDays(nextCt) : null;
    const colors = ctDays !== null ? ctColor(ctDays) : undefined;

    let ctLabel = '—';
    if (ctDays !== null) {
        if (ctDays < 0) {
            ctLabel = `En retard (${formatDuration(Math.abs(ctDays))})`;
        } else if (ctDays === 0) {
            ctLabel = "Aujourd'hui";
        } else {
            ctLabel = `dans ${formatDuration(ctDays)}`;
        }
    }

    const hasRevision = nextRevision !== null;

    return (
        <DetailCard
            title="Entretien"
            value={ctDays !== null ? ctLabel : '—'}
            subtitle="Voir l'historique"
            backgroundColor={colors?.bg}
            borderColor={colors?.border}
            valueStyle={colors?.value ? { color: colors.value } : undefined}
            onEdit={onEdit}
            onClick={onClick}
        >
            {hasRevision && nextRevision && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {(() => {
                        const revDays = diffDays(nextRevision.nextDate);
                        const dateLabel = revDays < 0
                            ? `Révision en retard (${formatDuration(Math.abs(revDays))})`
                            : `Révision dans ${formatDuration(revDays)}`;
                        return `${dateLabel} · ${nextRevision.remainingKm.toLocaleString('fr-FR')} km`;
                    })()}
                </div>
            )}
        </DetailCard>
    );
}
