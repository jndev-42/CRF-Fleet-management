'use client';

import React, { useState, useEffect, ComponentType } from 'react';

// Détecte si le navigateur supporte les named capture groups (ES2018)
// Non supporté sur iOS 12 Safari — react-markdown en dépend via micromark
function supportsModernRegex(): boolean {
    try {
        new RegExp('(?<test>a)');
        return true;
    } catch (e) {
        return false;
    }
}

// Renderer de secours pour les navigateurs anciens (iOS 12)
function SimpleMarkdown({ content }: { content: string }) {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        if (line.startsWith('### ')) {
            elements.push(<h3 key={i} style={{ fontSize: 14, fontWeight: 700, marginTop: 16, marginBottom: 4, color: 'var(--text-primary)' }}>{line.slice(4)}</h3>);
        } else if (line.startsWith('## ')) {
            elements.push(<h2 key={i} style={{ fontSize: 16, fontWeight: 700, marginTop: 20, marginBottom: 6, color: 'var(--crf-red)' }}>{line.slice(3)}</h2>);
        } else if (line.startsWith('# ')) {
            elements.push(<h1 key={i} style={{ fontSize: 18, fontWeight: 800, marginTop: 24, marginBottom: 8, color: 'var(--text-primary)' }}>{line.slice(2)}</h1>);
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
            elements.push(<li key={i} style={{ marginLeft: 16, marginBottom: 2 }}>{line.slice(2)}</li>);
        } else if (line.trim() === '') {
            elements.push(<br key={i} />);
        } else {
            elements.push(<p key={i} style={{ marginBottom: 4 }}>{line}</p>);
        }
        i++;
    }
    return <div>{elements}</div>;
}

export default function FooterChangelog() {
    const [isOpen, setIsOpen] = useState(false);
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ReactMarkdown, setReactMarkdown] = useState<ComponentType<any> | null>(null);
    const [remarkGfm, setRemarkGfm] = useState<any>(null);

    // Charge react-markdown dynamiquement seulement sur les navigateurs compatibles
    useEffect(() => {
        if (supportsModernRegex()) {
            Promise.all([
                import('react-markdown'),
                import('remark-gfm'),
            ]).then(([md, gfm]) => {
                setReactMarkdown(() => md.default);
                setRemarkGfm(() => gfm.default);
            }).catch(() => {/* silently ignore on incompatible browsers */});
        }
    }, []);

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
                    v1.12.0
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
                                <div className="markdown-body" style={{ textAlign: 'left', fontSize: '14px' }}>
                                    {ReactMarkdown && remarkGfm
                                        ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                                        : <SimpleMarkdown content={content} />
                                    }
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
