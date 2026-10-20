// Persistência local das frequências ainda não enviadas.
// Não armazene credenciais ou tokens de autenticação neste banco.
const CLASSE_DB_NAME = 'ClasseAppDB';
const CLASSE_DB_VERSION = 3;
const CLASSE_QUEUE = 'frequencia_pendente';
const CLASSE_SNAPSHOTS = 'snapshots_consulta';
const CLASSE_HISTORICO = 'snapshots_historico';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(CLASSE_DB_NAME, CLASSE_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(CLASSE_QUEUE)) {
                db.createObjectStore(CLASSE_QUEUE, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(CLASSE_SNAPSHOTS)) {
                db.createObjectStore(CLASSE_SNAPSHOTS, { keyPath: 'usuario_id' });
            }
            if (!db.objectStoreNames.contains(CLASSE_HISTORICO)) {
                db.createObjectStore(CLASSE_HISTORICO, { keyPath: 'usuario_id' });
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

// Cópia local de consulta, separada da fila de alterações pendentes.
function executarSnapshot(modo, operacao) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(CLASSE_SNAPSHOTS, modo);
        const req = operacao(tx.objectStore(CLASSE_SNAPSHOTS));
        let resultado;
        req.onsuccess = () => { resultado = req.result; };
        tx.oncomplete = () => { db.close(); resolve(resultado); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('Transação cancelada')); };
    }));
}
function salvarSnapshot(snapshot) {
    return executarSnapshot('readwrite', store => store.put(snapshot));
}
function obterSnapshot(usuarioId) {
    return executarSnapshot('readonly', store => store.get(usuarioId));
}
function apagarSnapshot(usuarioId) {
    return executarSnapshot('readwrite', store => store.delete(usuarioId));
}

// Histórico limitado de versões de consulta, separado da fila de frequência.
function transacaoVersoes(modo, operacao) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction([CLASSE_SNAPSHOTS, CLASSE_HISTORICO], modo);
        let resultado;
        operacao(tx.objectStore(CLASSE_SNAPSHOTS), tx.objectStore(CLASSE_HISTORICO),
            valor => { resultado = valor; });
        tx.oncomplete = () => { db.close(); resolve(resultado); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('Transação abortada')); };
    }));
}

function salvarSnapshotVersionado(snapshot) {
    if (!snapshot || !snapshot.usuario_id || !Array.isArray(snapshot.turmas) ||
        !Array.isArray(snapshot.alunos)) {
        return Promise.reject(new Error('Cópia inválida'));
    }
    return transacaoVersoes('readwrite', (atual, historico) => {
        const reqAtual = atual.get(snapshot.usuario_id);
        const reqHistorico = historico.get(snapshot.usuario_id);
        let anterior, versoes;
        const persistir = () => {
            if (anterior === undefined || versoes === undefined) return;
            const lista = Array.isArray(versoes?.versoes) ? versoes.versoes : [];
            if (anterior) lista.unshift(anterior);
            historico.put({usuario_id: snapshot.usuario_id, versoes: lista.slice(0, 3)});
            atual.put({...snapshot, formato_versao: 1});
        };
        reqAtual.onsuccess = () => { anterior = reqAtual.result || null; persistir(); };
        reqHistorico.onsuccess = () => { versoes = reqHistorico.result || null; persistir(); };
    });
}

function listarVersoesSnapshot(usuarioId) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(CLASSE_HISTORICO, 'readonly');
        const req = tx.objectStore(CLASSE_HISTORICO).get(usuarioId);
        req.onsuccess = () => resolve(req.result?.versoes || []);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onabort = () => { db.close(); reject(tx.error); };
    }));
}

function restaurarVersaoSnapshot(usuarioId, indice) {
    return transacaoVersoes('readwrite', (atual, historico) => {
        const reqAtual = atual.get(usuarioId);
        const reqHistorico = historico.get(usuarioId);
        let existente, historicoAtual;
        const restaurar = () => {
            if (existente === undefined || historicoAtual === undefined) return;
            const lista = historicoAtual?.versoes || [];
            if (!Number.isInteger(indice) || indice < 0 || indice >= lista.length) {
                throw new Error('Versão não encontrada');
            }
            const selecionada = lista[indice];
            const restantes = lista.filter((_, i) => i !== indice);
            if (existente) restantes.unshift(existente);
            historico.put({usuario_id: usuarioId, versoes: restantes.slice(0, 3)});
            atual.put({...selecionada, usuario_id: usuarioId});
        };
        reqAtual.onsuccess = () => { existente = reqAtual.result || null; restaurar(); };
        reqHistorico.onsuccess = () => { historicoAtual = reqHistorico.result || null; restaurar(); };
    });
}

function apagarSnapshotComHistorico(usuarioId) {
    return transacaoVersoes('readwrite', (atual, historico) => {
        atual.delete(usuarioId);
        historico.delete(usuarioId);
    });
}
