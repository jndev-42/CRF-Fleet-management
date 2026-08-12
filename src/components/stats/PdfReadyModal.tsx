'use client';

import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface PdfReadyModalProps {
  jobId: string;
  onClose: () => void;
}

export default function PdfReadyModal({ jobId, onClose }: PdfReadyModalProps) {
    useEscapeKey(onClose);
  function handleDownload() {
    window.open(`/api/stats/pdf?jobId=${encodeURIComponent(jobId)}`, '_blank');
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'center' }}>
        <div className="modal-body" style={{ padding: '32px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Votre PDF est prêt !</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
            Le rapport a été généré avec succès.<br />Cliquez pour le télécharger.
          </p>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
            onClick={handleDownload}
          >
            Télécharger le PDF
          </button>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
