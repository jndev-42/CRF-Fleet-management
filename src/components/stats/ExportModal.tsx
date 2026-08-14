'use client';

import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface ExportModalProps {
  type: 'csv' | 'pdf';
  defaultFrom: string;
  defaultTo: string;
  onConfirm: (from: string, to: string) => void;
  onClose: () => void;
}

export default function ExportModal({ type, defaultFrom, defaultTo, onConfirm, onClose }: ExportModalProps) {
    useEscapeKey(onClose);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <div className="modal-header">
          <h2 className="modal-title">
            {type === 'csv' ? 'Export CSV' : 'Export PDF'}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            {type === 'csv'
              ? 'Choisissez la plage de dates pour l\'export (sans limite de durée)'
              : 'Choisissez la plage de dates pour le rapport PDF'}
          </p>
          <form
            id="export-form"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const from = fd.get('dateFrom') as string;
              const to = fd.get('dateTo') as string;
              if (from && to) onConfirm(from, to);
            }}
          >
            <div className="form-row">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Du</label>
                <input
                  type="date"
                  name="dateFrom"
                  className="form-input"
                  defaultValue={defaultFrom}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Au</label>
                <input
                  type="date"
                  name="dateTo"
                  className="form-input"
                  defaultValue={defaultTo}
                  required
                />
              </div>
            </div>
            <p className="form-hint" style={{ marginTop: 10 }}>
              {type === 'csv'
                ? "L'export peut couvrir n'importe quelle plage de dates"
                : "La génération se fait en arrière-plan. Une notification apparaît quand le PDF est prêt."}
            </p>
          </form>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" form="export-form" className="btn btn-primary">
            {type === 'csv' ? 'Télécharger CSV' : 'Générer le PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
