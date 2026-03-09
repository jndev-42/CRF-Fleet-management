import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Image,
} from '@react-pdf/renderer';
import type { StatsDataResult } from '@/lib/stats';

// ── Color palette ──────────────────────────────────────────────────────────
const RED = '#E30613';
const WHITE = '#FFFFFF';
const DARK = '#111827';
const MID = '#374151';
const LIGHT = '#6B7280';
const BG = '#F9FAFB';
const BORDER = '#E5E7EB';
const GREEN = '#16A34A';
const AMBER = '#D97706';

// ── Types ──────────────────────────────────────────────────────────────────
export interface StatsPdfProps {
  data: StatsDataResult;
  incidentRows: Array<{
    checkOutAt: string;
    driverName: string;
    vehicleName: string;
    incident: string;
  }>;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  logoSrc: string;
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: DARK,
    paddingTop: 30,
    paddingBottom: 50,
    paddingHorizontal: 30,
    backgroundColor: WHITE,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: RED,
    marginHorizontal: -30,
    marginTop: -30,
    paddingHorizontal: 30,
    paddingVertical: 16,
    height: 80,
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogoText: {
    marginLeft: 10,
  },
  headerTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 16,
    color: WHITE,
  },
  headerSubtitle: {
    fontSize: 8,
    color: WHITE,
    marginTop: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerReportTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    color: WHITE,
  },
  headerPeriod: {
    fontSize: 9,
    color: WHITE,
    marginTop: 3,
  },
  headerGenerated: {
    fontSize: 8,
    color: WHITE,
    marginTop: 2,
  },

  // Section title
  sectionTitleContainer: {
    marginBottom: 8,
    marginTop: 14,
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: RED,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionDivider: {
    borderBottomWidth: 1.5,
    borderBottomColor: RED,
    borderBottomStyle: 'solid',
  },

  // KPI row
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  kpiBox: {
    flex: 1,
    backgroundColor: BG,
    borderTopWidth: 3,
    borderTopColor: RED,
    borderTopStyle: 'solid',
    borderWidth: 0.5,
    borderColor: BORDER,
    borderStyle: 'solid',
    padding: 8,
    minHeight: 62,
  },
  kpiLabel: {
    fontSize: 7,
    color: LIGHT,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  kpiValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    color: DARK,
    marginBottom: 4,
  },
  kpiValueRed: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    color: RED,
    marginBottom: 4,
  },
  kpiSub: {
    fontSize: 7,
    color: LIGHT,
  },

  // Table
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: RED,
    paddingVertical: 0,
  },
  tableHeaderCell: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: WHITE,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.3,
    borderBottomColor: BORDER,
    borderBottomStyle: 'solid',
  },
  tableCell: {
    fontSize: 8,
    color: MID,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableCellBold: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: DARK,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },

  // Progress bar
  barContainer: {
    flex: 1,
    height: 6,
    backgroundColor: BORDER,
    marginTop: 6,
    marginLeft: 4,
    marginRight: 4,
  },

  // Footer (fixed)
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    borderTopStyle: 'solid',
    paddingTop: 6,
  },
  footerLeft: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: RED,
  },
  footerCenter: {
    fontSize: 8,
    color: LIGHT,
  },
  footerRight: {
    fontSize: 8,
    color: LIGHT,
  },
});

// ── Helper: format date string ─────────────────────────────────────────────
function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function fmtDateShort(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────


function SectionTitle({ children }: { children: string }) {
  return (
    <View style={styles.sectionTitleContainer}>
      <Text style={styles.sectionTitle}>{children}</Text>
      <View style={styles.sectionDivider} />
    </View>
  );
}

function TableHeaderRow({ cols }: { cols: Array<{ label: string; flex?: number; width?: number }> }) {
  return (
    <View style={styles.tableHeaderRow} wrap={false}>
      {cols.map((col, i) => (
        <Text
          key={i}
          style={[
            styles.tableHeaderCell,
            col.width ? { width: col.width } : { flex: col.flex ?? 1 },
          ]}
        >
          {col.label}
        </Text>
      ))}
    </View>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerLeft}>CR-Chauffeur v1.11.0</Text>
      <Text style={styles.footerCenter}>Rapport confidentiel - usage interne uniquement</Text>
      <Text
        style={styles.footerRight}
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Page ${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

// ── Main document ──────────────────────────────────────────────────────────
export default function StatsPdfDocument({
  data,
  incidentRows,
  dateFrom,
  dateTo,
  generatedAt,
  logoSrc,
}: StatsPdfProps) {
  const globalAvgKm =
    data.global.completedTrips > 0 ? data.global.totalKm / data.global.completedTrips : 0;
  const totalMissions = data.byMissionType.reduce((acc, m) => acc + m.count, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            <Image src={logoSrc} style={{ width: 48, height: 48 }} />
            <View style={styles.headerLogoText}>
              <Text style={styles.headerTitle}>CR-Chauffeur</Text>
              <Text style={styles.headerSubtitle}>Croix-Rouge Française - Gestion des véhicules</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerReportTitle}>Rapport Statistiques</Text>
            <Text style={styles.headerPeriod}>
              Période : {fmtDate(dateFrom)} - {fmtDate(dateTo)}
            </Text>
            <Text style={styles.headerGenerated}>Généré le {generatedAt}</Text>
          </View>
        </View>

        {/* Section 1: KPIs */}
        <SectionTitle>1  Indicateurs globaux</SectionTitle>
        <View style={styles.kpiRow}>
          {/* Total emprunts */}
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Total emprunts</Text>
            <Text style={styles.kpiValue}>{String(data.global.totalTrips)}</Text>
            <Text style={styles.kpiSub}>
              dont {data.global.totalTrips - data.global.completedTrips} en cours
            </Text>
          </View>
          {/* Km parcourus */}
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Km parcourus</Text>
            <Text style={styles.kpiValue}>
              {data.global.totalKm.toLocaleString('fr-FR')}
            </Text>
            <Text style={styles.kpiSub}>{data.global.avgKmPerTrip} km / trajet en moy.</Text>
          </View>
          {/* Incidents */}
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Incidents</Text>
            <Text style={data.global.totalIncidents > 0 ? styles.kpiValueRed : styles.kpiValue}>
              {String(data.global.totalIncidents)}
            </Text>
            <Text style={styles.kpiSub}>
              {data.global.totalTrips > 0
                ? Math.round((data.global.totalIncidents / data.global.totalTrips) * 100)
                : 0}
              % des sorties
            </Text>
          </View>
          {/* Conso. moy. */}
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Conso. moy. carbu.</Text>
            <Text style={styles.kpiValue}>
              {data.global.avgFuelConsumption > 0
                ? `-${Math.round(data.global.avgFuelConsumption)}%`
                : '--'}
            </Text>
            <Text style={styles.kpiSub}>de carburant / trajet</Text>
          </View>
        </View>

        {/* Section 2: By driver */}
        <SectionTitle>2  Détail par chauffeur</SectionTitle>
        <TableHeaderRow
          cols={[
            { label: 'Chauffeur', flex: 2 },
            { label: 'Emprunts', flex: 1 },
            { label: '% du total', flex: 1 },
            { label: 'Km totaux', flex: 1 },
            { label: 'vs. moyenne', flex: 1 },
            { label: 'Incidents', flex: 1 },
          ]}
        />
        {data.byDriver.map((driver, idx) => {
          const driverAvgKm = driver.tripCount > 0 ? driver.totalKm / driver.tripCount : 0;
          const vsAvg =
            globalAvgKm > 0 ? Math.round(((driverAvgKm / globalAvgKm) - 1) * 100) : 0;
          const vsAvgStr = vsAvg >= 0 ? `+${vsAvg}%` : `${vsAvg}%`;
          const vsColor = vsAvg > 20 ? RED : vsAvg < -20 ? GREEN : LIGHT;
          const pctColor =
            driver.percentOfTotal > 30 ? RED : driver.percentOfTotal > 15 ? AMBER : GREEN;
          const incStr = driver.incidents > 0 ? `${driver.incidents} (!)` : '--';

          return (
            <View
              key={driver.driverEmail}
              style={[
                styles.tableRow,
                { backgroundColor: idx % 2 === 0 ? BG : WHITE },
              ]}
              wrap={false}
            >
              <Text style={[styles.tableCellBold, { flex: 2 }]}>{driver.driverName}</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>{String(driver.tripCount)}</Text>
              <Text style={[styles.tableCell, { flex: 1, color: pctColor, fontFamily: 'Helvetica-Bold' }]}>
                {driver.percentOfTotal}%
              </Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>
                {driver.totalKm.toLocaleString('fr-FR')} km
              </Text>
              <Text style={[styles.tableCell, { flex: 1, color: vsColor, fontFamily: 'Helvetica-Bold' }]}>
                {vsAvgStr}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  { flex: 1, color: driver.incidents > 0 ? RED : MID },
                ]}
              >
                {incStr}
              </Text>
            </View>
          );
        })}

        {/* Section 3: By vehicle */}
        <SectionTitle>3  Détail par véhicule</SectionTitle>
        <TableHeaderRow
          cols={[
            { label: 'Véhicule', flex: 2 },
            { label: 'Emprunts', flex: 1 },
            { label: '% du total', flex: 1 },
            { label: 'Km totaux', flex: 1 },
            { label: 'Conso. moy.', flex: 1 },
          ]}
        />
        {data.byVehicle.map((vehicle, idx) => {
          const pctColor =
            vehicle.percentOfTotal > 30 ? RED : vehicle.percentOfTotal > 15 ? AMBER : GREEN;
          const fuelStr =
            vehicle.avgFuelDelta > 0 ? `-${Math.round(vehicle.avgFuelDelta)}%` : '--';

          return (
            <View
              key={vehicle.vehicleId}
              style={[
                styles.tableRow,
                { backgroundColor: idx % 2 === 0 ? BG : WHITE },
              ]}
              wrap={false}
            >
              <Text style={[styles.tableCellBold, { flex: 2 }]}>{vehicle.vehicleName}</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>{String(vehicle.tripCount)}</Text>
              <Text style={[styles.tableCell, { flex: 1, color: pctColor, fontFamily: 'Helvetica-Bold' }]}>
                {vehicle.percentOfTotal}%
              </Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>
                {vehicle.totalKm.toLocaleString('fr-FR')} km
              </Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>{fuelStr}</Text>
            </View>
          );
        })}

        {/* Section 4: Mission types */}
        <SectionTitle>4  Répartition par type de mission</SectionTitle>
        <TableHeaderRow
          cols={[
            { label: 'Type de mission', flex: 2 },
            { label: 'Nombre', flex: 1 },
            { label: '% du total', flex: 1 },
            { label: 'Barre', flex: 2 },
          ]}
        />
        {data.byMissionType.map((mission, idx) => {
          const pct = totalMissions > 0 ? Math.round((mission.count / totalMissions) * 100) : 0;
          const pctColor = pct > 30 ? RED : pct > 15 ? AMBER : GREEN;

          return (
            <View
              key={mission.missionType}
              style={[
                styles.tableRow,
                { backgroundColor: idx % 2 === 0 ? BG : WHITE },
              ]}
              wrap={false}
            >
              <Text style={[styles.tableCellBold, { flex: 2 }]}>{mission.missionType}</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>{String(mission.count)}</Text>
              <Text style={[styles.tableCell, { flex: 1, color: pctColor, fontFamily: 'Helvetica-Bold' }]}>
                {pct}%
              </Text>
              {/* Progress bar */}
              <View style={{ flex: 2, justifyContent: 'center', paddingHorizontal: 4 }}>
                <View style={{ height: 6, backgroundColor: BORDER }}>
                  {pct > 0 && (
                    <View
                      style={{
                        height: 6,
                        backgroundColor: RED,
                        width: `${pct}%`,
                      }}
                    />
                  )}
                </View>
              </View>
            </View>
          );
        })}

        {/* Section 5: Incidents (only if any) */}
        {incidentRows.length > 0 && (
          <View break>
            <SectionTitle>5  Incidents signalés</SectionTitle>
            <TableHeaderRow
              cols={[
                { label: 'Date', width: 70 },
                { label: 'Chauffeur', flex: 1 },
                { label: 'Véhicule', flex: 1 },
                { label: 'Description', flex: 2 },
              ]}
            />
            {incidentRows.map((row, idx) => (
              <View
                key={idx}
                style={[
                  styles.tableRow,
                  { backgroundColor: idx % 2 === 0 ? BG : WHITE },
                ]}
                wrap={false}
              >
                <Text style={[styles.tableCell, { width: 70 }]}>{fmtDateShort(row.checkOutAt)}</Text>
                <Text style={[styles.tableCellBold, { flex: 1 }]}>{row.driverName}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{row.vehicleName}</Text>
                <Text style={[styles.tableCell, { flex: 2, color: '#DC2626' }]}>
                  {row.incident}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Footer />
      </Page>
    </Document>
  );
}
