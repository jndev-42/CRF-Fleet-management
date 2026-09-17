'use client';

import React, { useState } from 'react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface DeleteMaintenanceEventModalProps {
  event: {
    id: string;
    /**
     * UUID du véhicule — utilisé pour construire l'URL. `Vehicle.name` n'a PAS de
     * contrainte UNIQUE : deux ULs peuvent toutes deux posséder un « VSAV 01 », et
     * la route résoudrait alors un véhicule arbitraire (403/404 intermittents).
     */
    vehicleId: string;
    /** Affichage uniquement. */
    vehicleName: string;
    startDate: string;
    endDate: string | null;
    reason: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Confirmation simple avant suppression d'un événement de maintenance depuis le
 * calendrier. Volontairement allégée par rapport à `DeleteConfirmationModal` :
 * pas de saisie du nom à confirmer — on supprime une ligne de maintenance, pas
 * un véhicule et tout son historique.
 *
 * `VehicleCalendar` n'a pas de toaster : les erreurs serveur (dont le 409
 * « maintenance terminée ») sont affichées dans un état local.
 */
export default function DeleteMaintenanceEventModal({
  event,
  onClose,
  onSuccess,
}: DeleteMaintenanceEventModalProps) {
  useEscapeKey(onClose);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/vehicles/${encodeURIComponent(event.vehicleId)}/maintenance-events/${encodeURIComponent(event.id)}`,
        { method: 'DELETE' },
      );
      if (res.ok) {
        onSuccess();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Erreur lors de la suppression de la maintenance');
    } catch {
      setError('Erreur de connexion');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-maintenance-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="delete-maintenance-title" className="modal-title" style={{ color: 'var(--status-maintenance)' }}>
            🗑️ Supprimer la maintenance
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer la modale">✕</button>
        </div>
        <form onSubmit={handleDelete}>
          <div className="modal-body">
            <p style={{ marginBottom: 16 }}>
              Êtes-vous sûr de vouloir supprimer la maintenance du véhicule{' '}
              <strong>{event.vehicleName}</strong> ?
            </p>
            <p style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>
              Début : <strong>{formatDate(event.startDate)}</strong>
              <br />
              Fin :{' '}
              <strong>{event.endDate ? formatDate(event.endDate) : 'Date de fin inconnue'}</strong>
              <br />
              Motif : <strong>{event.reason}</strong>
            </p>
            {error && (
              <div
                role="alert"
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: '0.875rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--status-maintenance)',
                  color: 'var(--status-maintenance)',
                }}
              >
                {error}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                background: 'var(--status-maintenance)',
                borderColor: 'var(--status-maintenance)',
                opacity: submitting ? 0.5 : 1,
              }}
              disabled={submitting}
            >
              {submitting ? 'Suppression...' : 'Confirmer la suppression'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
