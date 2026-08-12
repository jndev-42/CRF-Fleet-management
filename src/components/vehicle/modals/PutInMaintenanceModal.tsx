'use client';

import React, { useState } from 'react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

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
    useEscapeKey(onClose);
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const todayDateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const currentTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const [startDate, setStartDate] = useState<string>(todayDateStr);
  const [startTime, setStartTime] = useState<string>(currentTimeStr);
  const [endDate, setEndDate] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('23:59');
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
      const startDateTimeStr = `${startDate}T${startTime || '00:00'}:00`;
      const startDateISO = new Date(startDateTimeStr).toISOString();

      let endDateISO: string | null = null;
      if (!isEndDateUnknown && endDate) {
        const endDateTimeStr = `${endDate}T${endTime || '23:59'}:00`;
        endDateISO = new Date(endDateTimeStr).toISOString();
      }

      const res = await fetch(`/api/vehicles/${encodeURIComponent(vehicleName)}/maintenance-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: startDateISO,
          endDate: endDateISO,
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
          {/* Start Date & Time */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem' }}>
              Début de la maintenance <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 85px 85px', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="date"
                className="form-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                style={{ padding: '0.5rem 0.75rem', borderRadius: '6px' }}
              />
              <select
                className="form-input"
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
              <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>
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
