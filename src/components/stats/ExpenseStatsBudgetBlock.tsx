'use client';

import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import type { ExpenseStatsDataResult } from '@/lib/stats-expenses';
import { COLORS } from './colors';

interface ExpenseStatsBudgetBlockProps {
  byBudget: ExpenseStatsDataResult['byBudget'];
}

/**
 * Restitution des dépenses par budget analytique : camembert de répartition et
 * tableau détaillé.
 *
 * Composant d'affichage pur — aucun fetch, toute la donnée arrive en props.
 * Toutes les couleurs viennent soit de la palette partagée `COLORS`, soit des
 * variables CSS du thème : aucune couleur littérale ici, sans quoi le mode
 * sombre casserait.
 */
export default function ExpenseStatsBudgetBlock({ byBudget }: ExpenseStatsBudgetBlockProps) {
  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-primary)',
        padding: '20px',
        marginTop: '12px',
      }}
    >
      <h3 style={{ margin: '0 0 16px 0', fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
        Répartition par budget
      </h3>

      {byBudget.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Aucune ligne de dépense sur cette période</div>
        </div>
      ) : (
        <>
          <div style={{ width: '100%', height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byBudget}
                  dataKey="amount"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={45}
                  paddingAngle={3}
                  label={(entry: { name?: string; amount?: number; value?: number }) =>
                    `${entry.name || ''}: ${Number(entry.amount || entry.value || 0).toFixed(0)}€`
                  }
                >
                  {byBudget.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: unknown) => [
                    typeof value === 'number' ? `${value.toFixed(2)} €` : `${value ?? 0} €`,
                    'Montant',
                  ]}
                  contentStyle={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '8px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--border-primary)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                  }}
                >
                  <th style={{ padding: '12px 16px' }}>Budget</th>
                  {/* « Lignes » et non « Notes » : byBudget.count compte des lignes de
                      dépense, là où le tableau par imputation compte des notes. */}
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Lignes</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Montant</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Part %</th>
                </tr>
              </thead>
              <tbody>
                {byBudget.map((budget, index) => (
                  <tr key={budget.budgetId ?? `na-${index}`} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{budget.name}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>{budget.count}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {budget.amount.toFixed(2)} €
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {budget.percentOfTotal} %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
