'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import MissionWizard from '@/components/missions/MissionWizard';

const ALLOWED_ROLES = ['CHVL', 'CHVPSP', 'RESPO', 'ADMIN', 'SECOURISTE'];

export default function NewMissionPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const roles = (session?.user?.roles || ['GUEST']) as string[];
    const canAccess = ALLOWED_ROLES.some(r => roles.includes(r));

    useEffect(() => {
        if (status === 'unauthenticated' || (status === 'authenticated' && !canAccess)) {
            router.push('/');
        }
    }, [status, canAccess, router]);

    function handleSuccess(id: string) {
        router.push(`/missions/${id}`);
    }

    if (status === 'loading' || !canAccess) {
        return <div className="page-loading">Chargement...</div>;
    }

    return (
        <main id="main-content" className="page-container">
            <div className="page-header">
                <h1 className="page-title">Nouveau compte rendu de mission</h1>
            </div>

            <MissionWizard
                currentUserId={session?.user?.id}
                currentUserName={session?.user?.name ?? undefined}
                onSuccess={handleSuccess}
            />
        </main>
    );
}
