import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { formatIsoDayFr } from '@/lib/utils/date';
import { MEASURE_ZONE_COLORS } from '@/lib/expenses/signature-layout';

/**
 * Modèle « Feuille de frais » — septembre 2023.
 *
 * Reproduit le formulaire officiel fourni par la Croix-Rouge française :
 * marges de 72 pt, bandeaux de section bleu clair, ligne de total lavande,
 * blocs de signature sans encadré, logo en pied de page.
 *
 * ⚠️ TOUTE MODIFICATION DE MISE EN PAGE DÉPLACE LES SIGNATURES. Les rectangles
 * de `signature-layout.ts` sont MESURÉS sur ce rendu ; ils doivent être repris
 * (`scripts/measure-signature-rects.ts`) après tout changement de géométrie,
 * sous peine de widgets décalés — et figés par DocMDP, donc incorrigibles.
 */

/** Bleu des bandeaux de section et du titre. */
const BLEU = '#6ebeeb';
/** Ardoise des sous-titres d'en-tête. */
const ARDOISE = '#667385';
/** Lavande de la ligne « TOTAL DES FRAIS ENGAGÉS ». */
const LAVANDE = '#c8beff';
const NOIR = '#000000';

/**
 * Largeurs des colonnes du tableau des frais, en pourcentage de la zone de
 * contenu — relevées sur le modèle officiel (450,8 pt de large).
 */
const COL = ['17.3%', '19.3%', '23.6%', '19.1%', '20.7%'] as const;

const styles = StyleSheet.create({
    page: {
        paddingTop: 24,
        paddingBottom: 18,
        paddingHorizontal: 72,
        fontFamily: 'Helvetica',
        fontSize: 8,
        color: NOIR,
        backgroundColor: '#ffffff',
    },

    // ── En-tête ──────────────────────────────────────────────────────────────
    titreFormulaire: {
        fontSize: 20,
        fontFamily: 'Helvetica-Bold',
        color: BLEU,
    },
    titreFeuille: {
        fontSize: 14,
        fontFamily: 'Helvetica-Bold',
        color: ARDOISE,
        marginTop: 1,
    },
    enteteDate: {
        fontSize: 9,
        fontFamily: 'Helvetica-Bold',
        color: ARDOISE,
        marginTop: 2,
        marginBottom: 16,
    },

    // ── Bandeaux de section ──────────────────────────────────────────────────
    bandeau: {
        backgroundColor: BLEU,
        color: '#ffffff',
        paddingVertical: 5,
        paddingHorizontal: 8,
        fontSize: 9,
        fontFamily: 'Helvetica-Bold',
    },

    // ── Tableaux ─────────────────────────────────────────────────────────────
    tableau: {
        borderWidth: 1,
        borderColor: NOIR,
        marginBottom: 10,
    },
    ligne: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderColor: NOIR,
        minHeight: 19,
        alignItems: 'stretch',
    },
    ligneDerniere: {
        flexDirection: 'row',
        minHeight: 19,
        alignItems: 'stretch',
    },

    // Section « Je soussigné(e) » : libellé à gauche, valeur à droite.
    celluleLibelle: {
        width: '49.3%',
        paddingHorizontal: 6,
        paddingVertical: 5,
        borderRightWidth: 1,
        borderColor: NOIR,
        fontSize: 8.5,
    },
    celluleValeur: {
        width: '50.7%',
        paddingHorizontal: 6,
        paddingVertical: 5,
        fontSize: 8.5,
    },

    // Tableau des frais.
    thCol1: { width: COL[0], borderRightWidth: 1, borderColor: NOIR, padding: 4, fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
    thCol2: { width: COL[1], borderRightWidth: 1, borderColor: NOIR, padding: 4, fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
    thCol3: { width: COL[2], borderRightWidth: 1, borderColor: NOIR, padding: 4, fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
    thCol4: { width: COL[3], borderRightWidth: 1, borderColor: NOIR, padding: 4, fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
    thCol5: { width: COL[4], padding: 4, fontFamily: 'Helvetica-Bold', fontSize: 7.5 },

    tdCol1: { width: COL[0], borderRightWidth: 1, borderColor: NOIR, padding: 4, fontSize: 7.5 },
    tdCol2: { width: COL[1], borderRightWidth: 1, borderColor: NOIR, padding: 4, fontSize: 7.5 },
    tdCol3: { width: COL[2], borderRightWidth: 1, borderColor: NOIR, padding: 4, fontSize: 7.5 },
    tdCol4: { width: COL[3], borderRightWidth: 1, borderColor: NOIR, padding: 4, textAlign: 'right', fontSize: 7.5 },
    tdCol5: { width: COL[4], padding: 4, fontSize: 7.5 },

    // Ligne de total : lavande sur les trois premières colonnes, blanche ensuite.
    totalLibelle: {
        width: '60.2%',
        borderRightWidth: 1,
        borderColor: NOIR,
        backgroundColor: LAVANDE,
        paddingHorizontal: 6,
        paddingVertical: 6,
        justifyContent: 'center',
    },
    totalTitre: { fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
    totalSousTitre: { fontFamily: 'Helvetica-Bold', fontSize: 6.5, marginTop: 1 },
    totalMontant: {
        width: COL[3],
        borderRightWidth: 1,
        borderColor: NOIR,
        padding: 6,
        textAlign: 'right',
        fontFamily: 'Helvetica-Bold',
        fontSize: 8.5,
        justifyContent: 'center',
    },
    totalImputation: {
        width: COL[4],
        padding: 6,
        fontFamily: 'Helvetica-Bold',
        fontSize: 8,
        justifyContent: 'center',
    },

    // Section « Demande ».
    demandeGauche: {
        width: '50.4%',
        paddingHorizontal: 6,
        paddingVertical: 5,
        borderRightWidth: 1,
        borderColor: NOIR,
        fontSize: 8,
    },
    demandeDroite: {
        width: '49.6%',
        paddingHorizontal: 6,
        paddingVertical: 5,
        textAlign: 'center',
        fontSize: 8.5,
        fontFamily: 'Helvetica-Bold',
        justifyContent: 'center',
    },

    // ── Signatures ───────────────────────────────────────────────────────────
    // Le modèle officiel ne les encadre pas : trois libellés alignés, la zone de
    // tracé se trouvant en dessous.
    signatures: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    colonneSignature: {
        width: '33.33%',
        paddingLeft: 14,
    },
    titreSignature: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 9,
        marginBottom: 4,
    },
    /**
     * Hauteur FIXE de la zone de tracé.
     *
     * Elle borne le rectangle du widget de signature : toute variation
     * déplacerait les tracés, que DocMDP fige ensuite définitivement.
     */
    zoneTrace: {
        height: 44,
        justifyContent: 'center',
    },
    traceImage: { maxHeight: 42, maxWidth: 118, objectFit: 'contain' },
    tamponImage: { maxHeight: 62, maxWidth: 130, objectFit: 'contain' },
    zoneTampon: { height: 66, justifyContent: 'center' },
    /**
     * Hauteur FIXE du bloc de métadonnées en mode scellement — même raison :
     * la zone de tracé ne doit pas se déplacer selon la présence du hash ou de
     * la date de validation.
     */
    metaFixe: { marginTop: 2, height: 24 },
    metaTexte: { fontSize: 6.5, color: '#333333', lineHeight: 1.2 },
    tamponTexte: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#E30613', textAlign: 'center' },
    tamponTexteUL: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: '#E30613', textAlign: 'center' },

    noteArchivage: {
        fontSize: 7,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 8,
    },

    // ── Tableau des rôles ────────────────────────────────────────────────────
    roles: {
        borderWidth: 1,
        borderColor: NOIR,
    },
    rolesLigne: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderColor: NOIR,
    },
    rolesLigneDerniere: { flexDirection: 'row', minHeight: 26 },
    rolesGauche: {
        width: '50%',
        fontSize: 6.5,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRightWidth: 1,
        borderColor: NOIR,
    },
    rolesDroite: { width: '50%', fontSize: 6.5, paddingHorizontal: 6, paddingVertical: 3 },
    rolesEntete: { fontSize: 7.5 },

    // ── Pied de page ─────────────────────────────────────────────────────────
    /**
     * Pied de page à hauteur FIXE.
     *
     * ⚠️ TOUJOURS RENDU, logo ou non. `loadLogo()` renvoie une chaîne vide quand
     * l'image est absente ou illisible ; un pied conditionnel ferait alors
     * remonter tout le bloc signature de sa hauteur, et les rectangles de
     * `signature-layout.ts` — des constantes — désigneraient le vide. Le tracé
     * se retrouverait décalé, puis figé par DocMDP.
     */
    pied: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginTop: 8,
        height: 30,
    },
    logo: { width: 110, height: 30, objectFit: 'contain' },
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
    /**
     * Peint les zones de signature d'un aplat de couleur, pour que
     * `scripts/measure-signature-rects.ts` puisse relever leurs coordonnées dans
     * le flux de contenu du PDF.
     *
     * ⚠️ RÉSERVÉ À LA MESURE. Ce n'est pas un mode de rendu : jamais activé en
     * production. Il existe pour que les constantes de `signature-layout.ts`
     * soient MESURÉES et non devinées — un rectangle faux place le widget de
     * travers, et DocMDP le fige définitivement.
     */
    measureZones?: boolean;
}

export default function ExpensePdfDocument({
    report, logoSrc, forSealing = false, measureZones = false,
}: ExpensePdfReportProps) {
    /**
     * Aplat de repérage, à partir des composantes `scn` attendues par le script
     * de mesure — même source de vérité des deux côtés.
     */
    const reperage = (scn: string) => {
        const [r, v, b] = scn.split(' ').map(n => Math.round(Number(n) * 255));
        return { backgroundColor: measureZones ? `rgb(${r}, ${v}, ${b})` : undefined };
    };
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
                {/* En-tête */}
                <Text style={styles.titreFormulaire}>FORMULAIRE</Text>
                <Text style={styles.titreFeuille}>FEUILLE DE FRAIS</Text>
                <Text style={styles.enteteDate}>DATE : {formattedDate}</Text>

                {/* Je soussigné(e) */}
                <Text style={styles.bandeau}>JE SOUSSIGNÉ(E)</Text>
                <View style={styles.tableau}>
                    <View style={styles.ligne}>
                        <Text style={styles.celluleLibelle}>Prénom/Nom</Text>
                        <Text style={styles.celluleValeur}>{report.userName || 'Bénévole'}</Text>
                    </View>
                    <View style={styles.ligneDerniere}>
                        <Text style={styles.celluleLibelle}>Fonction</Text>
                        <Text style={styles.celluleValeur}>
                            {report.userFunction || parsedUserSig?.functionTitle || 'Bénévole local'}
                        </Text>
                    </View>
                </View>

                {/* Frais engagés */}
                <Text style={styles.bandeau}>A ENGAGÉ LES FRAIS SUIVANTS :</Text>
                <View style={styles.tableau}>
                    <View style={styles.ligne}>
                        <Text style={styles.thCol1}>N° de justificatif</Text>
                        <Text style={styles.thCol2}>Date et objet de la mission</Text>
                        <Text style={styles.thCol3}>Nature des frais</Text>
                        <Text style={styles.thCol4}>Montant des frais</Text>
                        <Text style={styles.thCol5}>Imputation analytique</Text>
                    </View>

                    {/* Le modèle officiel comporte trois lignes : on ne descend pas
                        en dessous, même pour une note d'un seul poste. */}
                    {Array.from({ length: Math.max(3, report.items.length) }).map((_, idx) => {
                        const item = report.items[idx];
                        return (
                            <View key={idx} style={styles.ligne}>
                                <Text style={styles.tdCol1}>{idx + 1}</Text>
                                <Text style={styles.tdCol2}>
                                    {item
                                        ? (report.missionName
                                            ? `${missionDateLabel} — ${report.missionName}`
                                            : `Mission du ${formattedDate} — ${item.label}`)
                                        : ''}
                                </Text>
                                <Text style={styles.tdCol3}>{item ? item.label : ''}</Text>
                                <Text style={styles.tdCol4}>{item ? `${item.amount.toFixed(2)} €` : ''}</Text>
                                <Text style={styles.tdCol5}>{item ? displayedImputation : ''}</Text>
                            </View>
                        );
                    })}

                    <View style={styles.ligneDerniere}>
                        <View style={styles.totalLibelle}>
                            <Text style={styles.totalTitre}>TOTAL DES FRAIS ENGAGÉS</Text>
                            <Text style={styles.totalSousTitre}>Joindre un justificatif pour chaque dépense engagée</Text>
                        </View>
                        <View style={styles.totalMontant}>
                            <Text>{report.total.toFixed(2)} €</Text>
                        </View>
                        <View style={styles.totalImputation}>
                            <Text>{displayedImputation}</Text>
                        </View>
                    </View>
                </View>

                {/* Demande */}
                <Text style={styles.bandeau}>DEMANDE</Text>
                <View style={styles.tableau}>
                    <View style={styles.ligne}>
                        <Text style={styles.demandeGauche}>Le remboursement des frais</Text>
                        <Text style={styles.demandeDroite}>{report.requestRefund ? '[ X ]' : '[   ]'}</Text>
                    </View>
                    <View style={styles.ligneDerniere}>
                        <View style={styles.demandeGauche}>
                            <Text>
                                L’abandon du remboursement des frais, écrire de sa main la mention « Je demande l’abandon du remboursement de ces frais au profit de la CRF » :
                            </Text>
                            {!report.requestRefund && (
                                <Text style={{ fontFamily: 'Helvetica-BoldOblique', marginTop: 3, fontSize: 8 }}>
                                    « Je demande l’abandon du remboursement de ces frais au profit de la CRF »
                                </Text>
                            )}
                        </View>
                        <Text style={styles.demandeDroite}>{!report.requestRefund ? '[ X ]' : '[   ]'}</Text>
                    </View>
                </View>

                {/*
                    Espaceur extensible : absorbe la hauteur restante et épingle le
                    bloc signature au bas de page.

                    ⚠️ INDISPENSABLE au scellement. Sans lui, le bloc remonte quand
                    la note compte peu de postes, alors que les rectangles de
                    `signature-layout.ts` sont des constantes : les widgets se
                    retrouveraient décalés — et figés par DocMDP, donc incorrigibles.
                */}
                <View style={{ flexGrow: 1 }} />

                {/* Signatures — sans encadré, conformément au modèle officiel */}
                <View style={styles.signatures}>
                    <View style={styles.colonneSignature}>
                        <Text style={styles.titreSignature}>Le demandeur :</Text>
                        {forSealing ? (
                            // Zone réservée au widget de signature PDF (rect
                            // `demandeur`). Vide par construction : le visuel vient
                            // du /AP du widget.
                            <View style={[styles.zoneTrace, reperage(MEASURE_ZONE_COLORS.demandeur)]} />
                        ) : parsedUserSig?.image ? (
                            <View style={styles.zoneTrace}>
                                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                                <Image src={parsedUserSig.image} style={styles.traceImage} />
                            </View>
                        ) : (
                            <View style={styles.zoneTrace}>
                                <Text style={{ fontFamily: 'Helvetica-BoldOblique', color: '#002B49', fontSize: 13 }}>
                                    {report.userName}
                                </Text>
                            </View>
                        )}
                        {forSealing ? (
                            // Aucune métadonnée en contenu : nom, date et identifiant
                            // figurent dans la signature cryptographique, lisibles au
                            // panneau Signatures. Le bloc reste rendu, vide, pour
                            // réserver la hauteur.
                            <View style={styles.metaFixe} />
                        ) : (
                            <View style={{ marginTop: 2 }}>
                                <Text style={[styles.metaTexte, { fontFamily: 'Helvetica-Bold' }]}>{report.userName}</Text>
                                <Text style={styles.metaTexte}>Signé le {formattedDate}</Text>
                                {parsedUserSig?.hash && (
                                    <Text style={[styles.metaTexte, { fontSize: 5.5, color: '#666666' }]}>
                                        ID: {parsedUserSig.hash}
                                    </Text>
                                )}
                            </View>
                        )}
                    </View>

                    <View style={styles.colonneSignature}>
                        <Text style={styles.titreSignature}>Le responsable :</Text>
                        {forSealing ? (
                            // Vide dès le scellement #1 : le valideur n'a pas encore
                            // signé, et toute mention « en attente » serait FIGÉE À
                            // VIE par DocMDP.
                            <View style={[styles.zoneTrace, reperage(MEASURE_ZONE_COLORS.valideur)]} />
                        ) : parsedValSig?.image ? (
                            <View style={styles.zoneTrace}>
                                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                                <Image src={parsedValSig.image} style={styles.traceImage} />
                            </View>
                        ) : report.validatedAt ? (
                            <View style={styles.zoneTrace}>
                                <Text style={{ fontFamily: 'Helvetica-BoldOblique', color: '#002B49', fontSize: 13 }}>
                                    {report.validatorName || 'Président'}
                                </Text>
                            </View>
                        ) : (
                            <View style={styles.zoneTrace}>
                                <Text style={{ fontSize: 7, color: '#888888' }}>(En attente de validation)</Text>
                            </View>
                        )}
                        {forSealing ? (
                            <View style={styles.metaFixe} />
                        ) : report.validatedAt ? (
                            <View style={{ marginTop: 2 }}>
                                <Text style={[styles.metaTexte, { fontFamily: 'Helvetica-Bold' }]}>
                                    {report.validatorName || 'Valideur'}
                                </Text>
                                <Text style={styles.metaTexte}>
                                    Signé le {new Date(report.validatedAt).toLocaleDateString('fr-FR')}
                                </Text>
                                {parsedValSig?.hash && (
                                    <Text style={[styles.metaTexte, { fontSize: 5.5, color: '#666666' }]}>
                                        ID: {parsedValSig.hash}
                                    </Text>
                                )}
                            </View>
                        ) : (
                            <View style={styles.metaFixe} />
                        )}
                    </View>

                    <View style={styles.colonneSignature}>
                        <Text style={styles.titreSignature}>Tampon de la structure :</Text>
                        {report.ulStampImage ? (
                            <View style={styles.zoneTampon}>
                                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                                <Image src={report.ulStampImage} style={styles.tamponImage} />
                            </View>
                        ) : (
                            <View style={styles.zoneTampon}>
                                <Text style={styles.tamponTexte}>CROIX-ROUGE FRANÇAISE</Text>
                                <Text style={styles.tamponTexteUL}>{ulDisplayName.toUpperCase()}</Text>
                                <Text style={[styles.tamponTexte, { fontSize: 7 }]}>
                                    UNITE LOCALE DE {ulDisplayName.toUpperCase()}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                <Text style={styles.noteArchivage}>
                    A archiver à la délégation/unité/antenne pendant 10 ans – © Croix-Rouge française – septembre 2023
                </Text>

                {/* Tableau des rôles */}
                <View style={styles.roles}>
                    <View style={styles.rolesLigne}>
                        <Text style={[styles.rolesGauche, styles.rolesEntete]}>Demandeur</Text>
                        <Text style={[styles.rolesDroite, styles.rolesEntete]}>Valideur</Text>
                    </View>
                    {([
                        ['Bénévole local élu ou non (hors président)', 'Président local, directeur d’établissement'],
                        ['Président local, bénévole territorial élu ou non', 'Président territorial, directeur d’établissement'],
                        ['Président territorial', 'Bureau de la délégation territoriale'],
                        ['Membre bénévole de la région (hors président)', 'Président délégué régional'],
                    ] as const).map(([gauche, droite]) => (
                        <View key={gauche} style={styles.rolesLigne}>
                            <Text style={styles.rolesGauche}>{gauche}</Text>
                            <Text style={styles.rolesDroite}>{droite}</Text>
                        </View>
                    ))}
                    <View style={styles.rolesLigneDerniere}>
                        <Text style={styles.rolesGauche}>Président délégué régional</Text>
                        <Text style={styles.rolesDroite}>Présidence</Text>
                    </View>
                </View>

                {/* Logo en pied de page, comme sur le modèle officiel. Le bloc est
                    rendu même sans logo : sa hauteur doit rester constante. */}
                <View style={styles.pied}>
                    {logoSrc ? (
                        /* eslint-disable-next-line jsx-a11y/alt-text */
                        <Image src={logoSrc} style={styles.logo} />
                    ) : null}
                </View>
            </Page>
        </Document>
    );
}
