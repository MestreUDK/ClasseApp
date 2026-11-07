/* Envio EXPLÍCITO de notas e Diário de Bordo editados offline.
 * O servidor é fonte da verdade para revisões; HTTP 409 preserva a pendência.
 */
(() => {
    'use strict';
    const raiz = document.getElementById('sync-academico');
    if (!raiz || raiz.dataset.iniciado) return;
    raiz.dataset.iniciado = '1';
    const conta = raiz.dataset.userId;
    const lista = document.getElementById('sync-academico-lista');
    const estado = document.getElementById('sync-academico-estado');
    const atualizar = document.getElementById('sync-academico-atualizar');
    const enviar = document.getElementById('sync-academico-enviar');
    let ocupado = false;

    const texto = (tag, valor, classe = '') => {
        const el = document.createElement(tag);
        el.textContent = String(valor ?? '');
        if (classe) el.className = classe;
        return el;
    };
    const mostrar = mensagem => { estado.textContent = mensagem; };
    function bloquear(valor) {
        ocupado = valor;
        atualizar.disabled = valor;
        enviar.disabled = valor;
        lista.querySelectorAll('button').forEach(b => { b.disabled = valor; });
    }
    async function api(url, opcoes = {}) {
        const response = await fetch(url, {credentials:'same-origin', cache:'no-store', ...opcoes});
        const formato = response.headers.get('Content-Type') || '';
        // A sessão pode expirar e o Flask redirecionar para HTML/login (HTTP 200).
        // Isso jamais pode ser interpretado como sincronização bem-sucedida.
        if (response.redirected || !formato.toLowerCase().includes('application/json')) {
            throw new Error('Sessão encerrada ou resposta inesperada. Faça login novamente; suas pendências foram preservadas.');
        }
        const body = await response.json();
        if (!response.ok) {
            const error = new Error(body.error || `Falha HTTP ${response.status}`);
            error.status = response.status;
            throw error;
        }
        return body;
    }
    async function verificarPendente(item) {
        const atual = (await listarEdicoesAcademicas(conta)).find(p => p.chave === item.chave);
        if (!mesmaEdicaoAcademica(atual,item)) {
            throw new Error('Esta edição foi modificada em outra aba. Atualize a lista.');
        }
    }
    async function salvar(item, revision) {
        await verificarPendente(item);
        if (item.tipo === 'nota') {
            return api('/api/notas', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({avaliacao_id:item.avaliacao_id,
                    aluno_id:item.aluno_id, revision, ...item.dados})
            });
        }
        if (item.tipo === 'diario_criar') {
            // Se o servidor recebeu a criação, mas a confirmação se perdeu,
            // uma nova edição local pode ser aplicada como PUT versionado
            // somente após o usuário comparar e confirmar a versão remota.
            if (Number.isInteger(revision) && revision >= 1) {
                return api(`/api/diario/${encodeURIComponent(item.id)}`, {
                    method:'PUT', headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({...item.dados, revision})
                });
            }
            const criado = await api('/api/diario', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({...item.dados, client_id:item.id})
            });
            if (String(criado.id) !== String(item.id)) {
                throw new Error('Resposta de criação inconsistente; pendência preservada.');
            }
            return criado;
        }
        if (item.tipo === 'diario_excluir') {
            return api(`/api/diario/${encodeURIComponent(item.id)}`, {
                method:'DELETE', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({revision})
            });
        }
        return api(`/api/diario/${encodeURIComponent(item.id)}`, {
            method:'PUT', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({...item.dados,revision})
        });
    }
    async function remoto(item) {
        if (item.tipo === 'nota') {
            const dados = await api(`/api/avaliacao/${encodeURIComponent(item.avaliacao_id)}/diario`);
            const aluno = dados.alunos?.find(a => String(a.id) === String(item.aluno_id));
            if (!aluno) throw new Error('Aluno não encontrado na avaliação atual.');
            return {revision:aluno.revision ?? 0,valor:aluno.nota,
                recupera_periodo:aluno.recupera_periodo ?? null};
        }
        const diarios = await api('/api/diario');
        if (!Array.isArray(diarios)) throw new Error('Retorno do diário inválido.');
        const anotacao = diarios.find(d => String(d.id) === String(item.id));
        if (!anotacao && item.tipo === 'diario') {
            throw new Error('Anotação não encontrada. Ela pode ter sido removida da nuvem.');
        }
        return anotacao || null;
    }
    const formatar = v => v === undefined || v === null || v === '' ? '(vazio)' : String(v);
    async function comparar(item, alvo) {
        if (ocupado) return;
        if (!navigator.onLine) { mostrar('Conecte-se para comparar com a nuvem.'); return; }
        bloquear(true);
        alvo.replaceChildren(texto('p','Consultando a nuvem...'));
        let atual;
        try { await verificarPendente(item); atual = await remoto(item); }
        catch (error) {
            alvo.replaceChildren(texto('p',`Não foi possível comparar: ${error.message}`));
            bloquear(false); return;
        }
        bloquear(false);
        alvo.replaceChildren();
        alvo.append(texto('p',`Revisão local: ${item.expected_revision}; ` +
            (atual ? `revisão atual na nuvem: ${atual.revision}.` : 'registro não encontrado na nuvem.')));
        if (item.tipo === 'diario_criar') {
            alvo.append(texto('p', 'Operação local: criar uma nova anotação.'));
        } else if (item.tipo === 'diario_excluir') {
            alvo.append(texto('p', 'Operação local: excluir a anotação.'));
        }
        const campos = item.tipo === 'nota' ? ['valor',...(Object.hasOwn(item.dados,'recupera_periodo')?['recupera_periodo']:[])] :
            (item.tipo === 'diario_excluir' ? ['titulo'] : ['titulo','conteudo','data_referencia']);
        for (const campo of campos) {
            const caixa = texto('div','', 'edicoes-campo');
            caixa.append(texto('strong',campo === 'valor'?'Nota':campo === 'recupera_periodo'?'Avaliação recuperada':campo));
            caixa.append(texto('p',`Dispositivo: ${formatar(item.dados[campo])}`));
            caixa.append(texto('p',`Nuvem: ${formatar(atual?.[campo])}`));
            alvo.append(caixa);
        }
        const acoes = texto('div','', 'edicoes-acoes');
        const nuvem = texto('button','Manter nuvem (descartar local)');
        const local = texto('button','Aplicar versão do dispositivo');
        const depois = texto('button','Decidir depois');
        [nuvem,local,depois].forEach(b=>{b.type='button';acoes.append(b);});
        alvo.append(acoes);
        depois.addEventListener('click', () => {
            alvo.replaceChildren(texto('p','Edição preservada. Resolva quando desejar.'));
        });
        nuvem.addEventListener('click', async () => {
            if (ocupado || !confirm('Descartar a alteração local? A nuvem não será modificada.')) return;
            bloquear(true);
            try {
                const ok = await alterarEdicaoAcademicaSeIgual(item);
                mostrar(ok ? 'Edição local descartada; nuvem mantida.' :
                    'A edição mudou em outra aba e foi preservada. Atualize a lista.');
                await desenhar();
            } catch (error) { mostrar(`Falha: ${error.message}`); }
            finally { bloquear(false); }
        });
        local.addEventListener('click', async () => {
            if (ocupado || !navigator.onLine) return;
            if (!atual && item.tipo === 'diario_excluir' && item.origem_local) {
                if (await alterarEdicaoAcademicaSeIgual(item)) {
                    mostrar('Anotação não existe na nuvem; exclusão local concluída.');
                    await desenhar();
                }
                return;
            }
            if (!atual && item.tipo !== 'diario_criar') {
                mostrar('Anotação ausente na nuvem. Mantenha a nuvem para descartar a operação local.');
                return;
            }
            if (atual && (!Number.isInteger(atual.revision) || atual.revision < 0)) {
                mostrar('A versão remota não possui revisão válida. Edição preservada.'); return;
            }
            if (atual && item.tipo === 'diario_criar') {
                mostrar('A anotação já existe na nuvem. O envio usará a revisão atual para atualizar os dados conforme sua escolha.');
            }
            if (!confirm('Aplicar seus dados usando a revisão atual da nuvem? ' +
                'Se outra pessoa alterou o registro enquanto você decidia, o servidor impedirá a substituição.')) return;
            bloquear(true);
            try {
                await salvar(item, atual?.revision ?? 0);
                const ok = await alterarEdicaoAcademicaSeIgual(item);
                mostrar(ok ? 'Dados aplicados na nuvem. Atualize sua cópia local.' :
                    'A nuvem recebeu os dados, mas uma edição local mais recente foi preservada.');
                await desenhar();
            } catch (error) {
                if (error.status === 409 || error.status === 428) {
                    await alterarEdicaoAcademicaSeIgual(item,'conflito');
                    mostrar('A nuvem mudou novamente; nenhuma substituição foi feita. Compare de novo.');
                } else mostrar(`Não foi possível aplicar: ${error.message}`);
                await desenhar();
            } finally { bloquear(false); }
        });
    }
    async function desenhar() {
        const pendentes = await listarEdicoesAcademicas(conta);
        lista.replaceChildren();
        const conflitos = pendentes.filter(p=>p.estado==='conflito').length;
        mostrar(`${pendentes.length} edição(ões) de notas/diário pendente(s). `+
            (conflitos ? `${conflitos} com conflito.` : ''));
        for (const item of pendentes) {
            const bloco = texto('div','', 'edicoes-pendente');
            const categoria = item.tipo === 'nota' ? 'Nota de aluno' :
                item.tipo === 'diario_criar' ? 'Criar anotação' :
                item.tipo === 'diario_excluir' ? 'Excluir anotação' : 'Editar anotação';
            bloco.append(texto('strong', categoria));
            bloco.append(texto('p',item.tipo === 'nota' ?
                `Avaliação: ${item.avaliacao_id} · Aluno: ${item.aluno_id}` :
                `Anotação: ${item.dados.titulo || item.id}`));
            bloco.append(texto('p',item.estado === 'conflito' ?
                'Conflito — precisa de decisão manual' : 'Aguardando envio'));
            const compararBtn = texto('button','Comparar e resolver');compararBtn.type='button';
            const detalhe = texto('div');
            compararBtn.addEventListener('click',()=>comparar(item,detalhe));
            bloco.append(compararBtn,detalhe);
            lista.append(bloco);
        }
    }
    atualizar.addEventListener('click',async()=>{
        if (ocupado) return;
        bloquear(true);
        try {await desenhar();} catch(e){mostrar(`Falha: ${e.message}`);} finally{bloquear(false);}
    });
    enviar.addEventListener('click',async()=>{
        if (ocupado) return;
        if (!navigator.onLine) { mostrar('Sem conexão. As alterações estão salvas localmente.');return; }
        let fila;
        try {fila=(await listarEdicoesAcademicas(conta)).filter(p=>p.estado!=='conflito');}
        catch(e){mostrar('Não foi possível abrir a fila local.');return;}
        if (!fila.length){mostrar('Não há edições para enviar; resolva os conflitos individualmente.');return;}
        if (!confirm(`Enviar ${fila.length} alteração(ões) de notas e diário? O servidor vai verificar as revisões.`)) return;
        bloquear(true);
        let ok=0,conflitos=0,falhas=0;
        for (const item of fila) {
            try {
                await salvar(item,item.expected_revision);
                if(await alterarEdicaoAcademicaSeIgual(item)) ok++; else falhas++;
            } catch (e) {
                // Exclusão de anotação criada localmente que nunca chegou ao
                // servidor: nenhum registro remoto existe para remover.
                if (item.tipo === 'diario_excluir' && item.origem_local && e.status === 409) {
                    try {
                        const atual = await remoto(item);
                        if (!atual && await alterarEdicaoAcademicaSeIgual(item)) {ok++; continue;}
                    } catch (_) { /* Preservar pendência em caso de falha. */ }
                }
                if (e.status===409||e.status===428) {
                    await alterarEdicaoAcademicaSeIgual(item,'conflito'); conflitos++;
                } else {console.error(e);falhas++;}
            }
        }
        try {await desenhar();} catch(e){console.error(e);}
        mostrar(`Operações confirmadas: ${ok}. Conflitos preservados: ${conflitos}. Falhas: ${falhas}. `+
            'Para visualizar os dados confirmados, baixe uma cópia atualizada da nuvem.');
        bloquear(false);
    });
    desenhar().catch(()=>mostrar('Não foi possível ler as pendências de notas e diário.'));
})();
