import React, { useState, useEffect } from 'react';
import { ChecklistItemType } from './ChecklistManager';

interface ChecklistItemsProps {
    vehicleId: string;
    type: 'checkout' | 'checkin';
    responses: Record<string, boolean>;
    onChange: (responses: Record<string, boolean>) => void;
}

/**
 * Renders the custom checklist for a vehicle in the CheckOut/CheckIn modals.
 * Blocks form submission if a required item is not checked (using native HTML5 validation).
 */
export default function ChecklistItems({ vehicleId, type, responses, onChange }: ChecklistItemsProps) {
    const [items, setItems] = useState<ChecklistItemType[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        async function fetchItems() {
            try {
                const res = await fetch(`/api/vehicles/${vehicleId}/checklist?type=${type}`);
                if (!res.ok) throw new Error();
                const data: ChecklistItemType[] = await res.json();
                if (mounted) {
                    setItems(data);
                    // Initialize missing responses with false
                    const newResponses = { ...responses };
                    let changed = false;
                    data.forEach(item => {
                        if (newResponses[item.id] === undefined) {
                            newResponses[item.id] = false;
                            changed = true;
                        }
                    });
                    if (changed) onChange(newResponses);
                }
            } catch (error) {
                console.error('Failed to fetch checklist items', error);
            } finally {
                if (mounted) setLoading(false);
            }
        }
        fetchItems();
        return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- responses/onChange omitted intentionally: including them causes infinite re-fetch loop since onChange updates responses on every render
    }, [vehicleId, type]);

    if (loading || items.length === 0) return null;

    return (
        <div style={{ marginTop: 24, marginBottom: 8 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Vérifications supplémentaires
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(item => (
                    <label
                        key={item.id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            cursor: 'pointer',
                            padding: '10px 14px',
                            background: 'var(--bg-card)',
                            borderRadius: 'var(--radius-sm)',
                            border: `1px solid ${responses[item.id] && item.required ? 'rgba(34, 197, 94, 0.4)' : 'var(--border-primary)'}`
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={responses[item.id] || false}
                            onChange={(e) => onChange({ ...responses, [item.id]: e.target.checked })}
                            required={item.required}
                            style={{ width: 18, height: 18, accentColor: 'var(--crf-red)' }}
                        />
                        <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>
                            {item.label}
                            {item.required && <span style={{ color: '#EF4444', marginLeft: 4 }}>*</span>}
                        </span>
                    </label>
                ))}
            </div>
        </div>
    );
}
