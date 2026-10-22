// Service worker : notifications push uniquement (pas de cache hors ligne, pas de PWA).

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch {
        payload = { title: 'Martine', body: event.data.text() };
    }

    event.waitUntil(
        self.registration.showNotification(payload.title || 'Martine', {
            body: payload.body || '',
            icon: '/logo_crf_text.png',
            data: { url: payload.url || '/' },
        })
    );
});

// Ne garde que le chemin : le lien peut porter un domaine absolu codé en dur côté serveur.
function buildTargetUrl(rawUrl) {
    const target = new URL(rawUrl || '/', self.location.origin);
    const url = new URL(target.pathname + target.search, self.location.origin);
    url.searchParams.set('fromPush', 'true');
    return url;
}

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = buildTargetUrl(event.notification.data && event.notification.data.url);

    event.waitUntil((async () => {
        const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windowClients) {
            if (new URL(client.url).origin === target.origin && 'focus' in client) {
                await client.focus();
                try {
                    await client.navigate(target.href);
                    return;
                } catch {
                    // Client non contrôlé (matché via includeUncontrolled) : navigate() est refusé.
                    return self.clients.openWindow(target.href);
                }
            }
        }
        return self.clients.openWindow(target.href);
    })());
});
