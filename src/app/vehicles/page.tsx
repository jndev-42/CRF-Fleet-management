'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardSkeletons } from '@/components/ui/Skeleton';
import AddVehicleModal from '@/components/vehicle/modals/AddVehicleModal';
import VehicleCalendar from '@/components/vehicle/VehicleCalendar';
import { useUL } from '@/lib/contexts/ULContext';
import { isAdminOrAbove, hasDTRole } from '@/lib/roles';
import FleetStatsRow from './FleetStatsRow';
import { computeFleetStats, countsAsMaintenance } from '@/lib/fleetStats';
import QuickBorrowSection from './QuickBorrowSection';
import QuickReturnSection from './QuickReturnSection';
import QuickReservationSection from './QuickReservationSection';
import VehicleCard from './VehicleCard';
import DtFilterPanel from './DtFilterPanel';
import DtVehicleResults from './DtVehicleResults';
import { useDtFilters } from './useDtFilters';
import { useFleetVehicles } from './useFleetVehicles';
import { DT_STATUS_META, applyDtFilters, buildDtSummary } from './dtFilters';

// useSearchParams() (filtres de la Vue DT dans l'URL) exige une frontière Suspense.
export default function VehiclesPage() {
  return (
    <Suspense fallback={<DashboardSkeletons count={6} />}>
      <VehiclesPageContent />
    </Suspense>
  );
}

function VehiclesPageContent() {
  const [filter, setFilter] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { activeUL } = useUL();

  const userRoles = session?.user?.roles || [];
  const isAdmin = isAdminOrAbove(userRoles);
  const canAccessDtView = hasDTRole(userRoles) && Boolean(activeUL?.dtCode);
  const dt = useDtFilters(canAccessDtView);
  const { isDtView } = dt;

  const fleet = useFleetVehicles({
    enabled: status === 'authenticated',
    isDtView,
    dtWindow: dt.fetchWindow,
    ulKey: activeUL?.id,
  });
  const { vehicles, loading } = fleet;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const facets = useMemo(() => applyDtFilters(vehicles, { dispo: dt.dispo, types: dt.types }), [vehicles, dt.dispo, dt.types]);
  const periodInvalid = Boolean(dt.periodError);
  // Premier chargement tant que les données affichées ne sont pas celles de la Vue DT de l'UL active.
  const dtInitialLoading = !fleet.hasDtData || status === 'loading';
  const dtBusy = !dtInitialLoading && (loading || dt.pendingWindow);

  // Priorité à la maintenance : un véhicule IN_USE portant une maintenance active
  // est compté sous « Maintenance », pas sous « En mission ». Cf. `@/lib/fleetStats`.
  const stats = isDtView
    ? (periodInvalid || dtInitialLoading ? { total: null, available: null, inUse: null, maintenance: null } : facets.stats)
    : computeFleetStats(vehicles);

  if (status === 'unauthenticated') return null;

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">Véhicules</h1>
          <p className="page-description">
            {isDtView ? `Vision DT de la flotte — ${activeUL?.dtCode}` : `Vue d'ensemble de la flotte — Croix-Rouge${activeUL ? ` ${activeUL.name}` : ''}`}
          </p>
        </div>

        {canAccessDtView && (
          <div style={{ display: 'flex', gap: 8, background: 'var(--bg-secondary)', padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
            <button
              className={`btn ${!isDtView ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 13, padding: '6px 14px' }}
              onClick={() => dt.setDtView(false)}
            >
              🏢 Vue UL ({activeUL?.name})
            </button>
            <button
              className={`btn ${isDtView ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 13, padding: '6px 14px' }}
              onClick={() => dt.setDtView(true)}
            >
              🌐 Vue DT ({activeUL?.dtCode})
            </button>
          </div>
        )}
      </div>

      {isDtView && (
        <div style={{
          padding: '12px 16px',
          marginBottom: 20,
          background: 'rgba(139, 92, 246, 0.12)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          color: 'var(--text-primary)',
        }}>
          <span style={{ fontSize: 22 }}>🌐</span>
          <div>
            <strong style={{ display: 'block', fontSize: 14 }}>Vision DT — {activeUL?.dtCode} (Lecture seule)</strong>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Vous consultez l&apos;ensemble de la flotte de toutes les Unités Locales associées à la {activeUL?.dtCode}. La liste et le calendrier sont en lecture seule.
            </span>
          </div>
        </div>
      )}

      <QuickBorrowSection
        vehicles={vehicles}
        userRoles={userRoles}
        currentUserEmail={session?.user?.email}
        isDtView={isDtView}
        vehiclesLoading={loading}
        onCheckOutSuccess={fleet.refetch}
      />

      <QuickReservationSection
        vehicles={vehicles}
        userRoles={userRoles}
        currentUserEmail={session?.user?.email}
        isDtView={isDtView}
        vehiclesLoading={loading}
        onReservationSuccess={fleet.refetch}
      />

      <QuickReturnSection
        vehicles={vehicles}
        currentUserEmail={session?.user?.email}
        currentUserUlId={activeUL?.id}
        isDtView={isDtView}
        onCheckInSuccess={fleet.refetch}
      />

      <FleetStatsRow stats={stats} />

      <VehicleCalendar dtView={isDtView} />

      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          {isDtView ? (dtInitialLoading ? 'Véhicules de la DT' : `Véhicules de la DT (${vehicles.length})`) : 'Véhicules'}
        </h2>
        {isAdmin && !isDtView && (
          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
            aria-label="Ajouter un nouveau véhicule"
          >
            ➕ Ajouter un véhicule
          </button>
        )}
      </div>

      {isDtView ? (
        <>
          <DtFilterPanel
            mode={dt.mode}
            from={dt.from}
            to={dt.to}
            periodError={dt.periodError}
            dispo={dt.dispo}
            dispoCounts={periodInvalid || dtInitialLoading ? null : facets.dispoCounts}
            types={facets.activeTypes}
            typeOptions={facets.typeOptions}
            summary={periodInvalid ? '' : buildDtSummary({
              count: facets.visible.length,
              types: facets.activeTypes,
              dispo: dt.dispo,
              mode: dt.mode,
              from: dt.from,
              to: dt.to,
              now: new Date(),
            })}
            busy={!periodInvalid && !fleet.error && (dtBusy || dtInitialLoading)}
            onModeChange={dt.setMode}
            onPeriodChange={dt.setPeriod}
            onToggleDispo={dt.toggleDispo}
            onToggleType={dt.toggleType}
            onReset={dt.reset}
          />
          <DtVehicleResults
            visible={facets.visible}
            totalCount={vehicles.length}
            initialLoading={dtInitialLoading}
            busy={dtBusy}
            error={fleet.error}
            periodInvalid={periodInvalid}
            activeFilters={[
              ...dt.dispo.map((s) => ({ key: `dispo-${s}`, label: DT_STATUS_META[s].chip, onRemove: () => dt.toggleDispo(s) })),
              ...facets.activeTypes.map((t) => ({ key: `type-${t}`, label: t, onRemove: () => dt.toggleType(t) })),
            ]}
            renaultData={fleet.renaultData}
            onRetry={fleet.refetch}
            onReset={dt.reset}
          />
        </>
      ) : (
        <>
          <div className="filters-bar" data-tour="filters" role="group" aria-label="Filtrer les véhicules par statut">
            {[
              { key: 'ALL', label: 'Tous' },
              { key: 'AVAILABLE', label: '🟢 Disponibles' },
              { key: 'IN_USE', label: '🟡 En mission' },
              { key: 'MAINTENANCE', label: '🔴 Maintenance' },
            ].map((f) => (
              <button
                key={f.key}
                className={`filter-btn ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading || status === 'loading' ? (
            <div role="status" aria-label="Chargement des véhicules…">
              <DashboardSkeletons count={6} />
            </div>
          ) : (() => {
            const filteredVehicles =
              filter === 'ALL'
                ? vehicles
                : vehicles.filter((v) =>
                    // Un véhicule IN_USE peut porter une maintenance active : son statut
                    // projeté reste IN_USE (le badge 🔧 le signale), il doit malgré tout
                    // apparaître sous le filtre « Maintenance ». Prédicat partagé avec le
                    // compteur : filtre et compteur désignent le même ensemble.
                    filter === 'MAINTENANCE'
                      ? countsAsMaintenance(v)
                      : v.status === filter,
                  );

            if (filteredVehicles.length === 0) {
              return (
                <div className="empty-state">
                  <div className="empty-state-icon">🚗</div>
                  <div className="empty-state-title">Aucun véhicule trouvé</div>
                  <p>Aucun véhicule ne correspond au filtre sélectionné.</p>
                </div>
              );
            }

            return (
              <div className="vehicle-grid" data-tour="vehicle-card">
                {filteredVehicles.map((vehicle, index) => (
                  <VehicleCard
                    key={vehicle.id}
                    vehicle={vehicle}
                    isDtView={false}
                    renaultData={fleet.renaultData[vehicle.name]}
                    isFirst={index === 0}
                  />
                ))}
              </div>
            );
          })()}
        </>
      )}

      <AddVehicleModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          setShowAddModal(false);
          fleet.refetch();
        }}
      />
    </>
  );
}
