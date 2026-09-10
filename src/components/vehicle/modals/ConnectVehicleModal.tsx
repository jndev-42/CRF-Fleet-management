import React, { useCallback, useEffect, useState } from 'react';
import { BRANDS, BRAND_LABELS, BRAND_ACCOUNT_LABELS, type Brand } from '@/lib/brands';
import { Link2, Loader2 } from 'lucide-react';
import type { RenaultVehicleData } from '@/lib/renault';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';

/** Charge utile de connexion renvoyée par `POST`/`PATCH /api/vehicles/[id]/connection`. */
export interface VehicleConnectionState {
    brand: string;
    vin: string;
    status: string;
    connectedAt: string;
}

/**
 * Table des marques, **dérivée de `src/lib/brands.ts`** : le rendu du formulaire est
 * piloté par cette table, jamais par un `if (brand === 'RENAULT')`.
 *
 * La dériver plutôt que de la recopier supprime la seconde source de vérité. La
 * documentation de `brands.ts` prescrivait « une entrée ici + une entrée `BRAND_FORMS`
 * côté UI » ; il n'y a désormais plus qu'un seul endroit à toucher, et une marque
 * ajoutée sans son entrée UI ne peut plus passer inaperçue.
 *
 * Seul le préfixe de VIN reste propre à l'UI : c'est un exemple de saisie, pas une
 * donnée métier. Un préfixe manquant dégrade proprement en libellé générique.
 */
const VIN_PLACEHOLDERS: Partial<Record<Brand, string>> = {
    RENAULT: 'VF1AB123456789012',
    PEUGEOT: 'VF3AB123456789012',
    CITROEN: 'VF7AB123456789012',
    DS: 'VR1AB123456789012',
    OPEL: 'W0VAB123456789012',
};

const BRAND_FORMS: Record<string, {
    label: string;
    accountLabel: string;
    vinPlaceholder: string;
    loginLabel: string;
}> = Object.fromEntries(
    BRANDS.map((brand) => [
        brand,
        {
            label: BRAND_LABELS[brand],
            accountLabel: `Compte ${BRAND_ACCOUNT_LABELS[brand]}`,
            vinPlaceholder: VIN_PLACEHOLDERS[brand] ? `ex: ${VIN_PLACEHOLDERS[brand]}` : 'ex: VF1AB123456789012',
            loginLabel: `Identifiant ${BRAND_ACCOUNT_LABELS[brand]} (e-mail)`,
        },
    ])
);

interface ConnectVehicleModalProps {
    /** UUID du véhicule — `vehicle.id`, JAMAIS `params.id` qui vaut le nom du véhicule. */
    vehicleId: string;
    initialVin?: string | null;
    mode: 'connect' | 'edit';
    onClose: () => void;
    onConnected: (p: { connection: VehicleConnectionState; data: RenaultVehicleData }) => void;
}

/**
 * Connecte un véhicule au compte constructeur de son UL.
 *
 * Le mot de passe ne transite qu'une fois, à la soumission : il est chiffré côté serveur et
 * n'est jamais renvoyé. Quand l'UL possède déjà un compte, le formulaire se réduit au VIN.
 */
export default function ConnectVehicleModal({
    vehicleId,
    initialVin,
    mode,
    onClose,
    onConnected,
}: ConnectVehicleModalProps) {
    useEscapeKey(onClose);

    const [brand, setBrand] = useState('RENAULT');
    const [vin, setVin] = useState(initialVin || '');
    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('');
    const [existingLogin, setExistingLogin] = useState<string | null>(null);
    const [loadingCredential, setLoadingCredential] = useState(true);
    const [useOtherAccount, setUseOtherAccount] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const form = BRAND_FORMS[brand];

    const loadCredential = useCallback(async () => {
        setLoadingCredential(true);
        try {
            const res = await fetch(`/api/brand-credentials?brand=${encodeURIComponent(brand)}`);
            if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
            const data = await res.json();
            setExistingLogin(data.credential?.login ?? null);
        } catch (e) {
            // Absence de compte connu : le formulaire complet reste la bonne dégradation.
            console.error('[vehicle-connection] lecture du compte de l\'UL impossible', e);
            setExistingLogin(null);
        } finally {
            setLoadingCredential(false);
        }
    }, [brand]);

    useEffect(() => {
        loadCredential();
    }, [loadCredential]);

    /** Compte de l'UL réutilisable : formulaire réduit au VIN. */
    const reuseAccount = existingLogin !== null && !useOtherAccount;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        // Aucun retry, aucune soumission concurrente : chaque tentative coûte un login Gigya
        // sur un compte constructeur unique et verrouillable (pré-mortem P3).
        if (submitting) return;
        setSubmitting(true);
        setError(null);

        const payload: Record<string, string> = { brand, vin: vin.trim().toUpperCase() };
        if (!reuseAccount) {
            payload.login = login.trim();
            payload.password = password;
        }

        try {
            const res = await fetch(`/api/vehicles/${vehicleId}/connection`, {
                method: mode === 'edit' ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
                // Message serveur affiché tel quel, modale ouverte, saisie conservée.
                throw new Error(data.error || 'Erreur lors de la connexion du véhicule');
            }
            onConnected({ connection: data.connection, data: data.data });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erreur lors de la connexion du véhicule');
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="connect-vehicle-title"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: 480 }}
            >
                <div className="modal-header">
                    <h2 id="connect-vehicle-title" className="modal-title">
                        <Link2 size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                        {mode === 'edit' ? 'Modifier la connexion' : 'Connecter le véhicule'}
                    </h2>
                    <button className="modal-close" onClick={onClose} aria-label="Fermer la modale">✕</button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {error && (
                            <div
                                role="alert"
                                style={{
                                    marginBottom: 16,
                                    padding: '10px 12px',
                                    background: 'var(--status-maintenance-bg)',
                                    border: '1px solid rgba(239,68,68,0.4)',
                                    borderRadius: 'var(--radius-sm)',
                                    color: 'var(--error-text)',
                                    fontSize: 13,
                                }}
                            >
                                {error}
                            </div>
                        )}

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label" htmlFor="connect-brand">Marque *</label>
                                <select
                                    id="connect-brand"
                                    className="form-select"
                                    value={brand}
                                    onChange={(e) => setBrand(e.target.value)}
                                >
                                    {Object.entries(BRAND_FORMS).map(([value, def]) => (
                                        <option key={value} value={value}>{def.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label" htmlFor="connect-vin">Numéro de châssis / VIN *</label>
                                <input
                                    id="connect-vin"
                                    className="form-input"
                                    placeholder={form.vinPlaceholder}
                                    value={vin}
                                    onChange={(e) => setVin(e.target.value.toUpperCase())}
                                    required
                                />
                            </div>
                        </div>

                        {loadingCredential ? (
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                Recherche du compte de l&apos;UL…
                            </div>
                        ) : reuseAccount ? (
                            <div
                                style={{
                                    padding: '12px 14px',
                                    background: 'var(--bg-secondary)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border-primary)',
                                    fontSize: 13,
                                }}
                            >
                                <div>{form.accountLabel} de l&apos;UL : <strong>{existingLogin}</strong></div>
                                <button
                                    type="button"
                                    onClick={() => setUseOtherAccount(true)}
                                    style={{
                                        marginTop: 8,
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        color: 'var(--text-link, #2563EB)',
                                        cursor: 'pointer',
                                        fontSize: 13,
                                        textDecoration: 'underline',
                                    }}
                                >
                                    Utiliser un autre compte
                                </button>
                            </div>
                        ) : (
                            <>
                                {existingLogin !== null && (
                                    <div
                                        role="alert"
                                        style={{
                                            marginBottom: 14,
                                            padding: '10px 12px',
                                            background: 'var(--status-maintenance-bg)',
                                            border: '1px solid rgba(239,68,68,0.4)',
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: 13,
                                        }}
                                    >
                                        Ces identifiants remplaceront le {form.accountLabel.toLowerCase()} enregistré
                                        pour l&apos;UL (<strong>{existingLogin}</strong>) sur tous ses véhicules connectés.
                                    </div>
                                )}
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="connect-login">{form.loginLabel} *</label>
                                        <input
                                            id="connect-login"
                                            type="email"
                                            className="form-input"
                                            value={login}
                                            onChange={(e) => setLogin(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="connect-password">Mot de passe *</label>
                                        <input
                                            id="connect-password"
                                            type="password"
                                            className="form-input"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                            Annuler
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting || loadingCredential}>
                            {submitting
                                ? <><Loader2 size={14} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Connexion…</>
                                : (mode === 'edit' ? 'Enregistrer' : 'Connecter')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
