import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";
import { isPreview, isDev } from "@/lib/env";
import { PREVIEW_ACCOUNTS } from "@/lib/preview-accounts";
import Link from "next/link";

const DEV_ROLES = [
    { key: 'admin',      label: 'Admin',      badge: 'ADMIN',     color: '#ef4444' },
    { key: 'respo',      label: 'Responsable', badge: 'RESPO',     color: '#f97316' },
    { key: 'chvl',       label: 'Chauffeur',  badge: 'CHVL',      color: '#3b82f6' },
    { key: 'ci',         label: 'CI/RPAPS',   badge: 'CI/RPAPS',  color: '#8b5cf6' },
    { key: 'secouriste', label: 'Secouriste', badge: 'SECOUR.',   color: '#10b981' },
    { key: 'guest',      label: 'Inactif',    badge: 'INACTIF',   color: '#6b7280' },
    { key: 'jeannoel',   label: 'Jean-Noël',   badge: 'JN',        color: '#c70000' },
] as const;

export default async function LoginPage(props: { searchParams: Promise<{ error?: string, callbackUrl?: string }> }) {
    const session = await auth();
    if (session?.user) redirect("/");

    const searchParams = await props.searchParams;
    const error = searchParams?.error;
    const rawCallback = searchParams?.callbackUrl || '/';
    const callbackUrl = rawCallback.startsWith('/') && !rawCallback.startsWith('//') ? rawCallback : '/';

    // Comptes one-click : dev ou preview
    const oneClickRoles = isPreview
        ? PREVIEW_ACCOUNTS.map(a => ({ key: a.key, label: a.label, badge: a.badge, color: a.color }))
        : isDev
            ? DEV_ROLES
            : null;

    return (
        <div className="empty-state" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="empty-state-icon">🛡️</div>
            <div className="empty-state-title">Authentification requise</div>

            {/* Bandeau preview mode */}
            {isPreview && (
                <div style={{
                    background: 'rgba(234, 179, 8, 0.1)',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px 16px',
                    maxWidth: 440,
                    margin: '0 auto 8px auto',
                    width: '100%',
                    textAlign: 'center',
                }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#ca8a04', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        🔶 Environnement Preview
                    </p>
                </div>
            )}

            {/* Bandeau dev mode */}
            {isDev && !isPreview && (
                <div style={{
                    background: 'rgba(234, 179, 8, 0.08)',
                    border: '1px solid rgba(234, 179, 8, 0.25)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px 16px',
                    maxWidth: 440,
                    margin: '0 auto 8px auto',
                    width: '100%',
                    textAlign: 'center',
                }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#ca8a04', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Mode développement
                    </p>
                </div>
            )}

            {/* Connexions one-click (dev ou preview) */}
            {oneClickRoles && (
                <div style={{
                    background: isPreview ? 'rgba(234, 179, 8, 0.06)' : 'rgba(234, 179, 8, 0.08)',
                    border: `1px solid ${isPreview ? 'rgba(234, 179, 8, 0.3)' : 'rgba(234, 179, 8, 0.25)'}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: '16px 20px',
                    maxWidth: 440,
                    margin: '0 auto 28px auto',
                    width: '100%',
                }}>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
                        {isPreview
                            ? 'Connexion directe — sélectionne un compte :'
                            : 'Connexion rapide sans OAuth — sélectionne un rôle à simuler :'}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {oneClickRoles.map(({ key, label, badge, color }) => (
                            <form key={key} action={async () => {
                                "use server";
                                await signIn('dev-credentials', { role: key, redirectTo: callbackUrl });
                            }}>
                                <button
                                    type="submit"
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '10px 14px',
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border-primary)',
                                        borderRadius: 'var(--radius-sm)',
                                        cursor: 'pointer',
                                        transition: 'border-color 0.15s',
                                    }}
                                >
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        padding: '2px 7px',
                                        borderRadius: 4,
                                        fontSize: 10,
                                        fontWeight: 700,
                                        letterSpacing: '0.06em',
                                        background: `${color}22`,
                                        color,
                                        flexShrink: 0,
                                    }}>
                                        {badge}
                                    </span>
                                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                                        {label}
                                    </span>
                                </button>
                            </form>
                        ))}
                    </div>
                </div>
            )}

            {/* Message prod (ni dev, ni preview) */}
            {!isDev && !isPreview && (
                <p style={{ maxWidth: 400, margin: '0 auto', marginBottom: 24, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                    L&apos;accès à cette application est strictement réservé aux membres de la Croix-Rouge française.
                    Veuillez vous connecter avec votre adresse e-mail <strong>@croix-rouge.fr</strong>.
                </p>
            )}

            {error === 'AccessDenied' && (
                <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: '#EF4444',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-sm)',
                    maxWidth: 400,
                    margin: '0 auto 24px auto',
                    fontWeight: 500,
                    fontSize: 14,
                }}>
                    ❌ Accès réservé aux adresses croix-rouge
                </div>
            )}

            {/* Bouton Google : masqué en preview */}
            {!isPreview && (
                <form
                    action={async () => {
                        "use server";
                        await signIn("google", { redirectTo: callbackUrl });
                    }}
                >
                    <button type="submit" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 auto', fontSize: 14 }}>
                        <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                        </svg>
                        {isDev ? 'Connexion Google (prod)' : 'Continuer avec Google'}
                    </button>
                </form>
            )}

            <p style={{
                maxWidth: 440,
                margin: '32px auto 0 auto',
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--text-tertiary)',
                textAlign: 'center',
                borderTop: '1px solid var(--border-primary)',
                paddingTop: 16
            }}>
                En vous connectant sur cette application, vous acceptez que la croix-rouge (unité locale de paris 18) mémorise votre nom, prénom et adresse email. Ces données sont uniquement utilisées pour vous permettre de vous connecter et de gérer votre accès au site. Pour exercer vos droits ou supprimer votre compte, consultez nos{" "}
                <Link href="/mentions-legales" style={{ color: 'var(--crf-red)', textDecoration: 'underline' }}>
                    mentions légales
                </Link>.
            </p>
        </div>
    );
}
