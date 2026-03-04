import React from 'react';

export interface DetailCardProps {
    title: React.ReactNode;
    value: React.ReactNode;
    subtitle?: React.ReactNode;
    backgroundColor?: string;
    borderColor?: string;
    titleColor?: string;
    valueStyle?: React.CSSProperties;
    children?: React.ReactNode; // For additional elements like fuel bars
}

/**
 * A reusable small UI card element to display a metric and its value.
 */
export default function DetailCard({
    title,
    value,
    subtitle,
    backgroundColor,
    borderColor,
    titleColor,
    valueStyle,
    children
}: DetailCardProps) {
    return (
        <div
            className="detail-card"
            style={{
                background: backgroundColor || 'var(--bg-card)',
                border: borderColor ? `1px solid ${borderColor}` : '1px solid var(--border-primary)'
            }}
        >
            <div className="detail-card-title" style={{ color: titleColor }}>{title}</div>
            <div className="detail-card-value" style={valueStyle}>{value}</div>
            {subtitle && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {subtitle}
                </div>
            )}
            {children}
        </div>
    );
}
