'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { DollarSign, CheckCircle, Clock, Receipt, FileText, AlertCircle } from 'lucide-react';
import { ExpenseStatsDataResult } from '@/lib/stats';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';

interface ExpenseStatsSectionProps {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (val: string) => void;
  onDateToChange: (val: string) => void;
}

const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function ExpenseStatsSection({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: ExpenseStatsSectionProps) {
  const [data, setData] = useState<ExpenseStatsDataResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imputationFilter, setImputationFilter] = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
      });
      if (imputationFilter) {
        params.set('imputation', imputationFilter);
      }

      const res = await fetch(`/api/stats/expenses?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Erreur lors du chargement des statistiques des notes de frais');
        setData(null);
      } else {
        setData(json.data);
      }
    } catch (err) {
      console.error(err);
      setError('Erreur réseau');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, imputationFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Filters bar */}
      <div className="stats-filters-bar" style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="stats-filter-label" style={{ fontWeight: 600 }}>Période</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="date"
            className="stats-date-input"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
          />
          <span className="stats-filter-sep">→</span>
          <input
            type="date"
            className="stats-date-input"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
          />
        </div>

        <select
          className="stats-date-input"
          value={imputationFilter}
          onChange={(e) => setImputationFilter(e.target.value)}
          aria-label="Filtrer par imputation"
        >
          <option value="">Toutes les imputations</option>
          <option value="DLUS">DLUS</option>
          <option value="DLAS">DLAS</option>
          <option value="UL">UL</option>
          <option value="Autre">Autre</option>
        </select>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="stats-skeleton-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="kpi-card">
              <div className="skel" style={{ width: 36, height: 36, borderRadius: 8 }} />
              <div className="skel" style={{ width: '60%', height: 10 }} />
              <div className="skel" style={{ width: '40%', height: 28 }} />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="empty-state">
          <div className="empty-state-icon">⚠️</div>
          <div className="empty-state-title">{error}</div>
        </div>
      )}

      {/* Data display */}
      {data && !loading && (
        <>
          {/* KPI Cards */}
          <div className="kpi-grid">
            <div className="kpi-card" style={{ borderLeft: '4px solid var(--red-primary, #ef4444)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="kpi-title">Total des dépenses</span>
                <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                  <DollarSign size={20} />
                </div>
              </div>
              <div className="kpi-value">{data.global.totalExpensesAmount.toFixed(2)} €</div>
              <div className="kpi-sub">
                Moyenne par note : <strong>{data.global.avgReportAmount.toFixed(2)} €</strong>
              </div>
            </div>

            <div className="kpi-card" style={{ borderLeft: '4px solid #22c55e' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="kpi-title">Remboursé / Payé</span>
                <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
                  <CheckCircle size={20} />
                </div>
              </div>
              <div className="kpi-value">{data.global.totalRefundedAmount.toFixed(2)} €</div>
              <div className="kpi-sub" style={{ color: '#22c55e' }}>
                Notes traitées et comptabilisées
              </div>
            </div>

            <div className="kpi-card" style={{ borderLeft: '4px solid #f97316' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="kpi-title">En attente de paiement</span>
                <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(249, 115, 22, 0.1)', color: '#f97316' }}>
                  <Clock size={20} />
                </div>
              </div>
              <div className="kpi-value">{data.global.totalPendingAmount.toFixed(2)} €</div>
              <div className="kpi-sub" style={{ color: '#f97316' }}>
                Soumis ou à régler
              </div>
            </div>

            <div className="kpi-card" style={{ borderLeft: '4px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="kpi-title">Nombre de notes</span>
                <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                  <Receipt size={20} />
                </div>
              </div>
              <div className="kpi-value">{data.global.reportsCount}</div>
              <div className="kpi-sub">
                Total des demandes saisies
              </div>
            </div>
          </div>

          {data.global.reportsCount === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🧾</div>
              <div className="empty-state-title">Aucune note de frais sur cette période</div>
              <p>Modifiez la plage de dates pour consulter les statistiques.</p>
            </div>
          ) : (
            <>
              {/* Charts Grid */}
              <div className="charts-grid">
                {/* Monthly evolution */}
                <div className="chart-card">
                  <h3 className="chart-title">Évolution mensuelle des dépenses (€)</h3>
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.byMonth} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="label" stroke="var(--text-secondary)" fontSize={12} />
                        <YAxis stroke="var(--text-secondary)" fontSize={12} unit="€" />
                        <Tooltip
                          formatter={(value: any) => [
                            typeof value === 'number' ? `${value.toFixed(2)} €` : `${value ?? 0} €`,
                            'Montant',
                          ]}
                          contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: '8px' }}
                        />
                        <Bar dataKey="amount" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Imputation Distribution */}
                <div className="chart-card">
                  <h3 className="chart-title">Répartition par imputation</h3>
                  <div style={{ width: '100%', height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.byImputation}
                          dataKey="amount"
                          nameKey="imputation"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          innerRadius={45}
                          paddingAngle={3}
                          label={(entry) => `${entry.imputation}: ${entry.amount.toFixed(0)}€`}
                        >
                          {data.byImputation.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: any) => [
                            typeof value === 'number' ? `${value.toFixed(2)} €` : `${value ?? 0} €`,
                            'Montant',
                          ]}
                          contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: '8px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Volunteers Expense Breakdown Table */}
              <div style={{
                background: 'var(--bg-primary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-primary)',
                padding: '20px',
                marginTop: '12px'
              }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Dépenses par bénévole / demandeur
                </h3>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        <th style={{ padding: '12px 16px' }}>Demandeur</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center' }}>Nombre de notes</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total demandé</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total payé</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byUser.map((user) => (
                        <tr key={user.userId} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.userName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{user.userEmail}</div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>
                            {user.reportCount}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {user.totalAmount.toFixed(2)} €
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#22c55e' }}>
                            {user.paidAmount.toFixed(2)} €
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
