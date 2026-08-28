import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { formatIsoDayFr } from '@/lib/utils/date';

const styles = StyleSheet.create({
    page: {
        paddingTop: 24,
        paddingBottom: 24,
        paddingHorizontal: 28,
        fontFamily: 'Helvetica',
        fontSize: 8,
        color: '#000000',
        backgroundColor: '#ffffff',
    },
    // Top Header
    headerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    headerLeft: {
        flexDirection: 'column',
    },
    titleFormulaire: {
        fontSize: 18,
        fontFamily: 'Helvetica-Bold',
        color: '#E30613',
        letterSpacing: 0.5,
    },
    titleFeuille: {
        fontSize: 13,
        fontFamily: 'Helvetica-Bold',
        color: '#5C6B73',
        marginTop: 2,
    },
    headerDate: {
        fontSize: 9.5,
        fontFamily: 'Helvetica-Bold',
        color: '#5C6B73',
        marginTop: 4,
    },
    logoImage: {
        width: 220,
        height: 60,
        objectFit: 'contain',
    },

    // Entity Banners
    entityBanner: {
        backgroundColor: '#E30613',
        color: '#ffffff',
        paddingVertical: 4,
        paddingHorizontal: 8,
        fontSize: 9.5,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 2,
    },
    destinataireBanner: {
        backgroundColor: '#5C6B73',
        color: '#ffffff',
        paddingVertical: 3,
        paddingHorizontal: 8,
        fontSize: 8.5,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 2,
    },
    nrsNote: {
        fontSize: 6.5,
        color: '#333333',
        marginBottom: 8,
        fontFamily: 'Helvetica-Oblique',
    },

    // Section Headers
    sectionHeader: {
        backgroundColor: '#E30613',
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
        marginBottom: 8,
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
        width: '25%',
        paddingHorizontal: 6,
        paddingVertical: 4,
        fontFamily: 'Helvetica-Bold',
        borderRightWidth: 1,
        borderColor: '#000000',
        fontSize: 8,
    },
    tableColValue: {
        width: '75%',
        paddingHorizontal: 6,
        paddingVertical: 4,
        fontSize: 8,
    },

    // Expenses Table Header & Cells
    thCol1: { width: '12%', borderRightWidth: 1, borderColor: '#000000', padding: 3, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
    thCol2: { width: '38%', borderRightWidth: 1, borderColor: '#000000', padding: 3, fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
    thCol3: { width: '22%', borderRightWidth: 1, borderColor: '#000000', padding: 3, fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
    thCol4: { width: '14%', borderRightWidth: 1, borderColor: '#000000', padding: 3, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
    thCol5: { width: '14%', padding: 3, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 7.5 },

    tdCol1: { width: '12%', borderRightWidth: 1, borderColor: '#000000', padding: 4, textAlign: 'center', fontSize: 7.5 },
    tdCol2: { width: '38%', borderRightWidth: 1, borderColor: '#000000', padding: 4, fontSize: 7.5 },
    tdCol3: { width: '22%', borderRightWidth: 1, borderColor: '#000000', padding: 4, fontSize: 7.5 },
    tdCol4: { width: '14%', borderRightWidth: 1, borderColor: '#000000', padding: 4, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
    tdCol5: { width: '14%', padding: 4, textAlign: 'center', fontSize: 7.5 },

    totalLeftCol: {
        width: '72%',
        borderRightWidth: 1,
        borderColor: '#000000',
        padding: 4,
        backgroundColor: '#5C6B73',
        color: '#ffffff',
    },
    totalLeftTitle: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 8.5,
    },
    totalLeftSubtitle: {
        fontSize: 6.5,
        fontFamily: 'Helvetica-Oblique',
        marginTop: 1,
    },
    totalAmountCol: {
        width: '14%',
        borderRightWidth: 1,
        borderColor: '#000000',
        padding: 4,
        textAlign: 'right',
        fontFamily: 'Helvetica-Bold',
        fontSize: 8.5,
        justifyContent: 'center',
    },
    totalImputationCol: {
        width: '14%',
        padding: 4,
        textAlign: 'center',
        fontFamily: 'Helvetica-Bold',
        fontSize: 8,
        justifyContent: 'center',
    },

    // Demande Section
    demandeRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderColor: '#000000',
        minHeight: 20,
        alignItems: 'center',
    },
    demandeColLeft: {
        width: '82%',
        paddingHorizontal: 6,
        paddingVertical: 4,
        borderRightWidth: 1,
        borderColor: '#000000',
        fontSize: 8,
    },
    demandeColRight: {
        width: '18%',
        paddingHorizontal: 6,
        paddingVertical: 4,
        textAlign: 'center',
        fontSize: 8.5,
        fontFamily: 'Helvetica-Bold',
    },

    // Signature Block Box
    sigBox: {
        borderWidth: 1,
        borderColor: '#000000',
        marginBottom: 8,
    },
    sigColumns: {
        flexDirection: 'row',
        minHeight: 90,
        borderBottomWidth: 1,
        borderColor: '#000000',
    },
    sigCol: {
        width: '33.33%',
        padding: 5,
        borderRightWidth: 1,
        borderColor: '#000000',
        flexDirection: 'column',
        justifyContent: 'space-between',
    },
    sigColLast: {
        width: '33.34%',
        padding: 5,
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sigTitle: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 8.5,
        color: '#000000',
        marginBottom: 2,
    },
    sigImageContainer: {
        height: 38,
        justifyContent: 'center',
        alignItems: 'center',
        marginVertical: 2,
    },
    sigImage: {
        maxHeight: 36,
        maxWidth: 110,
        objectFit: 'contain',
    },
    stampImageContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 72,
        flex: 1,
        width: '100%',
    },
    stampImage: {
        maxHeight: 70,
        maxWidth: 165,
        objectFit: 'contain',
    },
    /**
     * Hauteur FIXE du bloc de métadonnées en mode scellement.
     *
     * `sigCol` utilise `justifyContent: 'space-between'` : la position de la zone
     * image dépend donc de la hauteur des métadonnées, laquelle varie selon la
     * présence du hash de signature et de la date de validation. Or les rectangles
     * de `signature-layout.ts` sont des constantes — la zone doit être invariante,
     * sans quoi les widgets seraient décalés et figés par DocMDP.
     */
    sigMetaFixed: {
        marginTop: 2,
        height: 26,
    },
    sigMetaText: {
        fontSize: 6.5,
        color: '#333333',
        lineHeight: 1.2,
    },

    // Stamp Text
    stampContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 50,
    },
    stampTextHeader: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 8.5,
        color: '#E30613',
        textAlign: 'center',
    },
    stampTextUL: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 11,
        color: '#E30613',
        textAlign: 'center',
        marginVertical: 1,
    },
    stampTextFooter: {
        fontSize: 7,
        color: '#E30613',
        textAlign: 'center',
    },

    sigArchiveNote: {
        paddingVertical: 3,
        paddingHorizontal: 6,
        fontSize: 6.5,
        textAlign: 'center',
        fontFamily: 'Helvetica-Bold',
        color: '#333333',
    },

    // Roles Legend Table
    legendTable: {
        borderWidth: 1,
        borderColor: '#000000',
        marginBottom: 6,
    },
    legendHeaderRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderColor: '#000000',
        paddingVertical: 2,
        backgroundColor: '#ffffff',
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
        borderColor: '#000000',
        paddingVertical: 1.5,
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
        marginTop: 4,
    },
    footerText: {
        fontSize: 7.5,
        color: '#E30613',
        fontFamily: 'Helvetica-Bold',
    },
    footerRightContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    footerRedSquare: {
        width: 7,
        height: 7,
        backgroundColor: '#E30613',
        marginLeft: 4,
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
        missionName?: string | null;
        missionDate?: string | null;
        status: string;
        imputation: string;
        customImputation?: string | null;
        requestRefund: boolean;
        noReceiptDeclaration: boolean;
        total: number;
        items: { label: string; amount: number }[];
        ulId: string;
        ulName?: string;
        ulStampImage?: string | null;
        userFunction?: string | null;
        userSignature?: string | ParsedSignature | null;
        validatorName?: string | null;
        validatedAt?: string | null;
        validatorSignature?: string | ParsedSignature | null;
    };
    logoSrc: string; // Base64 PNG logo
    /**
     * Rendu destiné au SCELLEMENT cryptographique.
     *
     * Dans ce mode, les zones d'image de signature des colonnes « Le demandeur »
     * et « Le responsable » sont laissées VIDES : le visuel est fourni par les
     * widgets de signature PDF (`/AP`), posés après coup par `sealing.ts`.
     *
     * Sans ce drapeau, l'image serait rendue DEUX FOIS — une fois dans le contenu
     * par ce composant, une fois par le widget — et le décalage de mise en page
     * ferait retomber le widget sur le bloc de métadonnées situé en dessous.
     *
     * Le bloc de métadonnées (nom, « Signé le … », « ID: … ») reste rendu : les
     * rectangles de `signature-layout.ts` s'arrêtent volontairement au-dessus.
     */
    forSealing?: boolean;
}

export default function ExpensePdfDocument({ report, logoSrc, forSealing = false }: ExpensePdfReportProps) {
    const formattedDate = report.submittedAt
        ? new Date(report.submittedAt).toLocaleDateString('fr-FR')
        : new Date().toLocaleDateString('fr-FR');

    const ulDisplayName = report.ulName || (report.ulId === 'ul-paris-18' ? 'Paris 18' : report.ulId);

    // Date de la mission : distincte de la date de soumission, car la note peut être
    // saisie plusieurs jours après. On retombe sur la date de soumission si elle est absente.
    const missionDateLabel = report.missionDate
        ? formatIsoDayFr(report.missionDate)
        : formattedDate;

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
                    *NRS : Document émis au national, au régional ou par une structure (supprimer les mentions utiles)
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
                    <View style={styles.tableRow}>
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
                                    {item
                                        ? (report.missionName
                                            ? `${missionDateLabel} — ${report.missionName}`
                                            : `Mission du ${formattedDate} — ${item.label}`)
                                        : ''}
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
                                <Text style={{ fontFamily: 'Helvetica-BoldOblique', color: '#000000', marginTop: 3, fontSize: 8 }}>
                                    « Je demande l’abandon du remboursement de ces frais au profit de la CRF »
                                </Text>
                            )}
                        </View>
                        <Text style={styles.demandeColRight}>{!report.requestRefund ? '[ X ]' : '[   ]'}</Text>
                    </View>
                </View>

                {/*
                    Espaceur extensible : absorbe la hauteur restante et épingle le
                    bloc signature au bas de page.

                    ⚠️ INDISPENSABLE au scellement. Sans lui, le bloc remonte quand
                    la note compte peu de postes, alors que les rectangles de
                    `signature-layout.ts` sont des constantes : les widgets se
                    retrouveraient décalés — et figés par DocMDP, donc incorrigibles.
                    Le contenu de la page étant une colonne flex, `flexGrow` suffit :
                    pas de `position: absolute`, qui sortirait le bloc du flux et
                    ferait s'étaler les trois colonnes de signature.
                */}
                <View style={{ flexGrow: 1 }} />

                {/* Signatures & Tampon Block */}
                <View style={styles.sigBox}>
                    <View style={styles.sigColumns}>
                        {/* Col 1: Demandeur */}
                        <View style={styles.sigCol}>
                            <Text style={styles.sigTitle}>Le demandeur :</Text>
                            {forSealing ? (
                                // Zone réservée au widget de signature PDF (rect
                                // `demandeur` de signature-layout.ts). Vide par
                                // construction : le visuel vient du /AP du widget.
                                <View style={styles.sigImageContainer} />
                            ) : parsedUserSig?.image ? (
                                <View style={styles.sigImageContainer}>
                                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                                    <Image src={parsedUserSig.image} style={styles.sigImage} />
                                </View>
                            ) : (
                                <View style={styles.sigImageContainer}>
                                    <Text style={{ fontFamily: 'Helvetica-BoldOblique', color: '#002B49', fontSize: 13 }}>
                                        {report.userName}
                                    </Text>
                                </View>
                            )}
                            {forSealing ? (
                                // Aucune métadonnée en contenu : nom, date et
                                // identifiant figurent déjà dans la signature
                                // cryptographique, lisibles au panneau Signatures.
                                // Les répéter en clair alourdit le document sans
                                // rien prouver — et les fige définitivement.
                                // Le bloc reste rendu, vide, pour réserver la
                                // hauteur : la zone image ne doit pas bouger.
                                <View style={styles.sigMetaFixed} />
                            ) : (
                                <View style={{ marginTop: 2 }}>
                                    <Text style={[styles.sigMetaText, { fontFamily: 'Helvetica-Bold' }]}>
                                        {report.userName}
                                    </Text>
                                    <Text style={styles.sigMetaText}>
                                        Signé le {formattedDate}
                                    </Text>
                                    {parsedUserSig?.hash && (
                                        <Text style={[styles.sigMetaText, { fontSize: 5.5, color: '#666666' }]}>
                                            ID: {parsedUserSig.hash}
                                        </Text>
                                    )}
                                </View>
                            )}
                        </View>

                        {/* Col 2: Responsable */}
                        <View style={styles.sigCol}>
                            <Text style={styles.sigTitle}>Le responsable :</Text>
                            {forSealing ? (
                                // Zone réservée au widget de signature PDF (rect
                                // `valideur`). Vide dès le scellement #1 : le
                                // valideur n'a pas encore signé, et toute mention
                                // « en attente » serait FIGÉE À VIE par DocMDP.
                                <View style={styles.sigImageContainer} />
                            ) : parsedValSig?.image ? (
                                <View style={styles.sigImageContainer}>
                                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                                    <Image src={parsedValSig.image} style={styles.sigImage} />
                                </View>
                            ) : report.validatedAt ? (
                                <View style={styles.sigImageContainer}>
                                    <Text style={{ fontFamily: 'Helvetica-BoldOblique', color: '#002B49', fontSize: 13 }}>
                                        {report.validatorName || 'Président'}
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.sigImageContainer}>
                                    <Text style={{ fontSize: 7, color: '#888888', fontStyle: 'italic' }}>
                                        (En attente de validation)
                                    </Text>
                                </View>
                            )}

                            {forSealing ? (
                                // Toujours rendu, même vide : réserve la hauteur
                                // pour que la zone image ne bouge pas selon que la
                                // note est déjà validée ou non.
                                <View style={styles.sigMetaFixed} />
                            ) : report.validatedAt ? (
                                <View style={{ marginTop: 2 }}>
                                    <Text style={[styles.sigMetaText, { fontFamily: 'Helvetica-Bold' }]}>
                                        {report.validatorName || 'Valideur'}
                                    </Text>
                                    <Text style={styles.sigMetaText}>
                                        Signé le {new Date(report.validatedAt).toLocaleDateString('fr-FR')}
                                    </Text>
                                    {parsedValSig?.hash && (
                                        <Text style={[styles.sigMetaText, { fontSize: 5.5, color: '#666666' }]}>
                                            ID: {parsedValSig.hash}
                                        </Text>
                                    )}
                                </View>
                            ) : null}
                        </View>

                        {/* Col 3: Tampon de la structure */}
                        <View style={styles.sigColLast}>
                            <Text style={[styles.sigTitle, { alignSelf: 'flex-start', width: '100%' }]}>Tampon de la structure :</Text>
                            {report.ulStampImage ? (
                                <View style={styles.stampImageContainer}>
                                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                                    <Image src={report.ulStampImage} style={styles.stampImage} />
                                </View>
                            ) : (
                                <View style={styles.stampContainer}>
                                    <Text style={styles.stampTextHeader}>CROIX-ROUGE FRANÇAISE</Text>
                                    <Text style={styles.stampTextUL}>{ulDisplayName.toUpperCase()}</Text>
                                    <Text style={styles.stampTextFooter}>UNITE LOCALE DE {ulDisplayName.toUpperCase()}</Text>
                                </View>
                            )}
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
                    <View style={styles.footerRightContainer}>
                        <Text style={styles.footerText}>1 | 1</Text>
                        <View style={styles.footerRedSquare} />
                    </View>
                </View>
            </Page>
        </Document>
    );
}
