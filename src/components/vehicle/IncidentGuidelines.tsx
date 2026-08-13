/**
 * Consignes à afficher à l'utilisateur avant de déclarer un incident.
 * Phase 2 : remplacer le lorem ipsum par le texte définitif.
 */
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
                    marginBottom: 16,
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--error-text)',
                }}
            >
                ⚠️ En cas de danger immédiat, appelez le <strong>15 (SAMU)</strong> ou le <strong>18 (Pompiers)</strong> en priorité.
            </div>

            <p style={{ marginTop: 0 }}>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
                incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
                exercitation ullamco laboris.
            </p>

            <ol style={{ paddingLeft: 20, margin: '0 0 12px 0' }}>
                <li style={{ marginBottom: 8 }}>
                    <strong>Sécurisez la zone</strong> — Baliser le périmètre, couper le moteur, activer les feux de détresse.
                </li>
                <li style={{ marginBottom: 8 }}>
                    <strong>Prenez en charge les victimes</strong> — Prodiguer les premiers secours dans la limite de votre formation.
                </li>
                <li style={{ marginBottom: 8 }}>
                    <strong>Contactez le responsable</strong> — Avertir sans délai votre responsable de mission ou le RESPO de permanence.
                </li>
                <li style={{ marginBottom: 8 }}>
                    <strong>Documentez</strong> — Photos, croquis, relevé des témoins avant déplacement des véhicules.
                </li>
                <li style={{ marginBottom: 0 }}>
                    <strong>Déclarez l&apos;incident</strong> — Remplissez ce formulaire dans les 24 heures.
                </li>
            </ol>

            <p style={{ marginBottom: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nemo enim ipsam voluptatem
                quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni
                dolores eos qui ratione sequi nesciunt.
            </p>
        </div>
    );
}