'use client';

export type UniformTab = 'borrow' | 'laundry' | 'loans' | 'manage';

const LABELS: Record<UniformTab, string> = {
    borrow: 'Emprunter',
    laundry: 'À laver',
    loans: 'Emprunts',
    manage: 'Gestion',
};

interface Props {
    tabs: UniformTab[];
    active: UniformTab;
    onSelect: (tab: UniformTab) => void;
}

/** Onglets de `/uniforms` — la liste visible est calculée par la page selon les rôles. */
export default function UniformTabs({ tabs, active, onSelect }: Props) {
    return (
        <div className="filters-bar" role="tablist" aria-label="Sections Uniformes">
            {tabs.map(tab => (
                <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={active === tab}
                    className={`filter-btn${active === tab ? ' active' : ''}`}
                    onClick={() => onSelect(tab)}
                >
                    {LABELS[tab]}
                </button>
            ))}
        </div>
    );
}
