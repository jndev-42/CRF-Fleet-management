'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import ElectronicSignatureModal, { SignatureData } from '@/components/expenses/ElectronicSignatureModal';
import ExpenseBudgetsModal from '@/components/expenses/ExpenseBudgetsModal';
import ExpensesHeader from './ExpensesHeader';
import ExpensesFilters from './ExpensesFilters';
import ExpensesTable from './ExpensesTable';
import ExpenseDetailSidebar from './ExpenseDetailSidebar';
import { useExpenseReports } from './useExpenseReports';
import { signingActionFor, canCreateExpense } from './utils';
import type { ExpenseReport } from './types';
import { isExpenseManager, canValidateExpenseAsRespo, canPayExpense, isTresorier as isTresorierRole } from '@/lib/roles';

export default function ExpensesPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [isCreating, setIsCreating] = useState(false);
    const [editingReport, setEditingReport] = useState<ExpenseReport | null>(null);
    const [selectedReport, setSelectedReport] = useState<ExpenseReport | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [isBudgetsModalOpen, setIsBudgetsModalOpen] = useState(false);
    /**
     * Contexte de signature unifié pour les trois actions signées.
     *
     * Un seul état plutôt que trois parallèles : validation, refus et paiement
     * exigent désormais tous une signature manuscrite, et n'en diffèrent que par
     * le libellé, le rôle et la charge utile envoyée.
     */
    const [signingContext, setSigningContext] = useState<{
        report: ExpenseReport;
        kind: 'validate' | 'reject' | 'pay';
        rejectionComment?: string;
        /** Signature à l'étape « responsable d'activité » par un RESPO (pas le président). */
        asRespo?: boolean;
    } | null>(null);

    const userRoles = session?.user?.roles || [];
    const isManager = isExpenseManager(userRoles);
    // Responsable d'activité sans rôle de président : voit les notes de l'UL à valider.
    const isRespo = !isManager && canValidateExpenseAsRespo(userRoles);
    const seesUlReports = isManager || isRespo;
    const isTresorier = isTresorierRole(userRoles);
    const canPay = canPayExpense(userRoles);
    const canCreate = canCreateExpense(userRoles);

    const {
        reports,
        loading,
        tableLoading,
        viewScope,
        setViewScope,
        includeProcessed,
        setIncludeProcessed,
        fetchReports,
    } = useExpenseReports(status, seesUlReports, isTresorier);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    /** Signature à l'étape RESPO par un RESPO — le libellé de la modale en dépend. */
    const signsAsRespo = (report: ExpenseReport) => {
        const action = signingActionFor(report, userRoles, session?.user?.id);
        return action?.stage === 'respo' && !action.combined;
    };

    const openValidateModal = (report: ExpenseReport) => {
        setSigningContext({ report, kind: 'validate', asRespo: signsAsRespo(report) });
    };

    /** Envoie l'action signée correspondant au contexte courant. */
    const confirmSigned = async (sigData: SignatureData) => {
        if (!signingContext) return;
        const { report, kind, rejectionComment } = signingContext;
        const id = report.id;

        // Le serveur exige la signature pour les trois actions : elle est apposée
        // sur le PDF puis scellée cryptographiquement.
        const payload: Record<string, unknown> = { action: kind };
        if (kind === 'validate') payload.validatorSignature = sigData;
        if (kind === 'reject') { payload.validatorSignature = sigData; payload.rejectionComment = rejectionComment; }
        if (kind === 'pay') payload.payerSignature = sigData;

        setActionLoading(id);
        try {
            const res = await fetch(`/api/expenses/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                const data = await res.json();
                fetchReports();
                if (selectedReport?.id === id) {
                    setSelectedReport(prev => {
                        if (!prev) return null;
                        if (kind === 'validate' && data.status === 'valide_respo') {
                            return { ...prev, status: 'valide_respo', respoValidatedAt: new Date().toISOString(), respoValidatorName: session?.user?.name || '' };
                        }
                        if (kind === 'validate') {
                            const signedName = session?.user?.name || '';
                            // Signature combinée : le président a aussi signé l'étape RESPO.
                            const combined = prev.workflowVersion === 2 && prev.status === 'soumis';
                            return {
                                ...prev, status: data.status || 'traité', validatorName: signedName,
                                ...(combined ? { respoValidatedAt: new Date().toISOString(), respoValidatorName: signedName } : {}),
                            };
                        }
                        if (kind === 'reject') return { ...prev, status: 'refusé', rejectionComment: rejectionComment?.trim() || '', rejectorName: session?.user?.name || '' };
                        return { ...prev, status: 'traité', payerName: session?.user?.name || '' };
                    });
                }
                setSigningContext(null);
            } else {
                const err = await res.json();
                alert(err.error || 'Erreur lors de l\'opération.');
            }
        } catch (error) {
            console.error(error);
            alert('Erreur réseau.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = (id: string) => {
        const comment = prompt('Veuillez indiquer le motif du refus de cette note de frais :');
        if (comment === null) return; // Annulé par l'utilisateur
        if (!comment.trim()) {
            alert('Le commentaire est obligatoire pour refuser une note de frais.');
            return;
        }
        const report = reports.find(r => r.id === id);
        if (!report) return;
        // Le refus est un événement SIGNÉ qui clôt définitivement le document :
        // on demande la signature après le motif.
        setSigningContext({ report, kind: 'reject', rejectionComment: comment, asRespo: signsAsRespo(report) });
    };

    const handlePay = (id: string) => {
        const report = reports.find(r => r.id === id);
        if (!report) return;
        // Le paiement est scellé cryptographiquement lui aussi, mais sa signature
        // n'apparaît PAS visuellement sur le PDF — seulement au panneau Signatures.
        setSigningContext({ report, kind: 'pay' });
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
            <ExpensesHeader
                userRoles={userRoles}
                isManager={seesUlReports}
                isTresorier={isTresorier}
                showCreateButton={!isCreating && canCreate}
                onCreate={() => setIsCreating(true)}
                onManageBudgets={() => setIsBudgetsModalOpen(true)}
            />

            {/* Scope & Filter Toggles for Managers & Tresorier */}
            {(seesUlReports || isTresorier) && !isCreating && (
                <ExpensesFilters
                    isManager={seesUlReports}
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
                        isManager={seesUlReports}
                        isTresorier={isTresorier}
                        canPay={canPay}
                        userRoles={userRoles}
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
                            userRoles={userRoles}
                            canPay={canPay}
                            currentUserId={session?.user?.id}
                            actionLoading={actionLoading}
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
                        />
                    )}
                </div>
            )}

            {/* Modale de signature — validation, refus ou paiement */}
            {signingContext && (
                <ElectronicSignatureModal
                    isOpen
                    onClose={() => setSigningContext(null)}
                    onSign={confirmSigned}
                    signerName={session?.user?.name || 'Responsable'}
                    signerEmail={session?.user?.email || ''}
                    roleTitle={
                        signingContext.kind === 'pay' ? 'Trésorier / Payeur'
                        : signingContext.asRespo ? 'Responsable d\'activité'
                        : 'Président / Valideur'
                    }
                    initialFunction={
                        signingContext.kind === 'pay' ? 'Trésorier'
                        : signingContext.asRespo ? 'Responsable d\'activité'
                        : 'Président local'
                    }
                    actionVerb={
                        signingContext.kind === 'pay' ? 'marquer comme payée'
                        : signingContext.kind === 'reject' ? 'refuser'
                        : 'valider'
                    }
                    loading={actionLoading === signingContext.report.id}
                />
            )}

            {/* Modale de gestion des budgets analytiques de l'UL */}
            {isBudgetsModalOpen && (
                <ExpenseBudgetsModal onClose={() => setIsBudgetsModalOpen(false)} />
            )}
        </div>
    );
}
