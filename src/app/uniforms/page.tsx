'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { canAccessAdminPanel, isAdminOrAbove, isInactive, isSuperAdmin } from '@/lib/roles';
import { useMenuSettings } from '@/lib/contexts/MenuSettingsContext';
import UniformTabs, { type UniformTab } from '@/components/uniforms/UniformTabs';
import UniformCatalog from '@/components/uniforms/UniformCatalog';
import UniformMyLoansCard from '@/components/uniforms/UniformMyLoansCard';
import LaundryList from '@/components/uniforms/LaundryList';
import UniformLoansTable from '@/components/uniforms/UniformLoansTable';
import UniformManagement from '@/components/uniforms/UniformManagement';
import { useUniformCatalog } from '@/components/uniforms/useUniformCatalog';

const laundryMarkUrl = (loanId: string) => `/api/uniforms/laundry/${encodeURIComponent(loanId)}`;

/**
 * Uniformes — emprunt et rendu des pièces d'uniforme de l'UL active.
 * « Emprunter » et « À laver » : tout compte actif ; « Emprunts » :
 * `canAccessAdminPanel` ; « Gestion » : `isAdminOrAbove`. Le rendu se fait
 * depuis la card « Mes pièces empruntées », au-dessus des onglets.
 */
export default function UniformsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { getVisibility } = useMenuSettings();
    const [tab, setTab] = useState<UniformTab>('borrow');

    const roles = (session?.user?.roles || []) as string[];
    const visibility = getVisibility('uniforms');
    const menuHidden = visibility === 'disabled' || (visibility === 'admin_only' && !isSuperAdmin(roles));
    const canAccess = !isInactive(roles) && !menuHidden;

    const ulId = session?.user?.ulId;
    const hasActiveUl = Boolean(ulId && ulId !== 'default');
    const ulName = session?.user?.availableULs?.find(ul => ul.id === ulId)?.name ?? '';

    const tabs: UniformTab[] = ['borrow', 'laundry'];
    if (canAccessAdminPanel(roles)) tabs.push('loans');
    if (isAdminOrAbove(roles)) tabs.push('manage');
    // Après un changement d'UL où le rôle est moindre, l'onglet choisi peut ne
    // plus être autorisé : on retombe sur « Emprunter » sans toucher à l'état.
    const activeTab: UniformTab = tabs.includes(tab) ? tab : 'borrow';

    useEffect(() => {
        if (status === 'unauthenticated' || (status === 'authenticated' && !canAccess)) {
            router.push('/vehicles');
        }
    }, [status, canAccess, router]);

    // L'API lit l'UL de session et ignore `ul` : le paramètre ne sert qu'à
    // changer l'URL, donc à relancer la lecture, quand l'utilisateur change
    // d'UL dans la Navbar (la session est mise à jour sans rechargement).
    const catalog = useUniformCatalog(
        status === 'authenticated' && canAccess && hasActiveUl ? `/api/uniforms/items?ul=${encodeURIComponent(ulId ?? '')}` : null,
    );

    if (status !== 'authenticated' || !canAccess) return <div className="page-loading">Chargement...</div>;

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Uniformes{ulName ? ` — UL ${ulName}` : ''}</h1>
            </div>

            <UniformMyLoansCard />

            {!hasActiveUl ? (
                <p>Sélectionnez une unité locale pour accéder à ses uniformes.</p>
            ) : (
                <>
                    <UniformTabs tabs={tabs} active={activeTab} onSelect={setTab} />

                    {(activeTab === 'borrow' || activeTab === 'manage') && (catalog.loading || catalog.error) ? (
                        catalog.loading ? <div className="page-loading">Chargement...</div> : <p role="alert">{catalog.error}</p>
                    ) : (
                        <>
                            {activeTab === 'borrow' && (
                                <UniformCatalog key={ulId} items={catalog.data?.items ?? []} submitUrl="/api/uniforms/loans" onSubmitted={catalog.refresh} />
                            )}
                            {activeTab === 'manage' && ulId && (
                                <UniformManagement
                                    items={catalog.data?.items ?? []}
                                    ulId={ulId}
                                    ulName={ulName}
                                    canRegenerateQr={canAccessAdminPanel(roles)}
                                    onChanged={catalog.refresh}
                                />
                            )}
                        </>
                    )}
                    {activeTab === 'laundry' && <LaundryList key={ulId} listUrl="/api/uniforms/laundry" markUrl={laundryMarkUrl} />}
                    {activeTab === 'loans' && <UniformLoansTable key={ulId} />}
                </>
            )}
        </div>
    );
}
