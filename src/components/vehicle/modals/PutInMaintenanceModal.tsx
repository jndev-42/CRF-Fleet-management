'use client';

import React, { useState } from 'react';

interface PutInMaintenanceModalProps {
  vehicleName: string;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function PutInMaintenanceModal({
  vehicleName,
  onClose,
  onSuccess,
  showToast,
}: PutInMaintenanceModalProps) {
  const todayStr = new Date().toISOString().split('T')[0];

  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>('');
  const [isEndDateUnknown, setIsEndDateUnknown] = useState<boolean>(false);
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!startDate) {
      showToast('Veuillez saisir une date de début.', 'error');
      return;
    }

    if (!reason.trim()) {
      showToast('Veuillez indiquer la raison de la maintenance.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/vehicles/${encodeURIComponent(vehicleName)}/maintenance-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate: isEndDateUnknown ? null : endDate || null,
          reason: reason.trim(),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erreur lors de la mise en maintenance');
      }

      showToast('Véhicule mis en maintenance avec succès', 'success');
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau';
      showToast(msg, 'error');
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
        style={{
          background: 'var(--bg-card, #ffffff)',
          color: 'var(--text-primary, #1e293b)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '500px',
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
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
              🔧 Mettre en maintenance
            </h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary, #64748b)' }}>
              Véhicule : <strong>{vehicleName}</strong>
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
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Start Date */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem' }}>
              Date de début <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              type="date"
              className="form-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px' }}
            />
          </div>

          {/* End Date & Checkbox */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                Date de fin
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
            <input
              type="date"
              className="form-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={isEndDateUnknown}
              min={startDate}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                opacity: isEndDateUnknown ? 0.5 : 1,
                cursor: isEndDateUnknown ? 'not-allowed' : 'auto',
              }}
            />
          </div>

          {/* Reason */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem' }}>
              Raison / Motif de la maintenance <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <textarea
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
              {submitting ? 'Enregistrement...' : 'Mettre en maintenance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
