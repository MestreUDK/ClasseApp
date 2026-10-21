/* Resolução explícita de conflitos de frequência, sem sobrescrita silenciosa. */
(() => {
    'use strict';
    const painel = document.getElementById('sincronizacao');
    if (!painel || painel.dataset.sync229 === '1') return;
    painel.dataset.sync229 = '1';
    const usuario = painel.dataset.userId;
    const estado = document.getElementById('sync-estado');
    const resumo = document.getElementById('sync-resumo');
    const registros = document.getElementById('sync-registros');
    const atualizar = document.getElementById('sync-atualizar');
    const enviar = document.getElementById('sync-enviar');
    let trabalhando = false;

    function texto(item) {
        const d = item.dados || {};
        return `${d.data || 'Sem data'} — aluno ${d.aluno_id || '?'} — ${d.presente ? 'Presente' : 'Ausente'} (base: revisão ${d.revision ?? '?'})`;
    }

    async function buscarRemoto(d) {
        const params = new URLSearchParams({turma_id: d.turma_id, data: d.data});
        const resposta = await fetch(`/api/frequencia?${params}`, {credentials: 'same-origin', cache: 'no-store'});
        if (!resposta.ok) throw new Error(`Consulta da nuvem falhou (HTTP ${resposta.status}).`);
        const lista = await resposta.json();
        return lista.find(reg => String(reg.aluno_id) === String(d.aluno_id)) || null;
    }

    async function enviarRegistro(item, revisao) {
        const resposta = await fetch('/api/frequencia', {
            method: 'POST', credentials: 'same-origin',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...item.dados, revision: revisao})
        });
        if (!resposta.ok) {
            const detalhes = await resposta.json().catch(() => ({}));
            const erro = new Error(detalhes.error || `HTTP ${resposta.status}`);
            erro.status = resposta.status;
            throw erro;
        }
        return resposta.json();
    }

    async function listar() {
        try {
            const itens = await getPendentes();
            const meus = itens.filter(item => item.usuario_id === usuario);
            const bloqueados = itens.length - meus.length;
            const conflitos = meus.filter(item => item.conflito).length;
            resumo.textContent = `${meus.length} pendência(s) desta conta, ${conflitos} conflito(s); ${bloqueados} registro(s) de outra conta ou sem identificação bloqueado(s).`;
            registros.replaceChildren();
            for (const item of meus) {
                const linha = document.createElement('div');
                linha.className = 'notificacoes-item';
                const descricao = document.createElement('p');
                descricao.textContent = `${item.conflito ? '⚠️ Conflito: ' : '• '}${texto(item)}`;
                linha.append(descricao);
                if (item.conflito) {
                    const botao = document.createElement('button');
                    botao.type = 'button';
                    botao.textContent = 'Comparar e resolver';
                    botao.disabled = trabalhando || !navigator.onLine;
                    botao.addEventListener('click', () => resolver(item.id));
                    linha.append(botao);
                }
                registros.append(linha);
            }
            enviar.disabled = trabalhando || !navigator.onLine || !meus.some(item => !item.conflito);
            estado.textContent = navigator.onLine ? 'Conexão disponível.' : 'Sem conexão: envio e comparação indisponíveis.';
        } catch (erro) {
            estado.textContent = 'Não foi possível consultar o armazenamento local.';
            enviar.disabled = true;
        }
    }

    async function resolver(id) {
        if (trabalhando || !navigator.onLine) return;
        trabalhando = true;
        atualizar.disabled = enviar.disabled = true;
        let mensagem = '';
        try {
            const item = (await getPendentes()).find(reg => reg.id === id && reg.usuario_id === usuario && reg.conflito);
            if (!item) throw new Error('Pendência não encontrada para esta conta.');
            const remoto = await buscarRemoto(item.dados);
            const valorRemoto = remoto ? (remoto.presente ? 'Presente' : 'Ausente') : 'Sem registro';
            const revisaoRemota = remoto ? remoto.revision : 0;
            const escolha = prompt(
                `Conflito de frequência\n\n${texto(item)}\nNuvem: ${valorRemoto} (revisão ${revisaoRemota})\n\nDigite:\n1 — Manter nuvem (descartar pendência local)\n2 — Aplicar valor local após confirmar a revisão atual\n3 — Resolver depois`, '3');
            if (escolha === '1') {
                if (!confirm('Descartar somente esta pendência local? O registro da nuvem será mantido.')) return;
                await limparPendentes(item.id);
                mensagem = 'Pendência descartada; nuvem preservada.';
            } else if (escolha === '2') {
                if (!confirm(`Aplicar ${item.dados.presente ? 'Presente' : 'Ausente'} sobre ${valorRemoto}? A operação verificará novamente a revisão no servidor.`)) return;
                try {
                    await enviarRegistro(item, revisaoRemota);
                    await limparPendentes(item.id);
                    mensagem = 'Alteração local aplicada com revisão verificada.';
                } catch (erro) {
                    if (erro.status === 409 || erro.status === 428) {
                        mensagem = 'A nuvem mudou novamente. Pendência preservada; compare outra vez.';
                    } else throw erro;
                }
            } else {
                mensagem = 'Conflito mantido para resolver posteriormente.';
            }
        } catch (erro) {
            mensagem = `Não foi possível resolver: ${erro.message}`;
        } finally {
            trabalhando = false;
            atualizar.disabled = false;
            await listar();
            if (mensagem) estado.textContent = mensagem;
        }
    }

    async function sincronizar() {
        if (trabalhando || !navigator.onLine) return;
        trabalhando = true;
        atualizar.disabled = enviar.disabled = true;
        let enviados = 0, falhas = 0, conflitos = 0;
        try {
            const itens = (await getPendentes()).filter(item => item.usuario_id === usuario && !item.conflito);
            if (!itens.length) return;
            if (!confirm(`Enviar ${itens.length} frequência(s) pendente(s)? Conflitos serão preservados para decisão manual.`)) return;
            for (const item of itens) {
                try {
                    await enviarRegistro(item, item.dados.revision);
                    await limparPendentes(item.id);
                    enviados++;
                } catch (erro) {
                    falhas++;
                    if (erro.status === 409 || erro.status === 428) {
                        item.conflito = true;
                        item.erro_conflito = erro.message;
                        await atualizarPendente(item);
                        conflitos++;
                    }
                    if (erro.status === 401 || erro.status === 403) break;
                }
            }
        } catch (erro) {
            estado.textContent = `Falha na sincronização: ${erro.message}`;
        } finally {
            trabalhando = false;
            atualizar.disabled = false;
            await listar();
            if (enviados || falhas) estado.textContent = `${enviados} enviado(s), ${falhas} pendência(s) preservada(s), ${conflitos} novo(s) conflito(s).`;
        }
    }

    atualizar.addEventListener('click', listar);
    enviar.addEventListener('click', sincronizar);
    window.addEventListener('online', listar);
    window.addEventListener('offline', listar);
    listar();
})();
