import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Image,
} from '@react-pdf/renderer';
import type { ExpenseStatsDataResult } from '@/lib/stats-expenses';

const RED = '#E30613';
const WHITE = '#FFFFFF';
const DARK = '#111827';
const MID = '#374151';
const LIGHT = '#6B7280';
const BG = '#F9FAFB';
const BORDER = '#E5E7EB';
const GREEN = '#16A34A';
const AMBER = '#D97706';

export interface ExpenseStatsPdfProps {
  data: ExpenseStatsDataResult;
  ulName: string;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  logoSrc: string;
}

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
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    color: RED,
    marginTop: 14,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: RED,
    paddingBottom: 4,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    width: '23%',
    padding: 10,
    borderRadius: 4,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  kpiLabel: {
    fontSize: 8,
    color: LIGHT,
    marginBottom: 4,
  },
  kpiValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 13,
    color: DARK,
  },
  table: {
    width: '100%',
    marginVertical: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  th: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: MID,
  },
  td: {
    fontSize: 8,
    color: DARK,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: LIGHT,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
});

function formatDateFr(isoStr: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('fr-FR');
}

export default function ExpenseStatsPdfDocument({
  data,
  ulName,
  dateFrom,
  dateTo,
  generatedAt,
  logoSrc,
}: ExpenseStatsPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image does not take an alt prop */}
            <Image src={logoSrc} style={{ width: 36, height: 36 }} />
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.headerTitle}>Croix-Rouge française</Text>
              <Text style={styles.headerSubtitle}>{ulName}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.headerReportTitle}>Rapport Note de Frais</Text>
            <Text style={styles.headerPeriod}>
              Du {formatDateFr(dateFrom)} au {formatDateFr(dateTo)}
            </Text>
            <Text style={styles.headerGenerated}>Généré le {generatedAt}</Text>
          </View>
        </View>

        {/* Global KPIs */}
        <Text style={styles.sectionTitle}>Indicateurs Clés (KPI)</Text>
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total demandé</Text>
            <Text style={styles.kpiValue}>{data.global.totalExpensesAmount.toFixed(2)} €</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total remboursé</Text>
            <Text style={{ ...styles.kpiValue, color: GREEN }}>{data.global.totalRefundedAmount.toFixed(2)} €</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>En attente</Text>
            <Text style={{ ...styles.kpiValue, color: AMBER }}>{data.global.totalPendingAmount.toFixed(2)} €</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Nombre de notes</Text>
            <Text style={styles.kpiValue}>{data.global.reportsCount}</Text>
          </View>
        </View>

        {/* Imputation Breakdown */}
        <Text style={styles.sectionTitle}>Répartition par Imputation / Activité</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: '40%' }]}>Imputation</Text>
            <Text style={[styles.th, { width: '20%', textAlign: 'center' }]}>Notes</Text>
            <Text style={[styles.th, { width: '20%', textAlign: 'right' }]}>Montant (€)</Text>
            <Text style={[styles.th, { width: '20%', textAlign: 'right' }]}>Part (%)</Text>
          </View>
          {data.byImputation.map((imp, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={[styles.td, { width: '40%', fontFamily: 'Helvetica-Bold' }]}>{imp.imputation}</Text>
              <Text style={[styles.td, { width: '20%', textAlign: 'center' }]}>{imp.count}</Text>
              <Text style={[styles.td, { width: '20%', textAlign: 'right' }]}>{imp.amount.toFixed(2)} €</Text>
              <Text style={[styles.td, { width: '20%', textAlign: 'right' }]}>{imp.percentOfTotal} %</Text>
            </View>
          ))}
        </View>

        {/* Volunteer Breakdown */}
        <Text style={styles.sectionTitle}>Dépenses par Bénévole / Demandeur</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: '40%' }]}>Nom du bénévoles</Text>
            <Text style={[styles.th, { width: '20%', textAlign: 'center' }]}>Notes</Text>
            <Text style={[styles.th, { width: '20%', textAlign: 'right' }]}>Total demandé</Text>
            <Text style={[styles.th, { width: '20%', textAlign: 'right' }]}>Total payé</Text>
          </View>
          {data.byUser.map((usr, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={{ width: '40%' }}>
                <Text style={{ ...styles.td, fontFamily: 'Helvetica-Bold' }}>{usr.userName}</Text>
                <Text style={{ fontSize: 7, color: LIGHT }}>{usr.userEmail}</Text>
              </View>
              <Text style={[styles.td, { width: '20%', textAlign: 'center' }]}>{usr.reportCount}</Text>
              <Text style={[styles.td, { width: '20%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                {usr.totalAmount.toFixed(2)} €
              </Text>
              <Text style={[styles.td, { width: '20%', textAlign: 'right', color: GREEN }]}>
                {usr.paidAmount.toFixed(2)} €
              </Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Martine Fleet Management • Croix-Rouge française</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} sur ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
