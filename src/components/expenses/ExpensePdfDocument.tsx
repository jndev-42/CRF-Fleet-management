import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
    page: {
        paddingTop: 20,
        paddingBottom: 30,
        paddingHorizontal: 25,
        fontFamily: 'Helvetica',
        fontSize: 8,
        color: '#1e293b',
        backgroundColor: '#ffffff',
    },
    // Top Header
    headerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    headerLeft: {
        flexDirection: 'column',
    },
    titleFormulaire: {
        fontSize: 16,
        fontFamily: 'Helvetica-Bold',
        color: '#cc0000',
        letterSpacing: 0.5,
    },
    titleFeuille: {
        fontSize: 13,
        fontFamily: 'Helvetica-Bold',
        color: '#64748b',
        marginTop: 2,
    },
    headerDate: {
        fontSize: 9,
        fontFamily: 'Helvetica-Bold',
        color: '#64748b',
        marginTop: 4,
    },
    logoImage: {
        width: 75,
        height: 75,
        objectFit: 'contain',
    },

    // Entity Banners
    entityBanner: {
        backgroundColor: '#cc0000',
        color: '#ffffff',
        paddingVertical: 4,
        paddingHorizontal: 8,
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 2,
    },
    destinataireBanner: {
        backgroundColor: '#64748b',
        color: '#ffffff',
        paddingVertical: 3,
        paddingHorizontal: 8,
        fontSize: 8.5,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 3,
    },
    nrsNote: {
        fontSize: 7,
        color: '#475569',
        marginBottom: 8,
        fontStyle: 'italic',
    },

    // Section Headers
    sectionHeader: {
        backgroundColor: '#cc0000',
        color: '#ffffff',
        paddingVertical: 3.5,
        paddingHorizontal: 8,
        fontSize: 9,
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
    },

    // Table Common
    tableBorder: {
        borderWidth: 1,
        borderColor: '#000000',
        marginBottom: 10,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderColor: '#000000',
        minHeight: 18,
        alignItems: 'center',
    },
    tableRowLast: {
        flexDirection: 'row',
        minHeight: 18,
        alignItems: 'center',
    },
    tableColLabel: {
        width: '30%',
        paddingHorizontal: 6,
        paddingVertical: 4,
        fontFamily: 'Helvetica-Bold',
        borderRightWidth: 1,
        borderColor: '#000000',
        backgroundColor: '#f8fafc',
    },
    tableColValue: {
        width: '70%',
        paddingHorizontal: 6,
        paddingVertical: 4,
    },

    // Expenses Table Header & Cells
    thCol1: { width: '10%', borderRightWidth: 1, borderColor: '#000000', padding: 3, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
    thCol2: { width: '38%', borderRightWidth: 1, borderColor: '#000000', padding: 3, fontFamily: 'Helvetica-Bold' },
    thCol3: { width: '22%', borderRightWidth: 1, borderColor: '#000000', padding: 3, fontFamily: 'Helvetica-Bold' },
    thCol4: { width: '15%', borderRightWidth: 1, borderColor: '#000000', padding: 3, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
    thCol5: { width: '15%', padding: 3, textAlign: 'center', fontFamily: 'Helvetica-Bold' },

    tdCol1: { width: '10%', borderRightWidth: 1, borderColor: '#000000', padding: 4, textAlign: 'center' },
    tdCol2: { width: '38%', borderRightWidth: 1, borderColor: '#000000', padding: 4 },
    tdCol3: { width: '22%', borderRightWidth: 1, borderColor: '#000000', padding: 4 },
    tdCol4: { width: '15%', borderRightWidth: 1, borderColor: '#000000', padding: 4, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
    tdCol5: { width: '15%', padding: 4, textAlign: 'center' },

    totalLeftCol: {
        width: '70%',
        borderRightWidth: 1,
        borderColor: '#000000',
        padding: 5,
        backgroundColor: '#64748b',
        color: '#ffffff',
    },
    totalLeftTitle: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 8.5,
    },
    totalLeftSubtitle: {
        fontSize: 6.5,
        marginTop: 2,
    },
    totalAmountCol: {
        width: '15%',
        borderRightWidth: 1,
        borderColor: '#000000',
        padding: 5,
        textAlign: 'right',
        fontFamily: 'Helvetica-Bold',
        fontSize: 9,
        justifyContent: 'center',
    },
    totalImputationCol: {
        width: '15%',
        padding: 5,
        textAlign: 'center',
        fontFamily: 'Helvetica-Bold',
        fontSize: 8.5,
        justifyContent: 'center',
    },

    // Demande Section
    demandeRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderColor: '#000000',
        minHeight: 22,
        alignItems: 'center',
    },
    demandeColLeft: {
        width: '70%',
        paddingHorizontal: 6,
        paddingVertical: 4,
        borderRightWidth: 1,
        borderColor: '#000000',
    },
    demandeColRight: {
        width: '30%',
        paddingHorizontal: 6,
        paddingVertical: 4,
        textAlign: 'center',
    },

    // Signature Block Box
    sigBox: {
        borderWidth: 1,
        borderColor: '#000000',
        marginBottom: 6,
    },
    sigColumns: {
        flexDirection: 'row',
        minHeight: 110,
        borderBottomWidth: 1,
        borderColor: '#000000',
    },
    sigCol: {
        width: '33.33%',
        padding: 6,
        borderRightWidth: 1,
        borderColor: '#000000',
        flexDirection: 'column',
        justifyContent: 'space-between',
    },
    sigColLast: {
        width: '33.34%',
        padding: 6,
        flexDirection: 'column',
        justifyContent: 'space-between',
    },
    sigTitle: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 8.5,
        color: '#0f172a',
        marginBottom: 4,
    },
    sigImageContainer: {
        height: 45,
        justifyContent: 'center',
        alignItems: 'center',
        marginVertical: 4,
    },
    sigImage: {
        maxHeight: 40,
        maxWidth: 120,
        objectFit: 'contain',
    },
    sigMetaText: {
        fontSize: 6.5,
        color: '#334155',
        lineHeight: 1.2,
    },
    sigBadge: {
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        borderWidth: 0.5,
        borderColor: '#ef4444',
        borderRadius: 3,
        padding: 3,
        marginTop: 3,
    },

    // Stamp Box
    stampContainer: {
        borderWidth: 1.5,
        borderColor: '#cc0000',
        borderStyle: 'dashed',
        borderRadius: 4,
        padding: 6,
        alignItems: 'center',
        justifyContent: 'center',
        height: 65,
        backgroundColor: '#fff5f5',
    },
    stampTextHeader: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 7.5,
        color: '#cc0000',
        textAlign: 'center',
    },
    stampTextUL: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 10,
        color: '#990000',
        textAlign: 'center',
        marginVertical: 2,
    },
    stampTextFooter: {
        fontSize: 6,
        color: '#cc0000',
        textAlign: 'center',
    },

    sigArchiveNote: {
        paddingVertical: 3,
        paddingHorizontal: 6,
        fontSize: 6.5,
        textAlign: 'center',
        fontStyle: 'italic',
        color: '#334155',
    },

    // Roles Legend Table
    legendTable: {
        borderWidth: 1,
        borderColor: '#000000',
        marginTop: 4,
        marginBottom: 8,
    },
    legendHeaderRow: {
        flexDirection: 'row',
        backgroundColor: '#f1f5f9',
        borderBottomWidth: 1,
        borderColor: '#000000',
        paddingVertical: 3,
    },
    legendHeaderCol: {
        width: '50%',
        fontFamily: 'Helvetica-Bold',
        fontSize: 7.5,
        paddingHorizontal: 6,
        borderRightWidth: 1,
        borderColor: '#000000',
    },
    legendHeaderColLast: {
        width: '50%',
        fontFamily: 'Helvetica-Bold',
        fontSize: 7.5,
        paddingHorizontal: 6,
    },
    legendRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.5,
        borderColor: '#94a3b8',
        paddingVertical: 2.5,
    },
    legendColLeft: {
        width: '50%',
        fontSize: 6.5,
        paddingHorizontal: 6,
        borderRightWidth: 1,
        borderColor: '#000000',
    },
    legendColRight: {
        width: '50%',
        fontSize: 6.5,
        paddingHorizontal: 6,
        fontFamily: 'Helvetica-Bold',
    },

    // Page Footer
    footerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 6,
        paddingTop: 4,
        borderTopWidth: 1,
        borderColor: '#cc0000',
    },
    footerText: {
        fontSize: 7,
        color: '#cc0000',
        fontFamily: 'Helvetica-Bold',
    },
    footerRedSquare: {
        width: 8,
        height: 8,
        backgroundColor: '#cc0000',
    },
});

export interface ParsedSignature {
    mode?: 'draw' | 'typed';
    image?: string;
    name?: string;
    date?: string;
    hash?: string;
    userEmail?: string;
    functionTitle?: string;
}

export interface ExpensePdfReportProps {
    report: {
        id: string;
        userName: string;
        userEmail: string;
        submittedAt: string;
        status: string;
        imputation: string;
        customImputation?: string | null;
        requestRefund: boolean;
        noReceiptDeclaration: boolean;
        total: number;
        items: { label: string; amount: number }[];
        ulId: string;
        ulName?: string;
        userFunction?: string | null;
        userSignature?: string | ParsedSignature | null;
        validatorName?: string | null;
        validatedAt?: string | null;
        validatorSignature?: string | ParsedSignature | null;
    };
    logoSrc: string; // Base64 PNG logo
}

export default function ExpensePdfDocument({ report, logoSrc }: ExpensePdfReportProps) {
    const formattedDate = report.submittedAt
        ? new Date(report.submittedAt).toLocaleDateString('fr-FR')
        : new Date().toLocaleDateString('fr-FR');

    const ulDisplayName = report.ulName || (report.ulId === 'ul-paris-18' ? 'Paris 18' : report.ulId);

    // Parse signatures if JSON string
    let parsedUserSig: ParsedSignature | null = null;
    if (report.userSignature) {
        if (typeof report.userSignature === 'string') {
            try {
                parsedUserSig = JSON.parse(report.userSignature);
            } catch {
                parsedUserSig = { name: report.userName };
            }
        } else {
            parsedUserSig = report.userSignature as ParsedSignature;
        }
    }

    let parsedValSig: ParsedSignature | null = null;
    if (report.validatorSignature) {
        if (typeof report.validatorSignature === 'string') {
            try {
                parsedValSig = JSON.parse(report.validatorSignature);
            } catch {
                parsedValSig = { name: report.validatorName || 'Responsable' };
            }
        } else {
            parsedValSig = report.validatorSignature as ParsedSignature;
        }
    }

    const displayedImputation = report.imputation === 'Autre'
        ? (report.customImputation || 'Autre')
        : report.imputation;

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* 1. Top Header */}
                <View style={styles.headerContainer}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.titleFormulaire}>FORMULAIRE</Text>
                        <Text style={styles.titleFeuille}>FEUILLE DE FRAIS</Text>
                        <Text style={styles.headerDate}>DATE : {formattedDate}</Text>
                    </View>
                    {logoSrc ? (
                        /* eslint-disable-next-line jsx-a11y/alt-text */
                        <Image src={logoSrc} style={styles.logoImage} />
                    ) : null}
                </View>

                {/* Entity Banners */}
                <Text style={styles.entityBanner}>
                    {"NOM DE L'ENTITÉ | C2 INTERNE (" + ulDisplayName.toUpperCase() + ")"}
                </Text>
                <Text style={styles.destinataireBanner}>
                    N R S* | DESTINATAIRES :
                </Text>
                <Text style={styles.nrsNote}>
                    *NRS : Document émis au national, au régional ou par une structure (supprimer les mentions inutiles)
                </Text>

                {/* 2. Section JE SOUSSIGNÉ(E) */}
                <Text style={styles.sectionHeader}>JE SOUSSIGNÉ(E)</Text>
                <View style={styles.tableBorder}>
                    <View style={styles.tableRow}>
                        <Text style={styles.tableColLabel}>Prénom/Nom</Text>
                        <Text style={styles.tableColValue}>{report.userName || 'Bénévole'}</Text>
                    </View>
                    <View style={styles.tableRowLast}>
                        <Text style={styles.tableColLabel}>Fonction</Text>
                        <Text style={styles.tableColValue}>
                            {report.userFunction || parsedUserSig?.functionTitle || 'Bénévole local'}
                        </Text>
                    </View>
                </View>

                {/* 3. Section A ENGAGÉ LES FRAIS SUIVANTS : */}
                <Text style={styles.sectionHeader}>A ENGAGÉ LES FRAIS SUIVANTS :</Text>
                <View style={styles.tableBorder}>
                    {/* Header Row */}
                    <View style={[styles.tableRow, { backgroundColor: '#f1f5f9' }]}>
                        <Text style={styles.thCol1}>N° de justificatif</Text>
                        <Text style={styles.thCol2}>Date et objet de la mission</Text>
                        <Text style={styles.thCol3}>Nature des frais</Text>
                        <Text style={styles.thCol4}>Montant des frais</Text>
                        <Text style={styles.thCol5}>Imputation analytique</Text>
                    </View>

                    {/* Expense Items Rows (Fill up to 3 minimum rows to match template layout) */}
                    {Array.from({ length: Math.max(3, report.items.length) }).map((_, idx) => {
                        const item = report.items[idx];
                        const isLast = idx === Math.max(3, report.items.length) - 1;
                        return (
                            <View key={idx} style={isLast ? styles.tableRowLast : styles.tableRow}>
                                <Text style={styles.tdCol1}>{idx + 1}</Text>
                                <Text style={styles.tdCol2}>
                                    {item ? `Mission du ${formattedDate} — ${item.label}` : ''}
                                </Text>
                                <Text style={styles.tdCol3}>
                                    {item ? item.label : ''}
                                </Text>
                                <Text style={styles.tdCol4}>
                                    {item ? `${item.amount.toFixed(2)} €` : ''}
                                </Text>
                                <Text style={styles.tdCol5}>
                                    {item ? displayedImputation : ''}
                                </Text>
                            </View>
                        );
                    })}

                    {/* Total Row */}
                    <View style={[styles.tableRowLast, { borderTopWidth: 1, borderColor: '#000000' }]}>
                        <View style={styles.totalLeftCol}>
                            <Text style={styles.totalLeftTitle}>TOTAL DES FRAIS ENGAGÉS</Text>
                            <Text style={styles.totalLeftSubtitle}>Joindre un justificatif pour chaque dépense engagée</Text>
                        </View>
                        <View style={styles.totalAmountCol}>
                            <Text>{report.total.toFixed(2)} €</Text>
                        </View>
                        <View style={styles.totalImputationCol}>
                            <Text>{displayedImputation}</Text>
                        </View>
                    </View>
                </View>

                {/* 4. Section DEMANDE */}
                <Text style={styles.sectionHeader}>DEMANDE</Text>
                <View style={styles.tableBorder}>
                    <View style={styles.demandeRow}>
                        <Text style={styles.demandeColLeft}>Le remboursement des frais</Text>
                        <Text style={styles.demandeColRight}>{report.requestRefund ? '[ X ]' : '[   ]'}</Text>
                    </View>
                    <View style={styles.tableRowLast}>
                        <View style={styles.demandeColLeft}>
                            <Text style={{ fontSize: 7.5 }}>
                                L’abandon du remboursement des frais, écrire de sa main la mention « Je demande l’abandon du remboursement de ces frais au profit de la CRF » :
                            </Text>
                            {!report.requestRefund && (
                                <Text style={{ fontFamily: 'Helvetica-BoldOblique', color: '#0f172a', marginTop: 3, fontSize: 8 }}>
                                    « Je demande l’abandon du remboursement de ces frais au profit de la CRF »
                                </Text>
                            )}
                        </View>
                        <Text style={styles.demandeColRight}>{!report.requestRefund ? '[ X ]' : '[   ]'}</Text>
                    </View>
                </View>

                {/* Signatures & Tampon Block */}
                <View style={styles.sigBox}>
                    <View style={styles.sigColumns}>
                        {/* Col 1: Demandeur */}
                        <View style={styles.sigCol}>
                            <Text style={styles.sigTitle}>Le demandeur :</Text>
                            {parsedUserSig?.image ? (
                                <View style={styles.sigImageContainer}>
                                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                                    <Image src={parsedUserSig.image} style={styles.sigImage} />
                                </View>
                            ) : (
                                <View style={styles.sigImageContainer}>
                                    <Text style={{ fontFamily: 'Helvetica-Oblique', color: '#64748b', fontSize: 7 }}>
                                        {report.userName}
                                    </Text>
                                </View>
                            )}
                            <View style={styles.sigBadge}>
                                <Text style={styles.sigMetaText}>
                                    <Text style={{ fontFamily: 'Helvetica-Bold' }}>{report.userName}</Text>
                                </Text>
                                <Text style={styles.sigMetaText}>
                                    Signé le {formattedDate} (Yousign)
                                </Text>
                                {parsedUserSig?.hash && (
                                    <Text style={[styles.sigMetaText, { fontSize: 5.5, color: '#64748b' }]}>
                                        ID: {parsedUserSig.hash}
                                    </Text>
                                )}
                            </View>
                        </View>

                        {/* Col 2: Responsable */}
                        <View style={styles.sigCol}>
                            <Text style={styles.sigTitle}>Le responsable :</Text>
                            {parsedValSig?.image ? (
                                <View style={styles.sigImageContainer}>
                                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                                    <Image src={parsedValSig.image} style={styles.sigImage} />
                                </View>
                            ) : report.validatedAt ? (
                                <View style={styles.sigImageContainer}>
                                    <Text style={{ fontFamily: 'Helvetica-Oblique', color: '#64748b', fontSize: 7 }}>
                                        {report.validatorName || 'Responsable'}
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.sigImageContainer}>
                                    <Text style={{ fontSize: 6.5, color: '#94a3b8', fontStyle: 'italic' }}>
                                        (En attente de validation)
                                    </Text>
                                </View>
                            )}

                            {report.validatedAt ? (
                                <View style={styles.sigBadge}>
                                    <Text style={styles.sigMetaText}>
                                        <Text style={{ fontFamily: 'Helvetica-Bold' }}>{report.validatorName || 'Valideur'}</Text>
                                    </Text>
                                    <Text style={styles.sigMetaText}>
                                        Signé le {new Date(report.validatedAt).toLocaleDateString('fr-FR')} (Yousign)
                                    </Text>
                                    {parsedValSig?.hash && (
                                        <Text style={[styles.sigMetaText, { fontSize: 5.5, color: '#64748b' }]}>
                                            ID: {parsedValSig.hash}
                                        </Text>
                                    )}
                                </View>
                            ) : null}
                        </View>

                        {/* Col 3: Tampon de la structure */}
                        <View style={styles.sigColLast}>
                            <Text style={styles.sigTitle}>Tampon de la structure :</Text>
                            <View style={styles.stampContainer}>
                                <Text style={styles.stampTextHeader}>CROIX-ROUGE FRANÇAISE</Text>
                                <Text style={styles.stampTextUL}>{ulDisplayName.toUpperCase()}</Text>
                                <Text style={styles.stampTextFooter}>UNITE LOCALE DE {ulDisplayName.toUpperCase()}</Text>
                            </View>
                        </View>
                    </View>
                    <Text style={styles.sigArchiveNote}>
                        A archiver à la délégation/unité/antenne pendant 10 ans – © Croix-Rouge française – janvier 2022
                    </Text>
                </View>

                {/* 5. Roles Legend Table */}
                <View style={styles.legendTable}>
                    <View style={styles.legendHeaderRow}>
                        <Text style={styles.legendHeaderCol}>Demandeur</Text>
                        <Text style={styles.legendHeaderColLast}>Valideur</Text>
                    </View>
                    <View style={styles.legendRow}>
                        <Text style={styles.legendColLeft}>Bénévole local élu ou non (hors président)</Text>
                        <Text style={styles.legendColRight}>Président local, directeur d’établissement</Text>
                    </View>
                    <View style={styles.legendRow}>
                        <Text style={styles.legendColLeft}>Président local, bénévole territorial élu ou non</Text>
                        <Text style={styles.legendColRight}>Président territorial, directeur d’établissement</Text>
                    </View>
                    <View style={styles.legendRow}>
                        <Text style={styles.legendColLeft}>Président territorial</Text>
                        <Text style={styles.legendColRight}>Bureau de la délégation territoriale</Text>
                    </View>
                    <View style={styles.legendRow}>
                        <Text style={styles.legendColLeft}>Membre bénévole de la région (hors président)</Text>
                        <Text style={styles.legendColRight}>Président délégué régional</Text>
                    </View>
                    <View style={[styles.legendRow, { borderBottomWidth: 0 }]}>
                        <Text style={styles.legendColLeft}>Président délégué régional</Text>
                        <Text style={styles.legendColRight}>Présidence</Text>
                    </View>
                </View>

                {/* 6. Footer */}
                <View style={styles.footerRow}>
                    <Text style={styles.footerText}>FEUILLE DE FRAIS | C2 INTERNE</Text>
                    <Text style={styles.footerText}>1 | 1</Text>
                    <View style={styles.footerRedSquare} />
                </View>
            </Page>
        </Document>
    );
}
