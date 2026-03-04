'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function FooterChangelog() {
    const [isOpen, setIsOpen] = useState(false);
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const openModal = async () => {
        setIsOpen(true);
        if (!content && !loading) {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch('/api/changelog');
                if (!res.ok) throw new Error('Failed to fetch changelog');
                const text = await res.text();
                setContent(text);
            } catch (err: any) {
                console.error(err);
                setError('Impossible de charger le changelog.');
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <>
            <div style={{ marginTop: 8 }}>
                <button
                    onClick={openModal}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontSize: '12px',
                        padding: 0
                    }}
                >
                    v1.2.2
                </button>
            </div>

            {isOpen && (
                <div className="modal-overlay" onClick={() => setIsOpen(false)} style={{ zIndex: 9999, backdropFilter: 'blur(5px)' }}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">📝 Notes de mise à jour (Changelog)</h2>
                            <button className="modal-close" onClick={() => setIsOpen(false)}>✕</button>
                        </div>
                        <div className="modal-body" style={{ color: 'var(--text-primary)', lineHeight: 1.6 }}>
                            {loading && (
                                <div className="loading-container" style={{ padding: 40 }}>
                                    <div className="loading-spinner" />
                                    <div style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: 14 }}>Chargement du changelog...</div>
                                </div>
                            )}
                            {error && (
                                <div className="empty-state">
                                    <div style={{ fontSize: 32, marginBottom: 12 }}>❌</div>
                                    <div className="empty-state-title" style={{ color: '#EF4444' }}>{error}</div>
                                </div>
                            )}
                            {!loading && !error && content && (
                                <div className="markdown-body" style={{
                                    textAlign: 'left',
                                    fontSize: '14px',
                                }}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {content}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
