'use client';

import React, { useState } from 'react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface EditMaintenanceEventModalProps {
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

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Préremplissage UTC → heure LOCALE.
 *
 * `PutInMaintenanceModal` fait l'opération inverse au submit
 * (`new Date(`${date}T${time}:00`).toISOString()`) : l'aller est local → UTC,
 * le retour doit donc être UTC → local. On lit les composantes via
 * `getFullYear`/`getMonth`/`getDate`/`getHours`/`getMinutes`, JAMAIS via
 * `toISOString().split('T')` qui afficherait le mauvais jour.
 *
 * Conséquence assumée (ce n'est pas un bug) : un événement créé depuis une saisie
 * date-seule et stocké `…T00:00:00.000Z` se préremplit à 02:00 en `Europe/Paris`.
 * Le round-trip reste stable.
 */
function splitLocal(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * Modification d'un événement de maintenance depuis le calendrier véhicule.
 * `VehicleCalendar` n'a pas de toaster : les erreurs serveur (dont le 409
 * « maintenance terminée ») sont affichées dans un état local.
 */
export default function EditMaintenanceEventModal({
  event,
  onClose,
  onSuccess,
}: EditMaintenanceEventModalProps) {
  useEscapeKey(onClose);

  const initialStart = splitLocal(event.startDate);
  const initialEnd = event.endDate ? splitLocal(event.endDate) : null;

  const [startDate, setStartDate] = useState<string>(initialStart.date);
  const [startTime, setStartTime] = useState<string>(initialStart.time);
  const [endDate, setEndDate] = useState<string>(initialEnd ? initialEnd.date : '');
  const [endTime, setEndTime] = useState<string>(initialEnd ? initialEnd.time : '23:59');
  // Case cochée ssi la maintenance n'a pas de date de fin en base.
  const [isEndDateUnknown, setIsEndDateUnknown] = useState<boolean>(event.endDate === null);
  const [reason, setReason] = useState<string>(event.reason);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!startDate) {
      setError('Veuillez saisir une date de début.');
      return;
    }

    if (!reason.trim()) {
      setError('Veuillez indiquer la raison de la maintenance.');
      return;
    }

    setSubmitting(true);
    try {
      const startDateISO = new Date(`${startDate}T${startTime || '00:00'}:00`).toISOString();

      let endDateISO: string | null = null;
      if (!isEndDateUnknown && endDate) {
        endDateISO = new Date(`${endDate}T${endTime || '23:59'}:00`).toISOString();
      }

      const res = await fetch(
        `/api/vehicles/${encodeURIComponent(event.vehicleId)}/maintenance-events/${encodeURIComponent(event.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate: startDateISO,
            endDate: endDateISO,
            reason: reason.trim(),
          }),
        },
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erreur lors de la modification de la maintenance');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-maintenance-title"
        style={{
          background: 'var(--bg-card, #ffffff)',
          color: 'var(--text-primary, #1e293b)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
          border: '1px solid var(--border-primary, #e2e8f0)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-primary, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 id="edit-maintenance-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
              ✏️ Modifier la maintenance
            </h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary, #64748b)' }}>
              Véhicule : <strong>{event.vehicleName}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: 'var(--text-secondary, #64748b)',
            }}
            aria-label="Fermer la modale"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {error && (
            <div
              role="alert"
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                fontSize: '0.875rem',
                background: 'var(--bg-secondary, #f1f5f9)',
                border: '1px solid var(--status-maintenance, #EF4444)',
                color: 'var(--status-maintenance, #EF4444)',
              }}
            >
              {error}
            </div>
          )}

          {/* Start Date & Time */}
          <div>
            <label
              htmlFor="edit-maintenance-start-date"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem' }}
            >
              Début de la maintenance <span style={{ color: 'var(--status-maintenance)' }}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 85px 85px', gap: '0.5rem', alignItems: 'center' }}>
              <input
                id="edit-maintenance-start-date"
                type="date"
                className="form-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                style={{ padding: '0.5rem 0.75rem', borderRadius: '6px' }}
              />
              <select
                className="form-input"
                aria-label="Heure de début"
                value={startTime.split(':')[0] || '00'}
                onChange={(e) => {
                  const m = startTime.split(':')[1] || '00';
                  setStartTime(`${e.target.value}:${m}`);
                }}
                required
                style={{ padding: '0.5rem 0.25rem', borderRadius: '6px', textAlign: 'center' }}
              >
                {Array.from({ length: 24 }, (_, i) => {
                  const h = i.toString().padStart(2, '0');
                  return <option key={h} value={h}>{h} h</option>;
                })}
              </select>
              <select
                className="form-input"
                aria-label="Minutes de début"
                value={startTime.split(':')[1] || '00'}
                onChange={(e) => {
                  const h = startTime.split(':')[0] || '00';
                  setStartTime(`${h}:${e.target.value}`);
                }}
                required
                style={{ padding: '0.5rem 0.25rem', borderRadius: '6px', textAlign: 'center' }}
              >
                {Array.from({ length: 60 }, (_, i) => {
                  const m = i.toString().padStart(2, '0');
                  return <option key={m} value={m}>{m} min</option>;
                })}
              </select>
            </div>
          </div>

          {/* End Date & Time & Checkbox */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
              <label htmlFor="edit-maintenance-end-date" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                Fin de la maintenance
              </label>
              <label style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isEndDateUnknown}
                  onChange={(e) => {
                    setIsEndDateUnknown(e.target.checked);
                    if (e.target.checked) setEndDate('');
                  }}
                />
                <span>Date de fin inconnue</span>
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 85px 85px', gap: '0.5rem', alignItems: 'center' }}>
              <input
                id="edit-maintenance-end-date"
                type="date"
                className="form-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isEndDateUnknown}
                min={startDate}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  opacity: isEndDateUnknown ? 0.5 : 1,
                  cursor: isEndDateUnknown ? 'not-allowed' : 'auto',
                }}
              />
              <select
                className="form-input"
                aria-label="Heure de fin"
                value={endTime.split(':')[0] || '23'}
                onChange={(e) => {
                  const m = endTime.split(':')[1] || '59';
                  setEndTime(`${e.target.value}:${m}`);
                }}
                disabled={isEndDateUnknown}
                style={{
                  padding: '0.5rem 0.25rem',
                  borderRadius: '6px',
                  textAlign: 'center',
                  opacity: isEndDateUnknown ? 0.5 : 1,
                  cursor: isEndDateUnknown ? 'not-allowed' : 'auto',
                }}
              >
                {Array.from({ length: 24 }, (_, i) => {
                  const h = i.toString().padStart(2, '0');
                  return <option key={h} value={h}>{h} h</option>;
                })}
              </select>
              <select
                className="form-input"
                aria-label="Minutes de fin"
                value={endTime.split(':')[1] || '59'}
                onChange={(e) => {
                  const h = endTime.split(':')[0] || '23';
                  setEndTime(`${h}:${e.target.value}`);
                }}
                disabled={isEndDateUnknown}
                style={{
                  padding: '0.5rem 0.25rem',
                  borderRadius: '6px',
                  textAlign: 'center',
                  opacity: isEndDateUnknown ? 0.5 : 1,
                  cursor: isEndDateUnknown ? 'not-allowed' : 'auto',
                }}
              >
                {Array.from({ length: 60 }, (_, i) => {
                  const m = i.toString().padStart(2, '0');
                  return <option key={m} value={m}>{m} min</option>;
                })}
              </select>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label
              htmlFor="edit-maintenance-reason"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem' }}
            >
              Raison / Motif de la maintenance <span style={{ color: 'var(--status-maintenance)' }}>*</span>
            </label>
            <textarea
              id="edit-maintenance-reason"
              className="form-input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Révision périodique, panne d'embrayage, contrôle technique..."
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', resize: 'vertical' }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ backgroundColor: 'var(--status-maintenance, #EF4444)', borderColor: 'var(--status-maintenance, #EF4444)' }}
            >
              {submitting ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
