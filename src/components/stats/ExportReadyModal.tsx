'use client';

interface ExportReadyModalProps {
  type: 'csv' | 'pdf';
  jobId: string;
  onClose: () => void;
}

const config = {
  csv: {
    icon: '✅',
    title: 'Votre CSV est prêt !',
    description: 'Le fichier a été généré avec succès.\nCliquez pour le télécharger.',
    label: 'Télécharger le CSV',
    url: (jobId: string) => `/api/stats/csv?jobId=${encodeURIComponent(jobId)}`,
  },
  pdf: {
    icon: '✅',
    title: 'Votre PDF est prêt !',
    description: 'Le rapport a été généré avec succès.\nCliquez pour le télécharger.',
    label: 'Télécharger le PDF',
    url: (jobId: string) => `/api/stats/pdf?jobId=${encodeURIComponent(jobId)}`,
  },
};

export default function ExportReadyModal({ type, jobId, onClose }: ExportReadyModalProps) {
  const c = config[type];

  function handleDownload() {
    window.open(c.url(jobId), '_blank');
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'center' }}>
        <div className="modal-body" style={{ padding: '32px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{c.icon}</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{c.title}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, whiteSpace: 'pre-line' }}>
            {c.description}
          </p>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
            onClick={handleDownload}
          >
            {c.label}
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
