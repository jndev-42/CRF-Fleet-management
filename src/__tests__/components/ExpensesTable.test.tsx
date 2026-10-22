import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import ExpensesTable from '@/app/expenses/ExpensesTable';
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

function renderTable(report: ExpenseReport, userRoles: string[], currentUserId = 'u-viewer') {
    const onOpenValidate = vi.fn();
    const onReject = vi.fn();
    render(
        <ExpensesTable
            reports={[report]}
            tableLoading={false}
            isManager
            isTresorier={false}
            canPay={false}
            userRoles={userRoles}
            actionLoading={null}
            currentUserId={currentUserId}
            selectedReportId={undefined}
            onSelectReport={vi.fn()}
            onEditDraft={vi.fn()}
            onSubmitDraft={vi.fn()}
            onDelete={vi.fn()}
            onOpenValidate={onOpenValidate}
            onReject={onReject}
            onPay={vi.fn()}
        />
    );
    return { onOpenValidate, onReject };
}

describe('ExpensesTable — actions de validation par ligne', () => {
    it('président sur une note validée par le responsable : « Valider » et « Refuser »', () => {
        const report = makeReport({ status: 'valide_respo' });
        const { onOpenValidate, onReject } = renderTable(report, ['PRESIDENT']);

        fireEvent.click(screen.getByTitle('Valider'));
        expect(onOpenValidate).toHaveBeenCalledWith(report);
        fireEvent.click(screen.getByTitle('Refuser'));
        expect(onReject).toHaveBeenCalledWith('exp-1');
    });

    it('président sur une note v2 soumise : libellé de signature combinée', () => {
        renderTable(makeReport(), ['PRESIDENT']);
        expect(screen.getByTitle('Signer pour le responsable et valider')).toBeTruthy();
    });

    it('RESPO sur sa propre note : aucune action (D2)', () => {
        renderTable(makeReport({ userId: 'u-viewer' }), ['RESPO']);
        expect(screen.queryByTitle('Valider')).toBeNull();
        expect(screen.queryByTitle('Refuser')).toBeNull();
    });

    it('RESPO sur une note héritée (v1) : aucune action', () => {
        renderTable(makeReport({ workflowVersion: 1 }), ['RESPO']);
        expect(screen.queryByTitle('Valider')).toBeNull();
        expect(screen.queryByTitle('Refuser')).toBeNull();
    });

    it('RESPO sur une note v2 soumise d\'un autre membre : « Valider »', () => {
        renderTable(makeReport(), ['RESPO']);
        expect(screen.getByTitle('Valider')).toBeTruthy();
    });
});
