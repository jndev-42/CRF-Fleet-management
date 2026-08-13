'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
  Area,
  AreaChart,
} from 'recharts';
import { StatsData } from './types';

const PIE_COLORS = ['#E30613', '#F59E0B', '#22C55E', '#3B82F6', '#8B5CF6'];

interface ChartsSectionProps {
  byDriver: StatsData['byDriver'];
  kmOverTime: StatsData['kmOverTime'];
  byMissionType: StatsData['byMissionType'];
}

function getFirstName(fullName: string): string {
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) return parts[0];
  // Return initials style: "M. Dupont"
  return `${parts[0].charAt(0)}. ${parts.slice(1).join(' ')}`;
}

export default function ChartsSection({ byDriver, kmOverTime, byMissionType }: ChartsSectionProps) {
  const barData = byDriver.map((d) => ({
    name: getFirstName(d.driverName),
    Emprunts: d.tripCount,
  }));

  const pieData = byMissionType.map((m) => ({
    name: m.missionType,
    value: m.count,
  }));

  const lineData = kmOverTime.map((w) => ({
    week: w.week.replace(/^\d{4}-/, '').replace(/^W/, 'S.'),
    Km: w.km,
  }));

  return (
    <div className="charts-grid">
      {/* Bar Chart: emprunts par chauffeur */}
      <div className="chart-card">
        <div className="chart-title">Emprunts par chauffeur</div>
        <div className="chart-sub">Nombre de sorties sur la période</div>
        {barData.length === 0 ? (
          <div className="chart-empty">Aucune donnée</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  fontSize: 12,
                }}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar dataKey="Emprunts" fill="var(--crf-red)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Pie Chart: répartition par type de mission */}
      <div className="chart-card">
        <div className="chart-title">Répartition par type de mission</div>
        <div className="chart-sub">Toutes sorties confondues</div>
        {pieData.length === 0 ? (
          <div className="chart-empty">Aucune donnée</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="45%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {pieData.map((_, idx) => (
                  <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  fontSize: 12,
                }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)', paddingTop: 4 }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Line Chart: km par semaine — full width */}
      <div className="chart-card chart-card-full">
        <div className="chart-title">Kilomètres parcourus par semaine</div>
        <div className="chart-sub">Évolution sur la période sélectionnée</div>
        {lineData.length === 0 ? (
          <div className="chart-empty">Aucune donnée</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={lineData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="kmGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--crf-red)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--crf-red)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="week"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  fontSize: 12,
                }}
                cursor={{ stroke: 'var(--border-hover)' }}
              />
              <Area
                type="monotone"
                dataKey="Km"
                stroke="var(--crf-red)"
                strokeWidth={2.5}
                fill="url(#kmGradient)"
                dot={false}
                activeDot={{ r: 4, fill: 'var(--crf-red)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
