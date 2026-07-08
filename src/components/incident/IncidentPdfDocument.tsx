import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, Svg, Path } from '@react-pdf/renderer';

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



const pdfZones = [
    { id: 'front', label: 'Avant', d: 'M 40 10 L 60 10 L 70 25 L 30 25 Z' },
    { id: 'back', label: 'Arrière', d: 'M 30 85 L 70 85 L 60 100 L 40 100 Z' },
    { id: 'left-front', label: 'Aile AV Gauche', d: 'M 10 25 L 30 25 L 30 40 L 10 40 Z' },
    { id: 'left-middle', label: 'Portes Gauches', d: 'M 10 40 L 30 40 L 30 70 L 10 70 Z' },
    { id: 'left-back', label: 'Aile AR Gauche', d: 'M 10 70 L 30 70 L 30 85 L 10 85 Z' },
    { id: 'right-front', label: 'Aile AV Droite', d: 'M 70 25 L 90 25 L 90 40 L 70 40 Z' },
    { id: 'right-middle', label: 'Portes Droites', d: 'M 70 40 L 90 40 L 90 70 L 70 70 Z' },
    { id: 'right-back', label: 'Aile AR Droite', d: 'M 70 70 L 90 70 L 90 85 L 70 85 Z' },
    { id: 'roof', label: 'Toit / Pare-brise', d: 'M 30 25 L 70 25 L 70 85 L 30 85 Z' },
    { id: 'wheel-left-front', label: 'Roue AV Gauche', d: 'M 5 28 L 15 28 L 15 43 L 5 43 Z' },
    { id: 'wheel-right-front', label: 'Roue AV Droite', d: 'M 85 28 L 95 28 L 95 43 L 85 43 Z' },
    { id: 'wheel-left-back', label: 'Roue AR Gauche', d: 'M 5 72 L 15 72 L 15 87 L 5 87 Z' },
    { id: 'wheel-right-back', label: 'Roue AR Droite', d: 'M 85 72 L 95 72 L 95 87 L 85 87 Z' },
];

function PdfVehicleSVG({ selectedZones, title }: { selectedZones: string[], title: string }) {
    return (
        <View style={{ width: 120, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, marginBottom: 5, fontWeight: 'bold' }}>{title}</Text>
            <Svg viewBox="0 0 100 110" style={{ width: 100, height: 110, backgroundColor: '#f3f4f6' }}>
                {pdfZones.map(zone => {
                    const isSelected = selectedZones.includes(zone.id);
                    return (
                        <Path 
                            key={zone.id} 
                            d={zone.d} 
                            fill={isSelected ? '#EF4444' : '#ffffff'} 
                            stroke={isSelected ? '#B91C1C' : '#d1d5db'}
                            strokeWidth={1}
                        />
                    );
                })}

            </Svg>
        </View>
    );
}

interface FlashDetails {
    interventionNumber?: string;
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

export default function IncidentPdfDocument({ report, logoSrc, generatedAt, photos = [] }: { report: IncidentReport, logoSrc: string, generatedAt: string, photos?: string[] }) {
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
            <View style={styles.col}><Text style={styles.label}>Date / Heure</Text><Text style={styles.value}>{report.occurredAt || 'Non précisée'}</Text></View>
            <View style={styles.col}><Text style={styles.label}>Lieu</Text><Text style={styles.value}>{report.location || 'Non précisé'}</Text></View>
          </View>
        </View>

        {!isAccident && report.flashDetails && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Détails de l&apos;infraction</Text>
            <View style={styles.grid}>
                <View style={styles.col}><Text style={styles.label}>N° d’intervention</Text><Text style={styles.value}>{report.flashDetails.interventionNumber || '—'}</Text></View>
                <View style={styles.col}><Text style={styles.label}>N° Fiche Inter</Text><Text style={styles.value}>{report.flashDetails.ficheInter || '—'}</Text></View>
                <View style={styles.col}><Text style={styles.label}>Hors Samu/BSPP</Text><Text style={styles.value}>{report.flashDetails.horsSamu ? 'Oui' : 'Non'}</Text></View>
            </View>
          </View>
        )}

        {isAccident && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Zones de choc</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-start', gap: 40 }}>
                <PdfVehicleSVG selectedZones={report.accidentDetails?.crfZones || []} title="Véhicule CRF" />
                {report.damages?.thirdParty && (
                    <PdfVehicleSVG selectedZones={report.accidentDetails?.thirdPartyZones || []} title="Véhicule tiers" />
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

        {photos.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Photos de l&apos;incident</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {photos.map((src, index) => (
                <View key={index} style={{ width: '48%', marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' }}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <Image src={src} style={{ width: '100%', height: 180, objectFit: 'contain' }} />
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.footer}>Document généré le {generatedAt} — Application Martine</Text>
      </Page>
    </Document>
  );
}
