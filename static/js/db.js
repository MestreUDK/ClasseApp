// Persistência local das frequências ainda não enviadas.
// Não armazene credenciais ou tokens de autenticação neste banco.
const CLASSE_DB_NAME = 'ClasseAppDB';
const CLASSE_DB_VERSION = 7;
const CLASSE_QUEUE = 'frequencia_pendente';
const CLASSE_SNAPSHOTS = 'snapshots_consulta';
const CLASSE_HISTORICO = 'snapshots_historico';
const CLASSE_EDICOES = 'edicoes_offline';
const CLASSE_ACADEMICO_EDICOES = 'edicoes_academicas';
const CLASSE_ACESSOS_OFFLINE = 'acessos_offline';
const CLASSE_PACOTES = 'pacotes_alteracoes';
function limiteHistorico(usuarioId) {
    try {
        const n = Number(localStorage.getItem('classeapp:pacotes:limite:' + usuarioId));
        return [3, 5, 7, 10].includes(n) ? n : 3;
    } catch (_) { return 3; }
}

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
            if (!db.objectStoreNames.contains(CLASSE_EDICOES)) {
                db.createObjectStore(CLASSE_EDICOES, { keyPath: 'chave' });
            }
            if (!db.objectStoreNames.contains(CLASSE_ACADEMICO_EDICOES)) {
                db.createObjectStore(CLASSE_ACADEMICO_EDICOES, {keyPath: 'chave'});
            }
            if (!db.objectStoreNames.contains(CLASSE_HISTORICO)) {
                db.createObjectStore(CLASSE_HISTORICO, { keyPath: 'usuario_id' });
            }
            if (!db.objectStoreNames.contains(CLASSE_ACESSOS_OFFLINE)) {
                db.createObjectStore(CLASSE_ACESSOS_OFFLINE, {keyPath: 'usuario_id'});
            }
            if (!db.objectStoreNames.contains(CLASSE_PACOTES)) {
                db.createObjectStore(CLASSE_PACOTES, {keyPath: 'usuario_id'});
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

// Atualiza o estado de uma pendência sem perder seu identificador local.
async function atualizarPendente(item) {
    if (!item || !Number.isInteger(item.id)) throw new Error('Pendência inválida');
    return executarTransacao('readwrite', store => store.put(item));
}

// Remove ou modifica somente a versão da pendência que foi realmente enviada.
// A comparação e a escrita acontecem na MESMA transação do IndexedDB.
async function modificarPendenteSeIgual(esperado, novo = null) {
    if (!esperado?.usuario_id || !Number.isInteger(esperado.id) ||
        (novo && (novo.id !== esperado.id || novo.usuario_id !== esperado.usuario_id))) {
        throw new Error('Pendência de frequência inválida.');
    }
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CLASSE_QUEUE, 'readwrite');
        const store = tx.objectStore(CLASSE_QUEUE);
        let alterou = false;
        const req = store.get(esperado.id);
        req.onsuccess = () => {
            const atual = req.result;
            if (!atual || atual.usuario_id !== esperado.usuario_id ||
                JSON.stringify(atual) !== JSON.stringify(esperado)) return;
            if (novo) store.put(novo);
            else store.delete(esperado.id);
            alterou = true;
        };
        tx.oncomplete = () => { db.close(); resolve(alterou); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('Transação cancelada.')); };
    });
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
            historico.put({usuario_id: snapshot.usuario_id, versoes: lista.slice(0, limiteHistorico(snapshot.usuario_id))});
            atual.put({...snapshot, formato_versao: 1});
        };
        reqAtual.onsuccess = () => { anterior = reqAtual.result || null; persistir(); };
        reqHistorico.onsuccess = () => { versoes = reqHistorico.result || null; persistir(); };
    }).then(resultado => {
        document.dispatchEvent(new Event('classeapp:snapshot:atualizado'));
        return resultado;
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
            historico.put({usuario_id: usuarioId, versoes: restantes.slice(0, limiteHistorico(usuarioId))});
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

// Fila isolada de edições offline. Chave inclui usuário, tipo e ID do registro.
function transacaoEdicoes(modo, executar) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(CLASSE_EDICOES, modo);
        const req = executar(tx.objectStore(CLASSE_EDICOES));
        let resultado;
        req.onsuccess = () => { resultado = req.result; };
        tx.oncomplete = () => { db.close(); resolve(resultado); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
    }));
}
function listarEdicoesOffline(usuario) {
    return transacaoEdicoes('readonly', store => store.getAll())
        .then(lista => lista.filter(item => item.usuario_id === usuario));
}
function salvarEdicaoOffline(item) {
    return transacaoEdicoes('readwrite', store => store.put(item));
}
function removerEdicaoOffline(chave) {
    return transacaoEdicoes('readwrite', store => store.delete(chave));
}

// Operações condicionais impedem que o resultado de uma aba apague ou substitua
// uma edição posterior feita em outra aba do mesmo navegador.
function mesmaEdicaoOffline(atual, esperado) {
    return Boolean(atual && esperado && atual.chave === esperado.chave &&
        atual.usuario_id === esperado.usuario_id && atual.tipo === esperado.tipo &&
        String(atual.id) === String(esperado.id) &&
        atual.expected_revision === esperado.expected_revision &&
        atual.alterado_localmente_em === esperado.alterado_localmente_em &&
        atual.estado === esperado.estado &&
        JSON.stringify(atual.dados) === JSON.stringify(esperado.dados) &&
        JSON.stringify(atual.base_dados ?? null) === JSON.stringify(esperado.base_dados ?? null));
}

function modificarEdicaoOfflineSeIgual(esperado, novoEstado = null) {
    if (!esperado?.chave) return Promise.reject(new Error('Edição inválida.'));
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(CLASSE_EDICOES, 'readwrite');
        const store = tx.objectStore(CLASSE_EDICOES);
        let modificou = false;
        const req = store.get(esperado.chave);
        req.onsuccess = () => {
            if (!mesmaEdicaoOffline(req.result, esperado)) return;
            if (novoEstado === null) store.delete(esperado.chave);
            else store.put({...req.result, estado: novoEstado});
            modificou = true;
        };
        tx.oncomplete = () => { db.close(); resolve(modificou); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('Transação cancelada.')); };
    }));
}

function removerEdicaoOfflineSeIgual(esperado) {
    return modificarEdicaoOfflineSeIgual(esperado);
}

function marcarEdicaoOfflineSeIgual(esperado, estado) {
    if (!['conflito', 'pendente'].includes(estado)) {
        return Promise.reject(new Error('Estado inválido.'));
    }
    return modificarEdicaoOfflineSeIgual(esperado, estado);
}


// Notas e diário: fila separada para não interferir em edições de turmas/alunos.
// O timestamp é informativo; a revisão confirmada pelo servidor controla conflitos.
function transacaoAcademica(modo, executar) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(CLASSE_ACADEMICO_EDICOES, modo);
        let resultado;
        const req = executar(tx.objectStore(CLASSE_ACADEMICO_EDICOES));
        if (req) req.onsuccess = () => { resultado = req.result; };
        tx.oncomplete = () => { db.close(); resolve(resultado); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('Transação cancelada')); };
    }));
}
function listarEdicoesAcademicas(usuarioId) {
    return transacaoAcademica('readonly', store => store.getAll())
        .then(lista => lista.filter(item => item.usuario_id === usuarioId));
}
function salvarEdicaoAcademica(item) {
    if (!item?.usuario_id || !item?.chave || !['nota', 'nota_excluir', 'avaliacao_criar', 'avaliacao_excluir', 'diario', 'diario_criar', 'diario_excluir'].includes(item.tipo)) {
        return Promise.reject(new Error('Edição acadêmica inválida.'));
    }
    return transacaoAcademica('readwrite', store => store.put(item));
}
function mesmaEdicaoAcademica(a, b) {
    return Boolean(a && b && a.usuario_id === b.usuario_id && a.chave === b.chave &&
        a.edicao_id === b.edicao_id && a.estado === b.estado &&
        JSON.stringify(a.dados) === JSON.stringify(b.dados));
}
// Desfaz exclusão sem correr o risco de apagar uma pendência mais nova.
function restaurarEdicaoAcademicaSeIgual(esperada, anterior) {
    if (!esperada?.chave) return Promise.reject(new Error('Pendência inválida.'));
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(CLASSE_ACADEMICO_EDICOES, 'readwrite');
        const store = tx.objectStore(CLASSE_ACADEMICO_EDICOES);
        let ok = false;
        const req = store.get(esperada.chave);
        req.onsuccess = () => {
            if (!mesmaEdicaoAcademica(req.result, esperada)) return;
            if (anterior) {
                if (anterior.chave !== esperada.chave || anterior.usuario_id !== esperada.usuario_id) {
                    tx.abort(); return;
                }
                store.put(anterior);
            } else store.delete(esperada.chave);
            ok = true;
        };
        tx.oncomplete = () => { db.close(); resolve(ok); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('Transação cancelada.')); };
    }));
}
function alterarEdicaoAcademicaSeIgual(esperada, estado = null) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(CLASSE_ACADEMICO_EDICOES, 'readwrite');
        const store = tx.objectStore(CLASSE_ACADEMICO_EDICOES);
        let alterou = false;
        const req = store.get(esperada.chave);
        req.onsuccess = () => {
            if (!mesmaEdicaoAcademica(req.result, esperada)) return;
            if (estado === null) store.delete(esperada.chave);
            else store.put({...req.result, estado});
            alterou = true;
        };
        tx.oncomplete = () => { db.close(); resolve(alterou); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
    }));
}

// Verificadores de acesso offline, isolados dos dados escolares e da sessão web.
// Não armazenam senha, token ou chave criptográfica persistente.
function transacaoAcessosOffline(modo, operacao) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(CLASSE_ACESSOS_OFFLINE, modo);
        const req = operacao(tx.objectStore(CLASSE_ACESSOS_OFFLINE));
        let resultado;
        req.onsuccess = () => { resultado = req.result; };
        tx.oncomplete = () => { db.close(); resolve(resultado); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('Falha no banco local')); };
    }));
}
function listarAcessosOffline() {
    return transacaoAcessosOffline('readonly', store => store.getAll());
}
function obterAcessoOffline(usuarioId) {
    return transacaoAcessosOffline('readonly', store => store.get(usuarioId));
}
function salvarAcessoOffline(perfil) {
    if (!perfil?.usuario_id || !perfil?.sal || !perfil?.iv || !perfil?.verificador) {
        return Promise.reject(new Error('Configuração local inválida'));
    }
    return transacaoAcessosOffline('readwrite', store => store.put(perfil));
}
