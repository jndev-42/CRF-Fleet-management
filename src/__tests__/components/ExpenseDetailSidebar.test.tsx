import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import ExpenseDetailSidebar from '@/app/expenses/ExpenseDetailSidebar';
import type { ExpenseReport } from '@/app/expenses/types';

function makeReport(overrides: Partial<ExpenseReport> = {}): ExpenseReport {
    return {
        id: 'exp-1', userId: 'u-owner', userName: 'Jean Demandeur', userEmail: 'jean@test.com',
        submittedAt: '2026-10-20T10:00:00Z', missionName: 'Maraude', missionDate: '2026-10-19',
        status: 'soumis', imputation: 'DLUS', customImputation: null, requestRefund: true,
        noReceiptDeclaration: false, driveFolderId: null, pendingReceiptKeys: [], total: 25,
        items: [{ label: 'Péage', amount: 25, budgetId: 'b-1' }], ulId: 'ul-paris-18',
        validatedAt: null, validatedBy: null, validatorName: null,
        rejectionComment: null, rejectedAt: null, rejectedBy: null, rejectorName: null,
        paidAt: null, paidBy: null, payerName: null, createdAt: '2026-10-20T10:00:00Z',
        workflowVersion: 2,
        ...overrides,
    };
}

function renderSidebar(report: ExpenseReport, userRoles: string[], currentUserId = 'u-viewer') {
    const onOpenValidate = vi.fn();
    const onReject = vi.fn();
    render(
        <ExpenseDetailSidebar
            report={report}
            userRoles={userRoles}
            canPay={false}
            currentUserId={currentUserId}
            actionLoading={null}
            photos={[]}
            photosLoading={false}
            onClose={vi.fn()}
            onOpenValidate={onOpenValidate}
            onReject={onReject}
            onPay={vi.fn()}
            onSubmitDraft={vi.fn()}
            onDelete={vi.fn()}
            onEditDraft={vi.fn()}
            onViewAllPhotos={vi.fn()}
        />
    );
    return { onOpenValidate, onReject };
}

describe('ExpenseDetailSidebar — circuit RESPO puis président', () => {
    it('RESPO sur une note soumise : « Valider » et « Refuser »', () => {
        const report = makeReport();
        const { onOpenValidate, onReject } = renderSidebar(report, ['RESPO']);

        fireEvent.click(screen.getByRole('button', { name: /^Valider$/ }));
        expect(onOpenValidate).toHaveBeenCalledWith(report);
        fireEvent.click(screen.getByRole('button', { name: /Refuser/ }));
        expect(onReject).toHaveBeenCalledWith('exp-1');
    });

    it('président sur une note soumise : « Signer pour le responsable et valider »', () => {
        renderSidebar(makeReport(), ['PRESIDENT']);
        expect(screen.getByRole('button', { name: /Signer pour le responsable et valider/ })).toBeTruthy();
    });

    it('président sur une note validée par le responsable : « Valider »', () => {
        renderSidebar(makeReport({ status: 'valide_respo' }), ['PRESIDENT']);
        expect(screen.getByRole('button', { name: /^Valider$/ })).toBeTruthy();
    });

    it('RESPO à l\'étape président : aucune action', () => {
        renderSidebar(makeReport({ status: 'valide_respo' }), ['RESPO']);
        expect(screen.queryByRole('button', { name: /Valider/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Refuser/ })).toBeNull();
    });

    it('note héritée (v1) : le RESPO ne voit aucune action', () => {
        const legacy = makeReport({ workflowVersion: 1 });
        renderSidebar(legacy, ['RESPO']);
        expect(screen.queryByRole('button', { name: /Valider/ })).toBeNull();
    });

    it('note héritée (v1) : le président valide en une étape', () => {
        renderSidebar(makeReport({ workflowVersion: 1 }), ['PRESIDENT']);
        expect(screen.getByRole('button', { name: /^Valider$/ })).toBeTruthy();
    });

    it('jamais d\'action sur sa propre note (D2)', () => {
        renderSidebar(makeReport({ userId: 'u-viewer' }), ['RESPO'], 'u-viewer');
        expect(screen.queryByRole('button', { name: /Valider/ })).toBeNull();
    });

    it('affiche le badge et le responsable qui a validé', () => {
        renderSidebar(makeReport({
            status: 'valide_respo', respoValidatedAt: '2026-10-21T09:00:00Z', respoValidatorName: 'Rita Respo',
        }), ['CHVL']);
        expect(screen.getAllByText('Validée par le responsable').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Rita Respo')).toBeTruthy();
        expect(screen.getByTestId('respo-info').textContent).toMatch(/en attente de la validation du président/);
    });

    it('bloc d\'information : note v2 soumise en attente du responsable', () => {
        renderSidebar(makeReport(), ['CHVL']);
        expect(screen.getByTestId('respo-info').textContent).toMatch(/responsable d'activité/);
    });

    it('aucun bloc d\'information sur une note héritée', () => {
        renderSidebar(makeReport({ workflowVersion: 1 }), ['CHVL']);
        expect(screen.queryByTestId('respo-info')).toBeNull();
    });
});
