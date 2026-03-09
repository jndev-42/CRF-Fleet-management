import { Car, CheckCircle, MapPin, Gauge, AlertTriangle, Fuel } from 'lucide-react';
import { StatsData } from './types';

interface KPICardsProps {
  data: StatsData['global'];
}

export default function KPICards({ data }: KPICardsProps) {
  const completionPct = data.totalTrips > 0
    ? Math.round((data.completedTrips / data.totalTrips) * 100)
    : 0;
  const activeTrips = data.totalTrips - data.completedTrips;
  const incidentPct = data.totalTrips > 0
    ? Math.round((data.totalIncidents / data.totalTrips) * 100)
    : 0;

  const cards = [
    {
      icon: <Car size={18} />,
      iconClass: 'red',
      label: 'Total emprunts',
      value: data.totalTrips.toLocaleString('fr-FR'),
      sub: `dont ${activeTrips} en cours`,
    },
    {
      icon: <CheckCircle size={18} />,
      iconClass: 'green',
      label: 'Sorties terminées',
      value: data.completedTrips.toLocaleString('fr-FR'),
      sub: `${completionPct}% de complétion`,
    },
    {
      icon: <MapPin size={18} />,
      iconClass: 'blue',
      label: 'Km parcourus',
      value: data.totalKm.toLocaleString('fr-FR'),
      sub: 'sur la période',
    },
    {
      icon: <Gauge size={18} />,
      iconClass: 'blue',
      label: 'Km moy. / trajet',
      value: `${data.avgKmPerTrip.toLocaleString('fr-FR')} km`,
      sub: 'trajet terminé',
    },
    {
      icon: <AlertTriangle size={18} />,
      iconClass: 'amber',
      label: 'Incidents signalés',
      value: data.totalIncidents.toLocaleString('fr-FR'),
      sub: `${incidentPct}% des sorties`,
      valueClass: data.totalIncidents > 0 ? 'text-amber' : undefined,
    },
    {
      icon: <Fuel size={18} />,
      iconClass: 'amber',
      label: 'Conso. moy.',
      value: data.avgFuelConsumption > 0 ? `−${Math.round(data.avgFuelConsumption)}%` : '—',
      sub: 'par trajet',
    },
  ];

  return (
    <div className="kpi-grid">
      {cards.map((card) => (
        <div key={card.label} className="kpi-card">
          <div className={`kpi-icon ${card.iconClass}`}>
            {card.icon}
          </div>
          <div className="kpi-label">{card.label}</div>
          <div
            className="kpi-value"
            style={card.valueClass === 'text-amber' ? { color: 'var(--status-inuse)' } : undefined}
          >
            {card.value}
          </div>
          <div className="kpi-sub">{card.sub}</div>
        </div>
      ))}
    </div>
  );
}
