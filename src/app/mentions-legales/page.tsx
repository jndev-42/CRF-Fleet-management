'use client';

import React from 'react';
import Link from 'next/link';
import { Shield, Mail, Building, Globe, Server, FileText, Info, ArrowLeft } from 'lucide-react';

export default function MentionsLegalesPage() {
    return (
        <div className="page-container" style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
            {/* Bouton retour */}
            <div style={{ marginBottom: 20 }}>
                <Link href="/" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '8px 12px' }}>
                    <ArrowLeft size={16} /> Retour à l’accueil
                </Link>
            </div>

            {/* Header */}
            <div className="page-header" style={{ marginBottom: 30 }}>
                <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Shield style={{ color: 'var(--crf-red)' }} /> Mentions Légales
                </h1>
                <p className="page-description">
                    Mentions Légales et Politique de confidentialité (RGPD) de l’application Martine.
                </p>
            </div>

            {/* Éditeur du site */}
            <div className="detail-card" style={{ marginBottom: 24, padding: '20px' }}>
                <h2 className="section-title" style={{ marginBottom: 16, borderBottom: '1px solid var(--border-primary)', paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Building size={20} style={{ color: 'var(--crf-red)' }} /> Éditeur du site
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, lineHeight: 1.6 }}>
                    <p style={{ margin: 0 }}>
                        Le site <strong>www.cr-chauffeur.vercel.app</strong> est édité par l’association Croix-Rouge (unité locale de Paris 18), association Loi 1901, dont les locaux sont situés au 12 rue du baigneur, 75018 Paris.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginTop: '8px' }}>
                        <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'start', gap: 10 }}>
                            <Info size={16} style={{ marginTop: 3, color: 'var(--text-secondary)' }} />
                            <div>
                                <strong style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)' }}>Responsable de l’application</strong>
                                <span style={{ fontSize: 14 }}>Jean-Noël Durand</span>
                            </div>
                        </div>
                        <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'start', gap: 10 }}>
                            <Mail size={16} style={{ marginTop: 3, color: 'var(--text-secondary)' }} />
                            <div>
                                <strong style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)' }}>Contact</strong>
                                <a href="mailto:jeannoel.durand@croix-rouge.fr" style={{ fontSize: 14, color: 'var(--crf-red)', textDecoration: 'none' }}>
                                    jeannoel.durand@croix-rouge.fr
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hébergements */}
            <div className="detail-card" style={{ marginBottom: 24, padding: '20px' }}>
                <h2 className="section-title" style={{ marginBottom: 16, borderBottom: '1px solid var(--border-primary)', paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Server size={20} style={{ color: 'var(--crf-red)' }} /> Hébergement
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', lineHeight: 1.6 }}>
                    <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <h3 style={{ fontSize: 15, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Globe size={16} style={{ color: 'var(--text-secondary)' }} /> Hébergement du site
                        </h3>
                        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
                            Le site est hébergé aux USA par <strong>Vercel</strong>, dont le siège social est situé au 440 N. Barranca Ave #4133 Covina California 91723 United States.
                        </p>
                    </div>
                    <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <h3 style={{ fontSize: 15, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Server size={16} style={{ color: 'var(--text-secondary)' }} /> Hébergement de la base de données
                        </h3>
                        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
                            La base de données est hébergée en Ireland par <strong>Turso</strong>, dont le siège social est situé au 2093 Philadelphia Pike, #6336 Claymont, Delaware 19703 United States.
                        </p>
                    </div>
                </div>
            </div>

            {/* Politique de confidentialité (RGPD) */}
            <div className="detail-card" style={{ marginBottom: 24, padding: '20px' }}>
                <h2 className="section-title" style={{ marginBottom: 16, borderBottom: '1px solid var(--border-primary)', paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Shield size={20} style={{ color: 'var(--crf-red)' }} /> Politique de confidentialité (RGPD)
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, lineHeight: 1.6 }}>
                    <p style={{ margin: 0, fontWeight: 500 }}>
                        La croix-rouge (unité locale de paris 18) s’engage à ce que la collecte et le traitement de vos données soient conformes au Règlement Général sur la Protection des Données (RGPD).
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <FileText size={14} style={{ color: 'var(--crf-red)' }} /> Pourquoi collectons-nous vos données ?
                            </h3>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                                Les données demandées (Nom, prénom, adresse email) sont strictement nécessaires pour vous identifier, sécuriser votre accès et vous permettre de vous connecter au site de l’association.
                            </p>
                        </div>

                        <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Shield size={14} style={{ color: 'var(--crf-red)' }} /> Qui a accès à vos données ?
                            </h3>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                                Vos données sont confidentielles. Elles sont uniquement accessibles par les administrateurs du site internet de l’association (constitués des cadres de vos unités locales ainsi que de toutes personnes désignées by ces derniers). Elles ne seront jamais vendues, louées ou partagées avec des tiers.
                            </p>
                        </div>

                        <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Info size={14} style={{ color: 'var(--crf-red)' }} /> Combien de temps sont-elles gardées ?
                            </h3>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                                Vos données sont conservées tant que votre compte est actif. Si vous n’utilisez plus le site, votre compte et vos données seront supprimés si vous en faites la demande.
                            </p>
                        </div>

                        <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Mail size={14} style={{ color: 'var(--crf-red)' }} /> Quels sont vos droits ?
                            </h3>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                                Conformément au RGPD, vous disposez d’un droit d’accès, de rectification et de suppression de vos données. Pour exercer ce droit, il vous suffit d’envoyer un email à l’adresse suivante :{" "}
                                <a href="mailto:jeannoel.durand@croix-rouge.fr" style={{ color: 'var(--crf-red)', textDecoration: 'none', fontWeight: 500 }}>
                                    jeannoel.durand@croix-rouge.fr
                                </a>. Nous traiterons votre demande dans les plus brefs délais.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
