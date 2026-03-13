import { Car, CheckCircle, MapPin, Gauge, AlertTriangle, Fuel, BarChart2, Zap } from 'lucide-react';
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
      sub: data.totalKm > 0
        ? `${data.incidentRate.toFixed(1)} inc./100 km`
        : `${incidentPct}% des sorties`,
      valueClass: data.totalIncidents > 0 ? 'text-amber' : undefined,
    },
    {
      icon: <Fuel size={18} />,
      iconClass: 'amber',
      label: 'L/100km réel',
      value: data.avgLPer100km > 0 ? `${data.avgLPer100km.toFixed(1)} L` : '—',
      sub: 'consommation moyenne',
    },
    {
      icon: <BarChart2 size={18} />,
      iconClass: 'blue',
      label: 'Taux d\'utilisation',
      value: `${data.fleetUtilizationRate}%`,
      sub: 'jours avec sortie / période',
    },
    {
      icon: <Fuel size={18} />,
      iconClass: 'green',
      label: 'Carburant moy. retour',
      value: data.avgFuelAtReturn > 0 ? `${data.avgFuelAtReturn}%` : '—',
      sub: 'niveau moyen au retour',
    },
    {
      icon: <Zap size={18} />,
      iconClass: 'blue',
      label: 'kWh/100km réel',
      value: data.avgKwhPer100km > 0 ? `${data.avgKwhPer100km.toFixed(1)} kWh` : '—',
      sub: 'consommation moyenne (EV)',
    },
    {
      icon: <Zap size={18} />,
      iconClass: 'green',
      label: 'kWh consommés',
      value: data.totalKwhConsumed > 0 ? `${data.totalKwhConsumed.toFixed(0)} kWh` : '—',
      sub: 'total période (EV)',
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
