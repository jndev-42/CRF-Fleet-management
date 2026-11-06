/**
 * Consignes affichées à l'utilisateur avant de déclarer un incident véhicule.
 */
const linkStyle = { color: 'var(--crf-red)', textDecoration: 'none', fontWeight: 600 } as const;
const bannerLinkStyle = { color: 'inherit', textDecoration: 'underline', fontWeight: 600 } as const;
const sectionTitleStyle = { margin: '16px 0 8px', fontSize: 14, fontWeight: 600 } as const;
const listStyle = { paddingLeft: 20, margin: 0 } as const;
const itemStyle = { marginBottom: 8 } as const;

export default function IncidentGuidelines() {
    return (
        <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-primary)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15, fontWeight: 600 }}>
                Consignes en cas d&apos;incident
            </h3>

            <div
                style={{
                    padding: '12px 14px',
                    background: 'rgba(239, 68, 68, 0.06)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    marginBottom: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--error-text)',
                }}
            >
                ⚠️ En cas de danger ou de blessé, appelez immédiatement le{' '}
                <a href="tel:15" style={bannerLinkStyle}>15 (SAMU)</a>, le{' '}
                <a href="tel:18" style={bannerLinkStyle}>18 (Pompiers)</a>, le{' '}
                <a href="tel:17" style={bannerLinkStyle}>17 (Police / Gendarmerie)</a> ou le{' '}
                <a href="tel:112" style={bannerLinkStyle}>112</a> (numéro d&apos;urgence européen).
            </div>

            <h4 style={sectionTitleStyle}>🚗 Accident ou incident de circulation</h4>
            <ol style={listStyle}>
                <li style={itemStyle}>
                    <strong>Sécurisez la zone</strong> — coupez le moteur, allumez les feux de détresse, enfilez le gilet
                    de sécurité et placez le triangle de présignalisation si vous pouvez le faire sans danger.
                </li>
                <li style={itemStyle}>
                    <strong>Secourez les victimes</strong> — alertez les secours (15, 18 ou 112) et prodiguez les premiers
                    secours dans la limite de votre formation.
                </li>
                <li style={itemStyle}>
                    <strong>Prévenez Onyx</strong>, le cadre de permanence :{' '}
                    <a href="tel:0184832800" style={linkStyle}>01 84 83 28 00</a>.
                </li>
                <li style={itemStyle}>
                    <strong>Remplissez le constat amiable</strong> avec l&apos;autre conducteur, sans reconnaître de
                    responsabilité. Notez l&apos;identité, la plaque et l&apos;assureur de l&apos;autre conducteur, ainsi
                    que les coordonnées des témoins. Si l&apos;autre partie refuse le constat ou prend la fuite, notez sa
                    plaque et appelez la police (<a href="tel:17" style={linkStyle}>17</a>). Le constat doit être
                    transmis à l&apos;assurance sous 5 jours ouvrés.
                </li>
                <li style={itemStyle}>
                    <strong>Photographiez</strong> les dégâts, la position des véhicules, les plaques d&apos;immatriculation
                    et le constat avant tout déplacement des véhicules, sauf si la sécurité l&apos;impose.
                </li>
            </ol>

            <h4 style={sectionTitleStyle}>📸 Flash radar ou infraction</h4>
            <ul style={listStyle}>
                <li style={itemStyle}>
                    L&apos;avis de contravention est envoyé à l&apos;UL, titulaire de la carte grise, qui doit désigner
                    le conducteur dans les 45 jours suivant l&apos;envoi de l&apos;avis.
                </li>
                <li style={itemStyle}>
                    Déclarez le flash dès que possible, avec la date, le lieu et le n° de fiche inter, pour que l&apos;UL
                    puisse identifier qui conduisait.
                </li>
            </ul>

            <h4 style={sectionTitleStyle}>⏱️ Délai de déclaration</h4>
            <p style={{ margin: 0 }}>
                Déclarez l&apos;incident dans cette application <strong>dans les 24 heures</strong> en complétant le
                formulaire qui suit (date, lieu, n° de fiche inter et, pour un accident, les dégâts, les appels passés,
                le constat et les photos).
            </p>
        </div>
    );
}
