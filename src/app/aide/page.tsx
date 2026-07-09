'use client';

import { useRouter } from 'next/navigation';
import { useDemoMode } from '@/lib/contexts/DemoContext';
import { useEffect, useState } from 'react';

interface PhoneNum {
    label: string;
    number: string;
}

interface UL {
    id: string;
    name: string;
    slug: string;
    phoneNumbers: PhoneNum[];
}

export default function AidePage() {
    const router = useRouter();
    const { isDemoMode, toggleDemoMode } = useDemoMode();
    const [uls, setUls] = useState<UL[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/ul')
            .then(res => res.ok ? res.json() : { uls: [] })
            .then(data => {
                setUls(data.uls || []);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    function handleRestartTour() {
        localStorage.removeItem('tour-completed');
        router.push('/');
        // Small delay to let navigation happen before dispatching the event
        setTimeout(() => {
            window.dispatchEvent(new Event('restart-tour'));
        }, 500);
    }

    return (
        <div className="page-container" style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <div>
                    <h1 className="page-title">Aide & Contacts</h1>
                    <p className="page-description">Informations utiles et numéros d&apos;urgence</p>
                </div>
                <a
                    href="/api/vcard"
                    download="Annuaire_CRF_Paris.vcf"
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <span style={{ fontSize: '18px' }}>📞</span> Enregistrer les contacts (VCard)
                </a>
            </div>

            {/* Restart Tour */}
            <div className="detail-card" style={{ marginBottom: 24, padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h2 className="section-title" style={{ fontSize: 16, marginBottom: 4 }}>🎓 Tutoriel interactif</h2>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Découvrez comment utiliser l&apos;application pas à pas.</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handleRestartTour}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <span style={{ fontSize: '16px' }}>🚀</span> Lancer le tutoriel
                </button>
            </div>

            {/* Mode Démo */}
            <div className="detail-card" style={{ marginBottom: 24, padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, border: isDemoMode ? '1px solid #ff9800' : '1px solid var(--border-primary)' }}>
                <div>
                    <h2 className="section-title" style={{ fontSize: 16, marginBottom: 4 }}>🛠️ Mode Démo</h2>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                        {isDemoMode 
                            ? "Vous êtes actuellement en mode démo. Les données sont fictives." 
                            : "Testez l'application librement sans impacter les données réelles."}
                    </p>
                </div>
                <button
                    className={isDemoMode ? "btn btn-secondary" : "btn btn-primary"}
                    onClick={toggleDemoMode}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', background: isDemoMode ? 'transparent' : '#ff9800', borderColor: '#ff9800', color: isDemoMode ? '#ff9800' : '#000' }}
                >
                    <span style={{ fontSize: '16px' }}>{isDemoMode ? '🚫' : '🧪'}</span> {isDemoMode ? 'Quitter le mode démo' : 'Activer le mode démo'}
                </button>
            </div>

            <div className="detail-card" style={{ marginBottom: 24, padding: '20px' }}>
                <h2 className="section-title" style={{ marginBottom: 16, borderBottom: '1px solid var(--border-primary)', paddingBottom: 8 }}>
                    🚗 Véhicules : Assurance & Assistance
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                    <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                        <h3 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>🛡️</span> ASSURANCE
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div><strong style={{ color: 'var(--text-secondary)' }}>Assureur :</strong> AXA XL INSURANCE</div>
                            <div><strong style={{ color: 'var(--text-secondary)' }}>Police N° :</strong> FR00045796MO</div>
                        </div>
                    </div>

                    <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                        <h3 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>🆘</span> ASSISTANCE
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div><strong style={{ color: 'var(--text-secondary)' }}>Assureur :</strong> AXA ASSISTANCE</div>
                            <div><strong style={{ color: 'var(--text-secondary)' }}>Convention N° :</strong> 5004993</div>
                            <div style={{ marginTop: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 18 }}>🇫🇷</span>
                                    <span><strong>France :</strong> <a href="tel:0155921358" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 55 92 13 58</a></span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                    <span style={{ fontSize: 18 }}>🌍</span>
                                    <span><strong>Étranger :</strong> <a href="tel:+33155921358" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>+33 1 55 92 13 58</a></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="detail-card" style={{ marginBottom: 24, padding: '20px' }}>
                <h2 className="section-title" style={{ marginBottom: 16, borderBottom: '1px solid var(--border-primary)', paddingBottom: 8 }}>
                    📍 Contacts Opérationnels & Situations
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>

                    {/* ULs dynamiques */}
                    {loading ? (
                        <div>
                            <h3 style={{ fontSize: 15, marginBottom: 12, color: 'var(--text-secondary)' }}>Chargement...</h3>
                            <div className="loading-spinner" style={{ width: 20, height: 20 }} />
                        </div>
                    ) : (
                        uls.map(ul => (
                            <div key={ul.id}>
                                <h3 style={{ fontSize: 15, marginBottom: 12, color: 'var(--text-secondary)' }}>{ul.name} (UL)</h3>
                                {ul.phoneNumbers.length === 0 ? (
                                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>Aucun numéro configuré</p>
                                ) : (
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {ul.phoneNumbers.map((phone, idx) => (
                                            <li key={idx}>
                                                <strong>{phone.label} :</strong>{' '}
                                                <a href={`tel:${phone.number.replace(/[^\d+]/g, '')}`} style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>
                                                    {phone.number}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))
                    )}

                    {/* Direction 75 */}
                    <div>
                        <h3 style={{ fontSize: 15, marginBottom: 12, color: 'var(--text-secondary)' }}>Direction 75</h3>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <li><strong>Onyx (Cadre) :</strong> <a href="tel:0184832800" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 28 00</a></li>
                            <li><strong>Vigie (Dir) :</strong> <a href="tel:0184832900" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 29 00</a></li>
                        </ul>
                    </div>

                    {/* Astreintes 75 */}
                    <div>
                        <h3 style={{ fontSize: 15, marginBottom: 12, color: 'var(--text-secondary)' }}>Astreintes 75</h3>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <li><strong>Logistique :</strong> <a href="tel:0184832910" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 29 10</a></li>
                            <li><strong>Santé :</strong> <a href="tel:0184832920" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 29 20</a></li>
                            <li><strong>Psy :</strong> <a href="tel:0184832930" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 29 30</a></li>
                        </ul>
                    </div>

                    {/* COT 75 */}
                    <div>
                        <h3 style={{ fontSize: 15, marginBottom: 12, color: 'var(--text-secondary)' }}>COT 75</h3>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <li><strong>Standard :</strong> <a href="tel:0184833600" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 36 00</a></li>
                            <li><strong>Alerte :</strong> <a href="tel:0184833601" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 36 01</a></li>
                            <li><strong>Tactique :</strong> <a href="tel:0184833602" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 36 02</a></li>
                            <li><strong>Santé :</strong> <a href="tel:0184833603" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 36 03</a></li>
                            <li><strong>Effectifs :</strong> <a href="tel:0184833604" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 36 04</a></li>
                            <li><strong>Logistique :</strong> <a href="tel:0184833605" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 36 05</a></li>
                            <li><strong>Coord. :</strong> <a href="tel:0184833699" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 36 99</a></li>
                        </ul>
                    </div>

                    {/* PCM 75 */}
                    <div>
                        <h3 style={{ fontSize: 15, marginBottom: 12, color: 'var(--text-secondary)' }}>PCM 75</h3>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <li><strong>Standard :</strong> <a href="tel:0184832850" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 28 50</a></li>
                            <li><strong>Alerte :</strong> <a href="tel:0184832851" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 28 51</a></li>
                            <li><strong>Tactique :</strong> <a href="tel:0184832852" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 28 52</a></li>
                            <li><strong>Santé :</strong> <a href="tel:0184832853" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 28 53</a></li>
                            <li><strong>Logistique :</strong> <a href="tel:0184832855" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 28 55</a></li>
                            <li><strong>Urgence :</strong> <a href="tel:0184832856" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 28 56</a></li>
                            <li><strong>Chef PCM :</strong> <a href="tel:0184832899" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 28 99</a></li>
                            <li><strong>Chef Dispo :</strong> <a href="tel:0184832898" style={{ color: 'var(--crf-red)', textDecoration: 'none' }}>01 84 83 28 98</a></li>
                        </ul>
                    </div>

                </div>
            </div>
        </div>
    );
}
