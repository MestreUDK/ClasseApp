// Persistência local das frequências ainda não enviadas.
// Não armazene credenciais ou tokens de autenticação neste banco.
const CLASSE_DB_NAME = 'ClasseAppDB';
const CLASSE_DB_VERSION = 1;
const CLASSE_QUEUE = 'frequencia_pendente';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(CLASSE_DB_NAME, CLASSE_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(CLASSE_QUEUE)) {
                db.createObjectStore(CLASSE_QUEUE, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Banco local bloqueado por outra aba.'));
    });
}

function executarTransacao(modo, operacao) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(CLASSE_QUEUE, modo);
        const store = tx.objectStore(CLASSE_QUEUE);
        let resultado;
        const request = operacao(store);
        request.onsuccess = () => { resultado = request.result; };
        tx.oncomplete = () => { db.close(); resolve(resultado); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('Transação cancelada.')); };
    }));
}

async function salvarOffline(item) {
    const registro = { ...item, criado_em: new Date().toISOString() };
    return executarTransacao('readwrite', store => store.add(registro));
}

async function getPendentes() {
    return executarTransacao('readonly', store => store.getAll());
}

async function limparPendentes(id) {
    return executarTransacao('readwrite', store => store.delete(id));
}
