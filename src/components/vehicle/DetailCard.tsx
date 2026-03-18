import React from 'react';

export interface DetailCardProps {
    title: React.ReactNode;
    value: React.ReactNode;
    subtitle?: React.ReactNode;
    backgroundColor?: string;
    borderColor?: string;
    titleColor?: string;
    valueStyle?: React.CSSProperties;
    onEdit?: () => void;
    /** Called when the card itself is clicked (makes the card interactive) */
    onClick?: () => void;
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
    onEdit,
    onClick,
    children
}: DetailCardProps) {
    return (
        <div
            className="detail-card"
            style={{
                background: backgroundColor || 'var(--bg-card)',
                border: borderColor ? `1px solid ${borderColor}` : '1px solid var(--border-primary)',
                cursor: onClick ? 'pointer' : undefined,
            }}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
        >
            <div className="detail-card-title" style={{ color: titleColor, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {title}
                {onEdit && (
                    <button
                        onClick={onEdit}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Modifier manuellement"
                        aria-label="Modifier manuellement"
                    >
                        ✏️
                    </button>
                )}
            </div>
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
