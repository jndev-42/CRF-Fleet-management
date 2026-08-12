'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import YousignSignatureModal, { SignatureData } from '@/components/expenses/YousignSignatureModal';
import ExpensesFilters from './ExpensesFilters';
import ExpensesTable from './ExpensesTable';
import ExpenseDetailSidebar from './ExpenseDetailSidebar';
import JustificatifsModal from './JustificatifsModal';
import PhotoLightbox from './PhotoLightbox';
import { useExpenseReports } from './useExpenseReports';
import type { ExpenseReport } from './types';

export default function ExpensesPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [isCreating, setIsCreating] = useState(false);
    const [editingReport, setEditingReport] = useState<ExpenseReport | null>(null);
    const [selectedReport, setSelectedReport] = useState<ExpenseReport | null>(null);
    const [photos, setPhotos] = useState<{ id: string; name: string; mimeType?: string }[]>([]);
    const [photosLoading, setPhotosLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [isJustificatifsModalOpen, setIsJustificatifsModalOpen] = useState(false);
    const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);
    const [validatingReport, setValidatingReport] = useState<ExpenseReport | null>(null);

    const userRoles = session?.user?.roles || [];
    const isManager = userRoles.includes('SUPER_ADMIN') || userRoles.includes('PRESIDENT');
    const isTresorier = userRoles.includes('TRESORIER');
    const canPay = userRoles.includes('TRESORIER') || userRoles.includes('SUPER_ADMIN');

    const {
        reports,
        loading,
        tableLoading,
        viewScope,
        setViewScope,
        includeProcessed,
        setIncludeProcessed,
        fetchReports,
    } = useExpenseReports(status, isManager, isTresorier);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    // Fetch photos for selected report — annule la requête précédente pour éviter
    // qu'une réponse tardive n'écrase les photos du rapport nouvellement sélectionné.
    useEffect(() => {
        if (selectedReport?.driveFolderId) {
            setPhotosLoading(true);
            setPhotos([]);
            const controller = new AbortController();
            fetch(`/api/drive/photos?folderId=${selectedReport.driveFolderId}&flat=true`, { signal: controller.signal })
                .then(res => { if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`); return res.json(); })
                .then(data => {
                    if (data.photos) {
                        setPhotos(data.photos);
                    }
                })
                .catch(err => { if (err.name !== 'AbortError') console.error('Failed to fetch photos', err); })
                .finally(() => setPhotosLoading(false));
            return () => controller.abort();
        } else {
            setPhotos([]);
        }
    }, [selectedReport]);

    const openValidateModal = (report: ExpenseReport) => {
        setValidatingReport(report);
    };

    const confirmValidate = async (sigData?: SignatureData) => {
        if (!validatingReport) return;

        const id = validatingReport.id;
        setActionLoading(id);
        try {
            const res = await fetch(`/api/expenses/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'validate',
                    validatorSignature: sigData || null,
                })
            });
            if (res.ok) {
                const data = await res.json();
                fetchReports();
                if (selectedReport?.id === id) {
                    setSelectedReport(prev => prev ? {
                        ...prev,
                        status: data.status || 'traité',
                        validatorName: session?.user?.name || ''
                    } : null);
                }
                setValidatingReport(null);
            } else {
                const err = await res.json();
                alert(err.error || 'Erreur lors de la validation.');
            }
        } catch (error) {
            console.error(error);
            alert('Erreur réseau.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (id: string) => {
        const comment = prompt('Veuillez indiquer le motif du refus de cette note de frais :');
        if (comment === null) return; // Annulé par l'utilisateur
        if (!comment.trim()) {
            alert('Le commentaire est obligatoire pour refuser une note de frais.');
            return;
        }

        setActionLoading(id);
        try {
            const res = await fetch(`/api/expenses/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reject', rejectionComment: comment })
            });
            if (res.ok) {
                fetchReports();
                if (selectedReport?.id === id) {
                    setSelectedReport(prev => prev ? {
                        ...prev,
                        status: 'refusé',
                        rejectionComment: comment.trim(),
                        rejectorName: session?.user?.name || ''
                    } : null);
                }
            } else {
                const err = await res.json();
                alert(err.error || 'Erreur lors du refus.');
            }
        } catch (error) {
            console.error(error);
            alert('Erreur réseau.');
        } finally {
            setActionLoading(null);
        }
    };

    const handlePay = async (id: string) => {
        if (!confirm('Voulez-vous indiquer cette note de frais comme payée ?')) return;
        setActionLoading(id);
        try {
            const res = await fetch(`/api/expenses/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'pay' })
            });
            if (res.ok) {
                fetchReports();
                if (selectedReport?.id === id) {
                    setSelectedReport(prev => prev ? {
                        ...prev,
                        status: 'traité',
                        payerName: session?.user?.name || ''
                    } : null);
                }
            } else {
                const err = await res.json();
                alert(err.error || 'Erreur lors du paiement.');
            }
        } catch (error) {
            console.error(error);
            alert('Erreur réseau.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleSubmitDraft = async (id: string) => {
        if (!confirm('Voulez-vous vraiment soumettre cette note de frais ?')) return;
        setActionLoading(id);
        try {
            const res = await fetch(`/api/expenses/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'submit' })
            });
            if (res.ok) {
                fetchReports();
            } else {
                const err = await res.json();
                alert(err.error || 'Erreur lors de la soumission.');
            }
        } catch (error) {
            console.error(error);
            alert('Erreur réseau.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Voulez-vous vraiment supprimer cette note de frais ?')) return;
        setActionLoading(id);
        try {
            const res = await fetch(`/api/expenses/${id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchReports();
                if (selectedReport?.id === id) {
                    setSelectedReport(null);
                }
            } else {
                const err = await res.json();
                alert(err.error || 'Erreur lors de la suppression.');
            }
        } catch (error) {
            console.error(error);
            alert('Erreur réseau.');
        } finally {
            setActionLoading(null);
        }
    };

    if (status === 'loading' || loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <div style={{ fontSize: '1.25rem', color: 'var(--text-secondary)' }}>Chargement des notes de frais...</div>
            </div>
        );
    }

    return (
        <div className="expenses-container">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        Notes de frais
                    </h1>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        {isManager
                            ? 'Gérer, valider et refuser les notes de frais de l\'Unité Locale.'
                            : isTresorier
                            ? 'Consulter les notes en attente de paiement et effectuer les règlements.'
                            : 'Suivez et soumettez vos notes de frais.'}
                    </p>
                </div>
                {!isCreating && (
                    <button
                        onClick={() => setIsCreating(true)}
                        className="btn btn-primary"
                        style={{ gap: '8px', whiteSpace: 'nowrap' }}
                    >
                        <Plus size={16} /> Nouvelle note de frais
                    </button>
                )}
            </div>

            {/* Scope & Filter Toggles for Managers & Tresorier */}
            {(isManager || isTresorier) && !isCreating && (
                <ExpensesFilters
                    isManager={isManager}
                    viewScope={viewScope}
                    setViewScope={setViewScope}
                    includeProcessed={includeProcessed}
                    setIncludeProcessed={setIncludeProcessed}
                />
            )}

            {isCreating ? (
                <ExpenseForm
                    initialData={editingReport || undefined}
                    onClose={() => {
                        setIsCreating(false);
                        setEditingReport(null);
                    }}
                    onSuccess={() => {
                        setIsCreating(false);
                        setEditingReport(null);
                        fetchReports();
                        if (selectedReport && editingReport && selectedReport.id === editingReport.id) {
                            setSelectedReport(null);
                        }
                    }}
                />
            ) : (
                <div className={`expenses-grid ${selectedReport ? 'has-selected' : ''}`}>
                    <ExpensesTable
                        reports={reports}
                        tableLoading={tableLoading}
                        isManager={isManager}
                        isTresorier={isTresorier}
                        canPay={canPay}
                        actionLoading={actionLoading}
                        currentUserId={session?.user?.id}
                        selectedReportId={selectedReport?.id}
                        onSelectReport={setSelectedReport}
                        onEditDraft={(report) => {
                            setEditingReport(report);
                            setIsCreating(true);
                        }}
                        onSubmitDraft={handleSubmitDraft}
                        onDelete={handleDelete}
                        onOpenValidate={openValidateModal}
                        onReject={handleReject}
                        onPay={handlePay}
                    />

                    {selectedReport && (
                        <ExpenseDetailSidebar
                            report={selectedReport}
                            isManager={isManager}
                            canPay={canPay}
                            currentUserId={session?.user?.id}
                            actionLoading={actionLoading}
                            photos={photos}
                            photosLoading={photosLoading}
                            onClose={() => setSelectedReport(null)}
                            onOpenValidate={openValidateModal}
                            onReject={handleReject}
                            onPay={handlePay}
                            onSubmitDraft={handleSubmitDraft}
                            onDelete={handleDelete}
                            onEditDraft={(report) => {
                                setEditingReport(report);
                                setIsCreating(true);
                            }}
                            onViewAllPhotos={() => setIsJustificatifsModalOpen(true)}
                        />
                    )}
                </div>
            )}

            {/* Modale Yousign Signature du Valideur */}
            {validatingReport && (
                <YousignSignatureModal
                    isOpen={Boolean(validatingReport)}
                    onClose={() => setValidatingReport(null)}
                    onSign={(sigData) => {
                        confirmValidate(sigData);
                    }}
                    signerName={session?.user?.name || 'Président / Responsable'}
                    signerEmail={session?.user?.email || ''}
                    roleTitle="Responsable / Valideur"
                    initialFunction="Président local"
                    loading={actionLoading === validatingReport.id}
                />
            )}

            {/* Modale d'affichage des justificatifs (photos & PDF) */}
            {isJustificatifsModalOpen && selectedReport && (
                <JustificatifsModal
                    photos={photos}
                    onClose={() => setIsJustificatifsModalOpen(false)}
                    onImageClick={setActiveLightboxImage}
                />
            )}

            {/* Lightbox photo en plein écran */}
            {activeLightboxImage && (
                <PhotoLightbox imageUrl={activeLightboxImage} onClose={() => setActiveLightboxImage(null)} />
            )}
        </div>
    );
}
