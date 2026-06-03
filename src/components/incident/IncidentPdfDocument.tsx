import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 20 },
  logo: { width: 60, height: 60 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827' },
  subtitle: { fontSize: 14, color: '#EF4444', marginTop: 4 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', backgroundColor: '#F3F4F6', padding: 6, marginBottom: 10, color: '#374151' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  col: { width: '50%', marginBottom: 8 },
  label: { fontWeight: 'bold', color: '#6B7280', marginBottom: 2 },
  value: { color: '#111827' },
  bullet: { marginBottom: 4 },
  footer: { position: 'absolute', bottom: 40, left: 40, right: 40, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 10, color: '#9CA3AF', fontSize: 8, textAlign: 'center' }
});

interface FlashDetails {
    ficheInter?: string;
    horsSamu?: boolean;
}

interface AccidentDetails {
    crfZones?: string[];
    thirdPartyZones?: string[];
}

interface Damages {
    crf?: boolean;
    thirdParty?: boolean;
    urban?: boolean;
    person?: boolean;
}

interface Victims {
    crf?: boolean;
    thirdParty?: boolean;
    severity?: boolean;
}

interface Actions {
    emergencyCalled?: boolean;
    onyxContacted?: boolean;
    reportMade?: boolean;
}

interface Context {
    vehicleStopped?: boolean;
    motion?: string;
}

interface IncidentReport {
    type?: string;
    vehicleName?: string;
    vehiclePlate?: string;
    userName?: string;
    occurredAt?: string;
    location?: string;
    flashDetails?: FlashDetails;
    accidentDetails?: AccidentDetails;
    damages?: Damages;
    victims?: Victims;
    actions?: Actions;
    context?: Context;
    description?: string;
    retrospection?: string;
}

export default function IncidentPdfDocument({ report, logoSrc, generatedAt }: { report: IncidentReport, logoSrc: string, generatedAt: string }) {
  const isAccident = report.type === 'ACCIDENT';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Rapport d&apos;Incident</Text>
            <Text style={styles.subtitle}>{report.type === 'FLASH' ? '📸 Flash Radar' : '🚗 Accident / Incident'}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image does not support alt prop */}
          <Image src={logoSrc} style={styles.logo} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations Générales</Text>
          <View style={styles.grid}>
            <View style={styles.col}><Text style={styles.label}>Véhicule</Text><Text style={styles.value}>{report.vehicleName} ({report.vehiclePlate})</Text></View>
            <View style={styles.col}><Text style={styles.label}>Déclarant</Text><Text style={styles.value}>{report.userName}</Text></View>
            <View style={styles.col}><Text style={styles.label}>Date / Heure</Text><Text style={styles.value}>{report.occurredAt || 'Non précisée'}</Text></View>
            <View style={styles.col}><Text style={styles.label}>Lieu</Text><Text style={styles.value}>{report.location || 'Non précisé'}</Text></View>
          </View>
        </View>

        {!isAccident && report.flashDetails && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Détails de l&apos;infraction</Text>
            <View style={styles.grid}>
                <View style={styles.col}><Text style={styles.label}>N° Fiche Inter</Text><Text style={styles.value}>{report.flashDetails.ficheInter || '—'}</Text></View>
                <View style={styles.col}><Text style={styles.label}>Hors Samu/BSPP</Text><Text style={styles.value}>{report.flashDetails.horsSamu ? 'Oui' : 'Non'}</Text></View>
            </View>
          </View>
        )}

        {isAccident && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Zones de choc</Text>
              <View style={styles.grid}>
                <View style={styles.col}>
                    <Text style={styles.label}>Véhicule CRF</Text>
                    <Text style={styles.value}>{report.accidentDetails?.crfZones?.join(', ') || 'Aucune'}</Text>
                </View>
                {report.damages?.thirdParty && (
                    <View style={styles.col}>
                        <Text style={styles.label}>Véhicule tiers</Text>
                        <Text style={styles.value}>{report.accidentDetails?.thirdPartyZones?.join(', ') || 'Aucune'}</Text>
                    </View>
                )}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Dégâts et Victimes</Text>
              <View style={styles.grid}>
                <View style={styles.col}>
                    <Text style={styles.label}>Dégâts matériels</Text>
                    {report.damages?.crf && <Text style={styles.value}>• Véhicule CRF</Text>}
                    {report.damages?.thirdParty && <Text style={styles.value}>• Véhicule tiers</Text>}
                    {report.damages?.urban && <Text style={styles.value}>• Mobilier urbain</Text>}
                    {report.damages?.person && <Text style={styles.value}>• Personne</Text>}
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Victimes</Text>
                    {report.victims?.crf && <Text style={styles.value}>• Victime CRF {report.victims.severity ? '(Grave)' : '(Léger)'}</Text>}
                    {report.victims?.thirdParty && <Text style={styles.value}>• Victime Tiers {report.victims.severity ? '(Grave)' : '(Léger)'}</Text>}
                    {!report.victims?.crf && !report.victims?.thirdParty && <Text style={styles.value}>Aucune victime signalée</Text>}
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Contexte et Actions</Text>
              <View style={styles.grid}>
                <View style={styles.col}>
                    <Text style={styles.label}>État du véhicule</Text>
                    <Text style={styles.value}>{report.context?.vehicleStopped ? 'À l\'arrêt / Stationné' : 'En mouvement'}</Text>
                    {!report.context?.vehicleStopped && report.context?.motion && (
                        <Text style={styles.value}>Direction : {report.context.motion === 'forward' ? 'Marche avant' : 'Marche arrière'}</Text>
                    )}
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Actions effectuées</Text>
                    <Text style={styles.value}>Appel 15/18/17 : {report.actions?.emergencyCalled ? 'Oui' : 'Non'}</Text>
                    <Text style={styles.value}>Contact Onyx : {report.actions?.onyxContacted ? 'Oui' : 'Non'}</Text>
                    <Text style={styles.value}>Constat amiable : {report.actions?.reportMade ? 'Oui' : 'Non'}</Text>
                </View>
              </View>
            </View>
          </>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description détaillée</Text>
          <Text style={styles.value}>{report.description || 'Aucune description fournie.'}</Text>
        </View>

        {report.retrospection && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Rétrospection (Comment éviter cet incident ?)</Text>
            <Text style={styles.value}>{report.retrospection}</Text>
          </View>
        )}

        <Text style={styles.footer}>Document généré le {generatedAt} — Application Martine</Text>
      </Page>
    </Document>
  );
}
