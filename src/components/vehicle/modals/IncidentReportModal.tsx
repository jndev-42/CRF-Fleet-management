'use client';

import React, { useState, useEffect } from 'react';
import IncidentGuidelines from '@/components/vehicle/IncidentGuidelines';
import VehicleInteractiveSVG from '@/components/vehicle/VehicleInteractiveSVG';
import PhotoPicker from '@/components/ui/PhotoPicker';
import { uploadFilesToDriveSafely } from '@/lib/imageCompression';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

interface IncidentReportModalProps {
    vehicle: { id: string; name: string };
    tripId?: string;
    reservationId?: string;
    existingDraftId?: string;
    onClose: () => void;
    onSuccess?: (reportId: string) => void;
}

type Step = 'GUIDELINES_PROMPT' | 'GUIDELINES_VIEW' | 'TYPE_SELECTION' | 'FORM_FLASH' | 'FORM_ACCIDENT' | 'SUMMARY';

export default function IncidentReportModal({
    vehicle,
    tripId,
    reservationId,
    existingDraftId,
    onClose,
    onSuccess,
}: IncidentReportModalProps) {
    useEscapeKey(onClose);
    const [step, setStep] = useState<Step>('GUIDELINES_PROMPT');
    const [selectedType, setSelectedType] = useState<'FLASH' | 'ACCIDENT' | null>(null);
    const [reportId, setReportId] = useState<string | null>(existingDraftId || null);
    const [loading, setLoading] = useState(!!existingDraftId);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form states
    const [commonData, setCommonData] = useState({
        occurredAt: (() => {
            const now = new Date();
            const tzOffset = now.getTimezoneOffset() * 60000;
            return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
        })(),
        location: '',
        description: '',
        retrospection: '',
    });

    const [flashDetails, setFlashDetails] = useState({
        ficheInter: '',
        horsSamu: false,
    });

    const [accidentDetails, setAccidentDetails] = useState({
        crfZones: [] as string[],
        thirdPartyZones: [] as string[],
    });

    const [damages, setDamages] = useState({
        crf: true,
        thirdParty: false,
        urban: false,
        person: false,
    });

    const [victims, setVictims] = useState({
        crf: false,
        thirdParty: false,
        severity: false,
    });

    const [actions, setActions] = useState({
        emergencyCalled: false,
        onyxContacted: false,
        reportMade: false,
    });

    const [context, setContext] = useState({
        vehicleStopped: false,
        motion: 'forward' as 'forward' | 'backward' | 'none',
    });

    const [photosDamages, setPhotosDamages] = useState<File[]>([]);
    const [photosReport, setPhotosReport] = useState<File[]>([]);

    useEffect(() => {
        if (existingDraftId) {
            fetch(`/api/incidents/${existingDraftId}`)
                .then(res => {
                    if (!res.ok) throw new Error('Erreur de chargement');
                    return res.json();
                })
                .then(data => {
                    if (data.type) {
                        setSelectedType(data.type);
                        setStep('SUMMARY'); // Direct to summary
                    } else {
                        setStep('TYPE_SELECTION');
                    }
                    if (data.occurredAt) {
                        // Format for datetime-local input
                        let occ = data.occurredAt;
                        if (occ.length > 16 && occ.includes('Z')) {
                            const dt = new Date(occ);
                            const tzOffset = dt.getTimezoneOffset() * 60000;
                            occ = new Date(dt.getTime() - tzOffset).toISOString().slice(0, 16);
                        } else if (occ.length > 16) {
                             occ = occ.slice(0, 16);
                        }
                        setCommonData(prev => ({ ...prev, occurredAt: occ, location: data.location || '', description: data.description || '', retrospection: data.retrospection || '' }));
                    } else {
                        setCommonData(prev => ({ ...prev, location: data.location || '', description: data.description || '', retrospection: data.retrospection || '' }));
                    }
                    if (data.flashDetails) setFlashDetails(data.flashDetails);
                    if (data.accidentDetails) setAccidentDetails(data.accidentDetails);
                    if (data.damages) setDamages(data.damages);
                    if (data.victims) setVictims(data.victims);
                    if (data.actions) setActions(data.actions);
                    if (data.context) setContext(data.context);
                })
                .catch(err => {
                    console.error(err);
                    setError('Erreur lors du chargement du brouillon');
                    setStep('GUIDELINES_PROMPT');
                })
                .finally(() => setLoading(false));
        }
    }, [existingDraftId]);

    async function createDraftReport() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/incidents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicleId: vehicle.id,
                    tripId: tripId || null,
                    reservationId: reservationId || null,
                    status: 'DRAFT',
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setReportId(data.id);
                return data.id;
            } else {
                setError(data.error || 'Erreur lors de la création du rapport');
            }
        } catch (err) {
            console.error(err);
            setError('Erreur de connexion');
        } finally {
            setLoading(false);
        }
        return null;
    }

    async function handleStartDeclaration() {
        const id = await createDraftReport();
        if (id) setStep('TYPE_SELECTION');
    }

    async function handleTypeSelect(type: 'FLASH' | 'ACCIDENT') {
        if (!reportId) return;

        try {
            await fetch(`/api/incidents/${reportId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type }),
            });
            setSelectedType(type);
            setStep(type === 'FLASH' ? 'FORM_FLASH' : 'FORM_ACCIDENT');
        } catch (err) {
            console.error(err);
            setError('Erreur lors de la sélection du type');
        }
    }

    async function saveForm(isFinal: boolean = false) {
        if (!reportId) return;
        setSubmitting(true);
        setError(null);

        try {
            const type = selectedType;

            // Upload photos if any and not already uploaded
            let driveFolderId = null;
            if ((photosDamages.length > 0 || photosReport.length > 0) && isFinal) {
                const allPhotos = [...photosDamages, ...photosReport];
                const uploadResult = await uploadFilesToDriveSafely({
                    files: allPhotos,
                    vehicleName: vehicle.name,
                    date: commonData.occurredAt,
                    stage: `incident-${reportId.substring(0, 8)}`,
                });

                if (uploadResult.success) {
                    driveFolderId = uploadResult.subfolderId || uploadResult.folderId;
                } else {
                    setError(uploadResult.error || 'Erreur lors de l\'upload des photos d\'incident.');
                    setSubmitting(false);
                    return;
                }
            }

            const res = await fetch(`/api/incidents/${reportId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...commonData,
                    flashDetails: flashDetails,
                    accidentDetails: type === 'ACCIDENT' ? accidentDetails : null,
                    damages,
                    victims,
                    actions,
                    context,
                    status: isFinal ? 'SUBMITTED' : 'DRAFT',
                    driveFolderId: driveFolderId || undefined,
                }),
            });

            if (res.ok) {
                if (isFinal) {
                    // Start PDF generation
                    const pdfRes = await fetch(`/api/incidents/${reportId}/pdf`);
                    if (pdfRes.ok) {
                        const blob = await pdfRes.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `incident-report-${reportId}.pdf`;
                        a.click();
                        window.URL.revokeObjectURL(url);
                    }
                    onSuccess?.(reportId);
                    onClose();
                } else {
                    setStep('SUMMARY');
                }
            } else {
                const d = await res.json();
                setError(d.error || 'Erreur lors de la sauvegarde');
            }
        } catch (err) {
            console.error(err);
            setError('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    }

    const titles: Record<Step, string> = {
        GUIDELINES_PROMPT: '🚨 Déclarer un incident',
        GUIDELINES_VIEW: '📋 Consignes incident',
        TYPE_SELECTION: '🚨 Type d\'incident',
        FORM_FLASH: '📸 Flash Radar',
        FORM_ACCIDENT: '🚗 Accident / Incident',
        SUMMARY: '📝 Récapitulatif',
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10001 }}>
            <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: step.startsWith('FORM') || step === 'SUMMARY' ? '800px' : '500px' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">{titles[step]}</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    {error && <div className="error-banner">{error}</div>}

                    {step === 'GUIDELINES_PROMPT' && (
                        <div className="step-prompt">
                            <p style={{ marginBottom: 12 }}>
                                Vous allez déclarer un incident sur le véhicule <strong>{vehicle.name}</strong>.
                            </p>
                            <p>Souhaitez-vous consulter les consignes à suivre en cas d&apos;incident ?</p>
                        </div>
                    )}

                    {step === 'GUIDELINES_VIEW' && <IncidentGuidelines />}

                    {step === 'TYPE_SELECTION' && (
                        <div className="type-grid">
                            <button className="type-card" onClick={() => handleTypeSelect('ACCIDENT')}>
                                <span className="type-icon">🚗</span>
                                <div className="type-info">
                                    <div className="type-title">Accident / Incident de circulation</div>
                                    <div className="type-desc">Collision, accrochage, bris de glace...</div>
                                </div>
                            </button>
                            <button className="type-card" onClick={() => handleTypeSelect('FLASH')}>
                                <span className="type-icon">📸</span>
                                <div className="type-info">
                                    <div className="type-title">Flash radar / Infraction</div>
                                    <div className="type-desc">Excès de vitesse, feu rouge...</div>
                                </div>
                            </button>
                        </div>
                    )}

                    {step === 'FORM_FLASH' && (
                        <div className="form-container">
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Date et Heure</label>
                                    <input type="datetime-local" className="form-input" value={commonData.occurredAt} onChange={e => setCommonData({ ...commonData, occurredAt: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Lieu</label>
                                    <input type="text" className="form-input" placeholder="Ville, rue, PK..." value={commonData.location} onChange={e => setCommonData({ ...commonData, location: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">N° Fiche Inter</label>
                                    <input type="text" className="form-input" value={flashDetails.ficheInter} onChange={e => setFlashDetails({ ...flashDetails, ficheInter: e.target.value })} />
                                </div>
                                <div className="form-group" style={{ display: 'flex', alignItems: 'center', height: '100%', paddingTop: 25 }}>
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={flashDetails.horsSamu} onChange={e => setFlashDetails({ ...flashDetails, horsSamu: e.target.checked })} />
                                        <span>Hors départ Samu/BSPP</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'FORM_ACCIDENT' && (
                        <div className="form-container scrollable" style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 10 }}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Date et Heure</label>
                                    <input type="datetime-local" className="form-input" value={commonData.occurredAt} onChange={e => setCommonData({ ...commonData, occurredAt: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Lieu</label>
                                    <input type="text" className="form-input" placeholder="Arrondissement, type de voie..." value={commonData.location} onChange={e => setCommonData({ ...commonData, location: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">N° Fiche Inter</label>
                                    <input type="text" className="form-input" value={flashDetails.ficheInter} onChange={e => setFlashDetails({ ...flashDetails, ficheInter: e.target.value })} />
                                </div>
                                <div className="form-group" style={{ display: 'flex', alignItems: 'center', height: '100%', paddingTop: 25 }}>
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={flashDetails.horsSamu} onChange={e => setFlashDetails({ ...flashDetails, horsSamu: e.target.checked })} />
                                        <span>Hors départ Samu/BSPP</span>
                                    </label>
                                </div>
                            </div>
                            <div className="svg-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                                <VehicleInteractiveSVG
                                    title="Véhicule CRF"
                                    selectedZones={accidentDetails.crfZones}
                                    onZoneClick={z => setAccidentDetails(prev => ({
                                        ...prev,
                                        crfZones: prev.crfZones.includes(z) ? prev.crfZones.filter(x => x !== z) : [...prev.crfZones, z]
                                    }))}
                                />
                                {damages.thirdParty && (
                                    <VehicleInteractiveSVG
                                        title="Véhicule Tiers"
                                        selectedZones={accidentDetails.thirdPartyZones}
                                        onZoneClick={z => setAccidentDetails(prev => ({
                                            ...prev,
                                            thirdPartyZones: prev.thirdPartyZones.includes(z) ? prev.thirdPartyZones.filter(x => x !== z) : [...prev.thirdPartyZones, z]
                                        }))}
                                    />
                                )}
                            </div>

                            <div className="section-title-sm">Dégâts matériels</div>
                            <div className="checkbox-grid">
                                <label className="checkbox-label"><input type="checkbox" checked={damages.crf} onChange={e => setDamages({ ...damages, crf: e.target.checked })} /> <span>Véhicule CRF</span></label>
                                <label className="checkbox-label"><input type="checkbox" checked={damages.thirdParty} onChange={e => setDamages({ ...damages, thirdParty: e.target.checked })} /> <span>Véhicule Tiers</span></label>
                                <label className="checkbox-label"><input type="checkbox" checked={damages.urban} onChange={e => setDamages({ ...damages, urban: e.target.checked })} /> <span>Mobilier urbain</span></label>
                                <label className="checkbox-label"><input type="checkbox" checked={damages.person} onChange={e => setDamages({ ...damages, person: e.target.checked })} /> <span>Personne</span></label>
                            </div>

                            <div className="section-title-sm">Victimes</div>
                            <div className="checkbox-grid">
                                <label className="checkbox-label"><input type="checkbox" checked={victims.crf} onChange={e => setVictims({ ...victims, crf: e.target.checked })} /> <span>Victime CRF</span></label>
                                <label className="checkbox-label"><input type="checkbox" checked={victims.thirdParty} onChange={e => setVictims({ ...victims, thirdParty: e.target.checked })} /> <span>Victime Tiers</span></label>
                                {(victims.crf || victims.thirdParty) && (
                                    <label className="checkbox-label" style={{ color: '#EF4444' }}><input type="checkbox" checked={victims.severity} onChange={e => setVictims({ ...victims, severity: e.target.checked })} /> <span>Urgence absolue / Grave</span></label>
                                )}
                            </div>

                            <div className="section-title-sm">Actions et Contexte</div>
                            <div className="checkbox-grid">
                                <label className="checkbox-label"><input type="checkbox" checked={actions.emergencyCalled} onChange={e => setActions({ ...actions, emergencyCalled: e.target.checked })} /> <span>Appel 15/18/17</span></label>
                                <label className="checkbox-label"><input type="checkbox" checked={actions.onyxContacted} onChange={e => setActions({ ...actions, onyxContacted: e.target.checked })} /> <span>Contact Onyx</span></label>
                                <label className="checkbox-label"><input type="checkbox" checked={actions.reportMade} onChange={e => setActions({ ...actions, reportMade: e.target.checked })} /> <span>Constat effectué</span></label>
                            </div>

                            <div className="form-row" style={{ marginTop: 10 }}>
                                <div className="form-group">
                                    <label className="checkbox-label"><input type="checkbox" checked={context.vehicleStopped} onChange={e => setContext({ ...context, vehicleStopped: e.target.checked })} /> <span>Véhicule arrêté / Stationné</span></label>
                                </div>
                                {!context.vehicleStopped && (
                                    <div className="form-group">
                                        <select className="form-select" value={context.motion} onChange={e => setContext({ ...context, motion: e.target.value as 'forward' | 'backward' })}>
                                            <option value="forward">En marche avant</option>
                                            <option value="backward">En marche arrière</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Description précise des dégâts</label>
                                <textarea className="form-textarea" value={commonData.description} onChange={e => setCommonData({ ...commonData, description: e.target.value })} placeholder="Précisez les dégâts visibles..." />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Rétrospection</label>
                                <textarea className="form-textarea" value={commonData.retrospection} onChange={e => setCommonData({ ...commonData, retrospection: e.target.value })} placeholder="Comment auriez-vous pu éviter cet incident ?" />
                            </div>

                            <PhotoPicker label="📸 Photos des dégâts" photos={photosDamages} onPhotosChange={setPhotosDamages} maxSizeMB={15} maxTotalSizeMB={150} />
                            {actions.reportMade && <PhotoPicker label="📝 Photo du constat" photos={photosReport} onPhotosChange={setPhotosReport} maxSizeMB={15} maxTotalSizeMB={150} />}
                        </div>
                    )}

                    {step === 'SUMMARY' && (
                        <div className="summary-view scrollable" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                            <div className="summary-section" style={{ background: 'var(--bg-secondary)', padding: 15, borderRadius: 8 }}>
                                <div className="summary-row"><strong>Type :</strong> {selectedType === 'FLASH' ? '📸 Flash radar' : '🚗 Accident / Incident de circulation'}</div>
                                <div className="summary-row"><strong>Date :</strong> {commonData.occurredAt.replace('T', ' ')}</div>
                                <div className="summary-row"><strong>Lieu :</strong> {commonData.location}</div>
                                {(selectedType === 'FLASH' || flashDetails.ficheInter) && (
                                    <>
                                        <div className="summary-row"><strong>N° Fiche Inter :</strong> {flashDetails.ficheInter || '—'}</div>
                                        <div className="summary-row"><strong>Hors Samu/BSPP :</strong> {flashDetails.horsSamu ? 'Oui' : 'Non'}</div>
                                    </>
                                )}
                            </div>

                            {selectedType === 'ACCIDENT' && (
                                <div className="summary-section" style={{ marginTop: 15, background: 'var(--bg-secondary)', padding: 15, borderRadius: 8 }}>
                                    <div className="summary-row"><strong>Zones CRF :</strong> {accidentDetails.crfZones.join(', ') || 'Aucune'}</div>
                                    {damages.thirdParty && (
                                        <div className="summary-row"><strong>Zones Tiers :</strong> {accidentDetails.thirdPartyZones.join(', ') || 'Aucune'}</div>
                                    )}
                                    <div className="summary-row"><strong>Dégâts :</strong> {[
                                        damages.crf && 'CRF',
                                        damages.thirdParty && 'Tiers',
                                        damages.urban && 'Urbain',
                                        damages.person && 'Personne'
                                    ].filter(Boolean).join(', ') || 'Aucun'}</div>
                                    <div className="summary-row"><strong>Victimes :</strong> {victims.crf || victims.thirdParty ? (
                                        `${[victims.crf && 'CRF', victims.thirdParty && 'Tiers'].filter(Boolean).join(', ')} ${victims.severity ? '(Grave)' : '(Léger)'}`
                                    ) : 'Aucune'}</div>
                                    <div className="summary-row"><strong>Actions :</strong> {[
                                        actions.emergencyCalled && 'Appel 15/18/17',
                                        actions.onyxContacted && 'Contact Onyx',
                                        actions.reportMade && 'Constat effectué'
                                    ].filter(Boolean).join(', ') || 'Aucune'}</div>
                                    <div className="summary-row"><strong>Contexte :</strong> {context.vehicleStopped ? 'À l\'arrêt' : `En mouvement (${context.motion === 'forward' ? 'AV' : 'AR'})`}</div>
                                </div>
                            )}

                            <div className="summary-section" style={{ marginTop: 15 }}>
                                <div className="summary-row"><strong>Description :</strong></div>
                                <div style={{ fontSize: 13, background: 'var(--bg-card)', padding: 10, borderRadius: 4, border: '1px solid var(--border-primary)' }}>{commonData.description || 'N/A'}</div>

                                {commonData.retrospection && (
                                    <>
                                        <div className="summary-row" style={{ marginTop: 10 }}><strong>Rétrospection :</strong></div>
                                        <div style={{ fontSize: 13, background: 'var(--bg-card)', padding: 10, borderRadius: 4, border: '1px solid var(--border-primary)' }}>{commonData.retrospection}</div>
                                    </>
                                )}
                            </div>

                            <p style={{ fontStyle: 'italic', fontSize: 12, color: 'var(--text-secondary)', marginTop: 20 }}>Veuillez vérifier les informations avant de valider. Un rapport PDF sera généré et téléchargé automatiquement.</p>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    {step === 'GUIDELINES_PROMPT' && (
                        <>
                            <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
                            <button className="btn btn-secondary" onClick={() => setStep('GUIDELINES_VIEW')}>Oui, voir les consignes</button>
                            <button className="btn btn-primary" style={{ background: '#DC2626' }} onClick={handleStartDeclaration} disabled={loading}>{loading ? '...' : 'Non, déclarer directement'}</button>
                        </>
                    )}
                    {step === 'GUIDELINES_VIEW' && (
                        <>
                            <button className="btn btn-secondary" onClick={() => setStep('GUIDELINES_PROMPT')}>Retour</button>
                            <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
                            <button className="btn btn-primary" style={{ background: '#DC2626' }} onClick={handleStartDeclaration} disabled={loading}>{loading ? '...' : '🚨 Déclarer l\'incident'}</button>
                        </>
                    )}
                    {step === 'TYPE_SELECTION' && (
                        <>
                            <button className="btn btn-secondary" onClick={() => setStep('GUIDELINES_PROMPT')}>Retour</button>
                            <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
                        </>
                    )}
                    {(step === 'FORM_FLASH' || step === 'FORM_ACCIDENT') && (
                        <>
                            <button className="btn btn-secondary" onClick={() => setStep('TYPE_SELECTION')}>Retour</button>
                            <button className="btn btn-primary" onClick={() => saveForm(false)} disabled={submitting}>{submitting ? '...' : 'Suivant'}</button>
                        </>
                    )}
                    {step === 'SUMMARY' && (
                        <>
                            <button className="btn btn-secondary" onClick={() => setStep(selectedType === 'FLASH' ? 'FORM_FLASH' : 'FORM_ACCIDENT')}>Modifier</button>
                            <button className="btn btn-success" onClick={() => saveForm(true)} disabled={submitting}>{submitting ? '...' : 'Valider et Générer PDF'}</button>
                        </>
                    )}
                </div>
            </div>

            <style jsx>{`
                .error-banner { padding: 10px; background: rgba(239, 68, 68, 0.1); color: #DC2626; border-radius: 4px; margin-bottom: 15px; font-size: 13px; }
                .type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                .type-card { display: flex; align-items: center; gap: 15px; padding: 20px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-card); cursor: pointer; text-align: left; transition: all 0.2s; }
                .type-card:hover { border-color: var(--status-inuse); background: var(--bg-secondary); }
                .type-icon { font-size: 32px; }
                .type-title { font-weight: 600; margin-bottom: 4px; }
                .type-desc { font-size: 12px; color: var(--text-secondary); }
                .section-title-sm { font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); margin: 20px 0 10px; border-bottom: 1px solid var(--border-primary); padding-bottom: 4px; }
                .checkbox-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                .checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
                .summary-row { margin-bottom: 8px; font-size: 14px; }
            `}</style>
        </div>
    );
}
