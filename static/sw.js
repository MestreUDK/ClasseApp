const CACHE_NAME = 'controle-alunos-v2'; // Mudei a versão para forçar atualização
const OFFLINE_PAGE = '/offline';

const CORE_FILES = [
    OFFLINE_PAGE,
    '/static/styles.css',
    '/static/js/db.js',
    '/static/js/frequencia.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(CORE_FILES);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
            }));
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Estratégia: Network First, falling back to Cache
    // (Tenta internet, se falhar usa o cache)
    
    // Apenas para GET (páginas e consultas)
    if (event.request.method === 'GET') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Se for uma resposta válida da API ou HTML, salva no cache
                    // Clonamos a resposta porque ela só pode ser consumida uma vez
                    const respClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, respClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Se falhar (Offline), tenta pegar do cache
                    return caches.match(event.request).then((response) => {
                        return response || caches.match(OFFLINE_PAGE);
                    });
                })
        );
    }
});