// static/js/db.js

// Abre (ou cria) o banco de dados local
function openDB() {
    return new Promise((resolve, reject) => {
        // MUDANÇA AQUI: De 'TurmaOnDB' para 'ClasseAppDB'
        const request = indexedDB.open('ClasseAppDB', 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // Cria uma "tabela" para frequencias pendentes
            if (!db.objectStoreNames.contains('frequencia_pendente')) {
                db.createObjectStore('frequencia_pendente', { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject('Erro ao abrir DB local');
    });
}

// Salva uma frequência na fila local
async function salvarOffline(dados) {
    const db = await openDB();
    const tx = db.transaction('frequencia_pendente', 'readwrite');
    const store = tx.objectStore('frequencia_pendente');

    // Adiciona timestamp para saber a ordem
    dados.criado_em = new Date().toISOString();

    store.add(dados);
    return tx.complete;
}

// Pega todas as frequências pendentes
async function getPendentes() {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction('frequencia_pendente', 'readonly');
        const store = tx.objectStore('frequencia_pendente');
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
    });
}

// Limpa a fila (após sincronizar)
async function limparPendentes(id) {
    const db = await openDB();
    const tx = db.transaction('frequencia_pendente', 'readwrite');
    const store = tx.objectStore('frequencia_pendente');
    store.delete(id);
}