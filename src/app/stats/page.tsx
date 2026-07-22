'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Download, FileText, AlertCircle } from 'lucide-react';

import { StatsData } from '@/components/stats/types';
import MultiSelectDropdown from '@/components/stats/MultiSelectDropdown';
import KPICards from '@/components/stats/KPICards';
import DriverBreakdown from '@/components/stats/DriverBreakdown';
import VehicleBreakdown from '@/components/stats/VehicleBreakdown';
import FunFactor from '@/components/stats/FunFactor';
import ExportModal from '@/components/stats/ExportModal';
import ExportReadyModal from '@/components/stats/ExportReadyModal';
import ExpenseStatsSection from '@/components/stats/ExpenseStatsSection';

// Recharts uses browser APIs — SSR disabled
const ChartsSection = dynamic(() => import('@/components/stats/ChartsSection'), { ssr: false });

interface VehicleOption {
  id: string;
  name: string;
}

interface DriverOption {
  id: string;
  name: string;
}

function getDefaultDates(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 60);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function diffDays(from: string, to: string): number {
  const f = new Date(from).getTime();
  const t = new Date(to).getTime();
  return (t - f) / (1000 * 60 * 60 * 24);
}

const MISSION_TYPES = ['Opération', 'Formation', 'Logistique', 'Autre'];

export default function StatsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const userRoles = (session?.user?.roles || []) as string[];
  const canViewExpensesStats = userRoles.includes('SUPER_ADMIN') || userRoles.includes('PRESIDENT') || userRoles.includes('TRESORIER');

  const [activeTab, setActiveTab] = useState<'vehicles' | 'expenses'>('vehicles');

  const defaults = getDefaultDates();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [vehicleId, setVehicleId] = useState('');
  const [driverIds, setDriverIds] = useState<string[]>([]);
  const [missionType, setMissionType] = useState('');
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState<'csv' | 'pdf' | null>(null);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportReadyType, setExportReadyType] = useState<'csv' | 'pdf' | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const rangeError = diffDays(dateFrom, dateTo) > 62
    ? 'La plage affichée est limitée à 2 mois. Utilisez l\'export pour des plages plus larges.'
    : diffDays(dateFrom, dateTo) < 0
    ? 'La date de début doit être antérieure à la date de fin.'
    : null;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      const roles = (session?.user?.roles || ['GUEST']) as string[];
      const allowed = ['ADMIN', 'RESPO', 'CHVL', 'CHVPSP', 'PRESIDENT', 'TRESORIER', 'SUPER_ADMIN'];
      if (!roles.some((r) => allowed.includes(r))) {
        router.push('/');
      }
    }
  }, [status, session, router]);

  // Fetch vehicles and drivers for filter dropdowns
  useEffect(() => {
    if (status !== 'authenticated') return;

    Promise.all([
      fetch('/api/vehicles').then((r) => r.json()),
      fetch('/api/users?drivers=true').then((r) => r.json()),
    ]).then(([vehiclesJson, usersJson]) => {
      if (Array.isArray(vehiclesJson)) {
        setVehicles(
          (vehiclesJson as Array<{ id: string; name: string }>).map((v) => ({
            id: v.id,
            name: v.name,
          }))
        );
      }
      if (usersJson.users) {
        setDrivers(
          (usersJson.users as Array<{ id: string; name: string }>).map((u) => ({
            id: u.id,
            name: u.name,
          }))
        );
      }
    }).catch((err) => console.error('Failed to load filter options', err));
  }, [status]);

  const fetchStats = useCallback(async () => {
    if (rangeError) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
      });
      if (vehicleId) params.set('vehicleId', vehicleId);
      if (driverIds.length > 0) params.set('driverId', driverIds.join(','));
      if (missionType) params.set('missionType', missionType);

      const res = await fetch(`/api/stats?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Erreur lors du chargement des statistiques');
        setData(null);
      } else {
        setData(json.data);
      }
    } catch (err) {
      console.error(err);
      setError('Erreur réseau');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, vehicleId, driverIds, missionType, rangeError]);

  useEffect(() => {
    if (status === 'authenticated' && activeTab === 'vehicles') {
      fetchStats();
    }
  }, [status, fetchStats, activeTab]);

  async function handleExportCSV(from: string, to: string) {
    setShowExportModal(null);
    setExportingCsv(true);
    setExportJobId(null);
    setExportReadyType(null);
    try {
      const res = await fetch('/api/stats/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateFrom: from, dateTo: to }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? 'Erreur lors de la génération du CSV');
        return;
      }
      setExportJobId(json.jobId);
      setExportReadyType('csv');
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la génération du CSV');
    } finally {
      setExportingCsv(false);
    }
  }

  async function handleExportPDF(from: string, to: string) {
    setShowExportModal(null);
    setExportingPdf(true);
    setExportJobId(null);
    setExportReadyType(null);
    try {
      const res = await fetch('/api/stats/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateFrom: from, dateTo: to }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? 'Erreur lors de la génération du PDF');
        return;
      }
      setExportJobId(json.jobId);
      setExportReadyType('pdf');
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la génération du PDF');
    } finally {
      setExportingPdf(false);
    }
  }

  if (status === 'unauthenticated') return null;

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Statistiques</h1>
          <p className="page-description">
            {activeTab === 'vehicles' ? 'Analyse des emprunts véhicules' : 'Analyse des notes de frais'}
          </p>
        </div>
        {activeTab === 'vehicles' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowExportModal('csv')}
              disabled={exportingCsv}
            >
              <Download size={14} />
              {exportingCsv ? 'Génération...' : 'Export CSV'}
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowExportModal('pdf')}
              disabled={exportingPdf}
            >
              <FileText size={14} />
              {exportingPdf ? 'Génération...' : 'Export PDF'}
            </button>
          </div>
        )}
      </div>

      {/* Tabs navigation bar */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-primary)', paddingBottom: '12px', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('vehicles')}
          style={{
            padding: '8px 16px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            background: activeTab === 'vehicles' ? 'var(--red-primary, #ef4444)' : 'var(--bg-secondary)',
            color: activeTab === 'vehicles' ? '#ffffff' : 'var(--text-secondary)',
            transition: 'all 0.2s ease',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          🚗 Véhicules
        </button>

        {canViewExpensesStats && (
          <button
            type="button"
            onClick={() => setActiveTab('expenses')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'expenses' ? 'var(--red-primary, #ef4444)' : 'var(--bg-secondary)',
              color: activeTab === 'expenses' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.2s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            💶 Frais
          </button>
        )}
      </div>

      {activeTab === 'expenses' && canViewExpensesStats ? (
        <ExpenseStatsSection
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />
      ) : (
        <>
          {/* Filters bar */}
          <div className="stats-filters-bar">
            <span className="stats-filter-label">Période</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="date"
                className="stats-date-input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <span className="stats-filter-sep">→</span>
              <input
                type="date"
                className="stats-date-input"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <select
              className="stats-date-input"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              aria-label="Filtrer par véhicule"
            >
              <option value="">Tous les véhicules</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>

            <MultiSelectDropdown
              options={drivers.map((d) => ({ id: d.id, label: d.name }))}
              value={driverIds}
              onChange={setDriverIds}
              placeholder="Tous les chauffeurs"
            />

            <select
              className="stats-date-input"
              value={missionType}
              onChange={(e) => setMissionType(e.target.value)}
              aria-label="Filtrer par type de mission"
            >
              <option value="">Tous types</option>
              {MISSION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            {rangeError ? (
              <div className="stats-date-error">
                <AlertCircle size={13} />
                {rangeError}
              </div>
            ) : (
              <div className="stats-filter-hint">
                Affichage limité à 2 mois • Pour des plages plus larges, utilisez l&apos;export
              </div>
            )}
          </div>

          {/* Loading skeleton */}
          {(loading || status === 'loading') && !rangeError && (
            <>
              <div className="stats-skeleton-grid">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="kpi-card">
                    <div className="skel" style={{ width: 36, height: 36, borderRadius: 8 }} />
                    <div className="skel" style={{ width: '60%', height: 10 }} />
                    <div className="skel" style={{ width: '40%', height: 28 }} />
                    <div className="skel" style={{ width: '70%', height: 10 }} />
                  </div>
                ))}
              </div>
              <div className="charts-grid">
                <div className="chart-card" style={{ height: 280 }}>
                  <div className="skel" style={{ height: '100%' }} />
                </div>
                <div className="chart-card" style={{ height: 280 }}>
                  <div className="skel" style={{ height: '100%' }} />
                </div>
                <div className="chart-card chart-card-full" style={{ height: 220 }}>
                  <div className="skel" style={{ height: '100%' }} />
                </div>
              </div>
              <div className="breakdown-grid">
                <div className="breakdown-card">
                  <div className="skel" style={{ height: 220 }} />
                </div>
                <div className="breakdown-card">
                  <div className="skel" style={{ height: 220 }} />
                </div>
              </div>
            </>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="empty-state">
              <div className="empty-state-icon">⚠️</div>
              <div className="empty-state-title">{error}</div>
            </div>
          )}

          {/* Data */}
          {data && !loading && !rangeError && (
            <>
              <KPICards data={data.global} />

              <ChartsSection
                byDriver={data.byDriver}
                kmOverTime={data.kmOverTime}
                byMissionType={data.byMissionType}
              />

              <div className="breakdown-grid">
                <DriverBreakdown byDriver={data.byDriver} />
                <VehicleBreakdown byVehicle={data.byVehicle} />
              </div>

              <FunFactor byDriver={data.byDriver} />
            </>
          )}

          {/* Empty state when no trips in range */}
          {data && !loading && !rangeError && data.global.totalTrips === 0 && (
            <div className="empty-state" style={{ marginTop: -16 }}>
              <div className="empty-state-icon">📊</div>
              <div className="empty-state-title">Aucune sortie sur cette période</div>
              <p>Modifiez la plage de dates pour afficher des statistiques.</p>
            </div>
          )}
        </>
      )}

      {/* Export modals */}
      {showExportModal === 'csv' && (
        <ExportModal
          type="csv"
          defaultFrom={dateFrom}
          defaultTo={dateTo}
          onConfirm={handleExportCSV}
          onClose={() => setShowExportModal(null)}
        />
      )}
      {showExportModal === 'pdf' && (
        <ExportModal
          type="pdf"
          defaultFrom={dateFrom}
          defaultTo={dateTo}
          onConfirm={handleExportPDF}
          onClose={() => setShowExportModal(null)}
        />
      )}

      {/* Export ready modal (CSV or PDF) */}
      {exportReadyType && exportJobId && (
        <ExportReadyModal
          type={exportReadyType}
          jobId={exportJobId}
          onClose={() => {
            setExportReadyType(null);
            setExportJobId(null);
          }}
        />
      )}
    </>
  );
}
