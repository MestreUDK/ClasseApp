/* Sincronização manual: apenas frequências vinculadas ao usuário autenticado. */
(() => {
    'use strict';
    const painel = document.getElementById('sincronizacao');
    if (!painel) return;
    const usuario = painel.dataset.userId;
    const estado = document.getElementById('sync-estado');
    const resumo = document.getElementById('sync-resumo');
    const registros = document.getElementById('sync-registros');
    const atualizar = document.getElementById('sync-atualizar');
    const enviar = document.getElementById('sync-enviar');
    let trabalhando = false;

    async function listar() {
        try {
            const itens = await getPendentes();
            const meus = itens.filter(item => item.usuario_id === usuario);
            const bloqueados = itens.length - meus.length;
            resumo.textContent = `${meus.length} registro(s) desta conta; ${bloqueados} registro(s) antigo(s) ou de outra conta bloqueado(s).`;
            registros.replaceChildren();
            for (const item of meus) {
                const linha = document.createElement('p');
                const dados = item.dados || {};
                linha.textContent = `• ${dados.data || 'Sem data'} — aluno ${dados.aluno_id || '?'} — ${dados.presente ? 'Presente' : 'Ausente'}`;
                registros.append(linha);
            }
            enviar.disabled = trabalhando || !navigator.onLine || meus.length === 0;
            estado.textContent = navigator.onLine ? 'Conexão disponível.' : 'Sem conexão: envio indisponível.';
            return meus;
        } catch (erro) {
            estado.textContent = 'Não foi possível acessar o armazenamento local.';
            enviar.disabled = true;
            return [];
        }
    }

    async function sincronizar() {
        if (trabalhando || !navigator.onLine) return;
        trabalhando = true;
        enviar.disabled = true;
        atualizar.disabled = true;
        let enviados = 0;
        let falhas = 0;
        try {
            const itens = (await getPendentes()).filter(item => item.usuario_id === usuario);
            if (!itens.length) return;
            if (!confirm(`Enviar ${itens.length} lançamento(s) de frequência para a nuvem? Alterações mais recentes no servidor podem ser substituídas.`)) return;
            for (const item of itens) {
                try {
                    const resposta = await fetch('/api/frequencia', {
                        method: 'POST', credentials: 'same-origin',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(item.dados)
                    });
                    if (!resposta.ok) {
                        const detalhes = await resposta.json().catch(() => ({}));
                        if (resposta.status === 409 || resposta.status === 428) {
                            throw new Error(`CONFLITO: ${detalhes.error || 'Revisão desatualizada'}`);
                        }
                        throw new Error(`HTTP ${resposta.status}`);
                    }
                    await limparPendentes(item.id);
                    enviados++;
                } catch (erro) {
                    falhas++;
                    console.warn('Lançamento preservado para nova tentativa:', item.id, erro);
                    if (erro.message === 'HTTP 401' || erro.message === 'HTTP 403') break;
                }
            }
            estado.textContent = `${enviados} enviado(s); ${falhas} pendência(s)/conflito(s) preservado(s). Revise os registros antes de tentar novamente.`;
        } catch (erro) {
            estado.textContent = 'Não foi possível concluir o envio. Tente novamente.';
        } finally {
            trabalhando = false;
            atualizar.disabled = false;
            await listar();
            if (enviados || falhas) estado.textContent = `${enviados} enviado(s); ${falhas} falha(s). Registros não confirmados foram mantidos.`;
        }
    }
    atualizar.addEventListener('click', listar);
    enviar.addEventListener('click', sincronizar);
    window.addEventListener('online', listar);
    window.addEventListener('offline', listar);
    listar();
})();
