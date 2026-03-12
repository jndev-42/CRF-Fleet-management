'use client';

import React, { useState } from 'react';
import { CheckCircle, ChevronDown } from 'lucide-react';
import type { ConsoleLogEntry, NetworkLogEntry } from '@/lib/bugReportLogger';

interface BugReportModalProps {
  consoleLogs: ConsoleLogEntry[];
  networkLogs: NetworkLogEntry[];
  onClose: () => void;
}

export default function BugReportModal({ consoleLogs, networkLogs, onClose }: BugReportModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logsExpanded, setLogsExpanded] = useState(false);

  const logsText = consoleLogs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
  const networkText = networkLogs.map(n => `[${n.timestamp}] ${n.method} ${n.url} → ${n.status ?? 'ERR'} (${n.duration}ms)`).join('\n');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/bugs/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          logs: logsText,
          networkLogs: networkText,
          userAgent: navigator.userAgent,
          pageUrl: window.location.href,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error || 'Erreur lors de l\'envoi du rapport');
      }
    } catch {
      setError('Erreur de connexion');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 400 }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="bug-report-title"
           onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="bug-report-title" className="modal-title">Signaler un bug</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer la modale">✕</button>
        </div>

        {submitted ? (
          <div className="modal-body" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <CheckCircle size={48} style={{ color: '#22C55E', marginBottom: 16 }} />
            <p style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>Rapport envoyé !</p>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
              Merci pour votre signalement. Un ticket a été créé.
            </p>
            <button className="btn btn-primary" onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label" htmlFor="bug-title">Titre <span style={{ color: 'var(--crf-red)' }}>*</span></label>
                <input
                  id="bug-title"
                  className="form-input"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Résumé du problème en une ligne"
                  maxLength={200}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="bug-description">Description</label>
                <textarea
                  id="bug-description"
                  className="form-textarea"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Étapes pour reproduire, comportement attendu vs observé..."
                  rows={5}
                  maxLength={5000}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setLogsExpanded(v => !v)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: '0.85rem', padding: '4px 0',
                  }}
                >
                  <ChevronDown size={14} style={{ transform: logsExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  Logs techniques ({consoleLogs.length} console, {networkLogs.length} réseau)
                </button>
                {logsExpanded && (
                  <pre style={{
                    marginTop: 8,
                    padding: '10px 12px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary)',
                    maxHeight: 200,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>
                    {logsText || '(aucun log console)'}
                    {'\n\n--- Réseau ---\n'}
                    {networkText || '(aucune requête)'}
                  </pre>
                )}
              </div>

              {error && (
                <p style={{ color: '#EF4444', fontSize: '0.875rem', marginTop: 8 }}>{error}</p>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                Annuler
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting || !title.trim()}>
                {submitting ? 'Envoi...' : 'Envoyer le rapport'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
