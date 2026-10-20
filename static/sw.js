// Cache exclusivamente para recursos públicos estáticos e tela genérica offline.
// Respostas autenticadas e endpoints /api nunca são persistidos pelo Service Worker.
const CACHE_NAME = 'classeapp-static-v2-2-1';
const OFFLINE_PAGE = '/offline';
const CORE_FILES = [
    OFFLINE_PAGE,
    '/static/styles.css',
    '/static/js/db.js',
    '/static/js/frequencia.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CORE_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(keys
            .filter(key => key === 'controle-alunos-v2' ||
                (key.startsWith('classeapp-static-') && key !== CACHE_NAME))
            .map(key => caches.delete(key))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Nunca guardar páginas de usuários, dados de alunos ou respostas de API.
    if (url.pathname.startsWith('/api/') || url.pathname !== OFFLINE_PAGE &&
        !url.pathname.startsWith('/static/')) {
        if (request.mode === 'navigate') {
            event.respondWith(fetch(request).catch(async () =>
                (await caches.match(OFFLINE_PAGE)) ||
                new Response('Sem conexão.', { status: 503 })
            ));
        }
        return;
    }

    if (url.pathname === OFFLINE_PAGE || url.pathname.startsWith('/static/')) {
        event.respondWith(fetch(request).then(response => {
            if (response.ok && response.type === 'basic' &&
                !response.headers.has('Set-Cookie') &&
                !response.headers.get('Cache-Control')?.includes('private')) {
                const copy = response.clone();
                event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
            }
            return response;
        }).catch(async () => (await caches.match(request)) ||
            new Response('Recurso indisponível offline.', { status: 503 })));
    }
});
