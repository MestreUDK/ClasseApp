/* Edições locais explícitas e resolução de conflitos por campo.
 * Os dados não são enviados automaticamente. O servidor compara expected_revision
 * no mesmo UPDATE, evitando sobrescritas silenciosas.
 */
(() => {
    'use strict';

    const painel = document.getElementById('dados-offline');
    if (!painel || painel.dataset.edicoesIniciadas) return;
    painel.dataset.edicoesIniciadas = '1';

    const usuario = painel.dataset.userId;
    const listar = document.getElementById('edicoes-listar');
    const enviar = document.getElementById('edicoes-enviar');
    const estado = document.getElementById('edicoes-estado');
    const area = document.getElementById('edicoes-lista');
    const campos = {
        turmas: [['nome', 'Nome'], ['descricao', 'Descrição']],
        alunos: [['nome_completo', 'Nome completo'], ['matricula', 'Matrícula'],
            ['telefone', 'Telefone'], ['email', 'E-mail'],
            ['data_nascimento', 'Nascimento'], ['detalhes', 'Detalhes']]
    };
    let ocupado = false;

    function chave(tipo, id) { return `${usuario}:${tipo}:${id}`; }
    function mensagem(texto) { estado.textContent = texto; }
    function bloqueio(valor) {
        ocupado = valor;
        listar.disabled = valor;
        enviar.disabled = valor;
        area.querySelectorAll('button').forEach(botao => { botao.disabled = valor; });
    }
    function linha(texto, tag = 'p') {
        const el = document.createElement(tag);
        el.textContent = texto;
        return el;
    }
    function rotuloRegistro(item) {
        return item.dados.nome_completo || item.dados.nome || String(item.id);
    }
    function valorTexto(valor) {
        if (valor === null || valor === undefined || valor === '') return '(vazio)';
        return String(valor);
    }
    function normalizar(valor) {
        return valor === undefined || valor === '' ? null : valor;
    }
    function erroHttp(resposta, detalhes = {}) {
        const erro = new Error(detalhes.error || `Erro HTTP ${resposta.status}.`);
        erro.status = resposta.status;
        return erro;
    }
    async function apiJson(url, opcoes = {}) {
        const resposta = await fetch(url, {
            credentials: 'same-origin', cache: 'no-store', ...opcoes
        });
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw erroHttp(resposta, dados);
        return dados;
    }
    async function buscarRemoto(item) {
        const remoto = await apiJson(`/api/${item.tipo}/${encodeURIComponent(item.id)}`);
        if (!remoto || String(remoto.id) !== String(item.id) ||
            !Number.isInteger(remoto.revision) || remoto.revision < 1) {
            throw new Error('A nuvem não retornou uma revisão válida para este registro.');
        }
        return remoto;
    }
    async function enviarParaNuvem(item, dados, revisao) {
        return apiJson(`/api/${item.tipo}/${encodeURIComponent(item.id)}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...dados, expected_revision: revisao})
        });
    }
    async function pendenteAtual(item) {
        const atual = (await listarEdicoesOffline(usuario)).find(p => p.chave === item.chave);
        if (!mesmaEdicaoOffline(atual, item)) {
            throw new Error('Esta edição mudou em outra aba. Atualize a lista e compare novamente.');
        }
        return atual;
    }

    // Exibe uma comparação sem usar innerHTML: nomes e dados de alunos não
    // podem ser interpretados como HTML executável.
    async function comparar(item, recipiente) {
        if (ocupado) return;
        if (!navigator.onLine) { mensagem('É preciso conexão para comparar com a nuvem.'); return; }
        bloqueio(true);
        recipiente.replaceChildren(linha('Consultando a revisão atual da nuvem...'));
        let remoto;
        try {
            await pendenteAtual(item);
            remoto = await buscarRemoto(item);
        } catch (erro) {
            console.error(erro);
            const aviso = erro.status === 401 || erro.status === 403
                ? 'Sua sessão não permite consultar este registro. Entre novamente na conta correta.'
                : erro.status === 404
                    ? 'Registro não encontrado na nuvem. A edição local foi preservada.'
                    : `Não foi possível comparar: ${erro.message}`;
            recipiente.replaceChildren(linha(aviso));
            bloqueio(false);
            return;
        }
        bloqueio(false);
        recipiente.replaceChildren();
        recipiente.className = 'edicoes-conflito';
        recipiente.append(linha('Comparação de versões', 'h5'));
        recipiente.append(linha(`Sua edição foi preparada sobre a revisão ${item.expected_revision}. ` +
            `A versão atual da nuvem é a revisão ${remoto.revision}.`));
        recipiente.append(linha('Escolha a origem de cada campo. Por segurança, a nuvem é o padrão. ' +
            'Nenhuma alteração será enviada até você confirmar.'));

        const escolhas = new Map();
        for (const [campo, rotulo] of campos[item.tipo]) {
            const local = normalizar(item.dados[campo]);
            const nuvem = normalizar(remoto[campo]);
            const base = item.base_dados ? normalizar(item.base_dados[campo]) : undefined;
            const bloco = document.createElement('div');
            bloco.className = 'edicoes-campo';
            bloco.append(linha(rotulo, 'strong'));
            const colunas = document.createElement('div');
            colunas.className = 'edicoes-valores';
            for (const [titulo, valor] of [['No dispositivo', local], ['Na nuvem', nuvem]]) {
                const coluna = document.createElement('div');
                coluna.append(linha(titulo, 'small'), linha(valorTexto(valor)));
                colunas.append(coluna);
            }
            bloco.append(colunas);
            if (base !== undefined) bloco.append(linha(`Antes da edição: ${valorTexto(base)}`, 'small'));
            const etiqueta = document.createElement('label');
            etiqueta.textContent = 'Manter neste campo:';
            const seletor = document.createElement('select');
            const remotoOpcao = document.createElement('option');
            remotoOpcao.value = 'nuvem'; remotoOpcao.textContent = 'Versão da nuvem';
            const localOpcao = document.createElement('option');
            localOpcao.value = 'local'; localOpcao.textContent = 'Minha edição no dispositivo';
            seletor.append(remotoOpcao, localOpcao);
            etiqueta.append(seletor);
            escolhas.set(campo, seletor);
            bloco.append(etiqueta);
            recipiente.append(bloco);
        }
        if (item.tipo === 'turmas') {
            recipiente.append(linha('A disciplina vinculada à turma será preservada conforme ' +
                'o cadastro atual da nuvem; essa informação não é editada offline.', 'small'));
        }
        const acoes = document.createElement('div');
        acoes.className = 'edicoes-acoes';
        const aplicar = document.createElement('button');
        aplicar.type = 'button'; aplicar.textContent = 'Aplicar escolhas';
        const manter = document.createElement('button');
        manter.type = 'button'; manter.textContent = 'Manter nuvem e descartar edição';
        const adiar = document.createElement('button');
        adiar.type = 'button'; adiar.textContent = 'Resolver depois';
        acoes.append(aplicar, manter, adiar);
        recipiente.append(acoes);

        adiar.addEventListener('click', () => {
            recipiente.replaceChildren();
            mensagem('Edição local preservada para resolver depois.');
        });
        manter.addEventListener('click', async () => {
            if (ocupado || !confirm('Descartar esta edição do dispositivo? A versão da nuvem será mantida.')) return;
            bloqueio(true);
            try {
                const ok = await removerEdicaoOfflineSeIgual(item);
                mensagem(ok ? 'Edição descartada; a nuvem não foi alterada.' :
                    'Esta edição mudou em outra aba e foi preservada. Atualize a lista.');
                await desenhar();
            } catch (erro) { console.error(erro); mensagem('Falha ao descartar a edição local.'); }
            finally { bloqueio(false); }
        });
        aplicar.addEventListener('click', async () => {
            if (ocupado || !navigator.onLine) { mensagem('Conecte-se à internet antes de aplicar.'); return; }
            const dados = {};
            let alteracoes = 0;
            for (const [campo, seletor] of escolhas) {
                const usarLocal = seletor.value === 'local';
                dados[campo] = usarLocal ? normalizar(item.dados[campo]) : normalizar(remoto[campo]);
                if (usarLocal && dados[campo] !== normalizar(remoto[campo])) alteracoes++;
            }
            if (!dados.nome && !dados.nome_completo) {
                mensagem('Não é possível salvar um registro sem nome.'); return;
            }
            if (!alteracoes) {
                mensagem('Nenhuma diferença local selecionada. Para manter a nuvem, ' +
                    'use “Manter nuvem e descartar edição”.');
                return;
            }
            if (item.tipo === 'turmas') dados.disciplina_id = remoto.disciplina_id || null;
            if (!confirm(`Aplicar ${alteracoes} campo(s) do dispositivo sobre a revisão ` +
                `${remoto.revision} da nuvem? Se ela mudar novamente, nada será sobrescrito.`)) return;
            bloqueio(true);
            try {
                await pendenteAtual(item);
                await enviarParaNuvem(item, dados, remoto.revision);
                const removida = await removerEdicaoOfflineSeIgual(item);
                mensagem(removida ? 'Conflito resolvido: os campos escolhidos foram salvos na nuvem.' :
                    'A nuvem foi atualizada, mas existe outra edição local mais recente. ' +
                    'Ela foi preservada; atualize a lista antes de enviar.');
                await desenhar();
            } catch (erro) {
                if (erro.status === 409 || erro.status === 428) {
                    mensagem('A nuvem foi alterada novamente. Nada foi substituído. ' +
                        'Atualize a comparação antes de escolher.');
                    recipiente.replaceChildren(linha('Conflito atualizado. Clique em Comparar e resolver novamente.'));
                } else {
                    console.error(erro);
                    mensagem(`Não foi possível aplicar: ${erro.message}`);
                }
            } finally { bloqueio(false); }
        });
    }

    async function desenhar() {
        const [copia, pendentes] = await Promise.all([
            obterSnapshot(usuario), listarEdicoesOffline(usuario)
        ]);
        area.replaceChildren();
        area.append(linha(`Edições pendentes: ${pendentes.length}`, 'h4'));
        for (const item of pendentes) {
            const bloco = document.createElement('div');
            bloco.className = 'edicoes-pendente';
            bloco.append(linha(`${item.tipo === 'turmas' ? 'Turma' : 'Aluno'}: ` +
                `${rotuloRegistro(item)} — ` +
                `${item.estado === 'conflito' ? '⚠️ Conflito' : 'Aguardando envio'}`));
            if (item.estado === 'conflito') {
                const botao = document.createElement('button');
                botao.type = 'button'; botao.className = 'notificacoes-atualizar';
                botao.textContent = 'Comparar e resolver';
                const detalhe = document.createElement('div');
                botao.addEventListener('click', () => comparar(item, detalhe));
                bloco.append(botao, detalhe);
            }
            area.append(bloco);
        }
        if (!copia) {
            area.append(linha('Baixe uma cópia da nuvem antes de criar novas edições. ' +
                'As pendências existentes continuam armazenadas.'));
            return;
        }
        for (const tipo of ['turmas', 'alunos']) {
            area.append(linha(tipo === 'turmas' ? 'Turmas' : 'Alunos', 'h4'));
            const seletor = document.createElement('select');
            const inicial = document.createElement('option');
            inicial.value = ''; inicial.textContent = 'Selecione para editar';
            seletor.append(inicial);
            for (const registro of copia[tipo] || []) {
                if (!registro.id) continue;
                const opcao = document.createElement('option');
                opcao.value = String(registro.id);
                opcao.textContent = registro.nome_completo || registro.nome || String(registro.id);
                seletor.append(opcao);
            }
            const formulario = document.createElement('form');
            formulario.className = 'edicoes-formulario';
            formulario.hidden = true;
            const controles = new Map();
            for (const [campo, rotulo] of campos[tipo]) {
                const etiqueta = document.createElement('label');
                etiqueta.textContent = rotulo + ':';
                const input = document.createElement('input');
                input.name = campo; input.type = 'text';
                etiqueta.append(input); formulario.append(etiqueta);
                controles.set(campo, input);
            }
            const botao = document.createElement('button');
            botao.type = 'submit'; botao.className = 'notificacoes-atualizar';
            botao.textContent = 'Salvar alteração no dispositivo'; formulario.append(botao);
            seletor.addEventListener('change', async () => {
                formulario.hidden = !seletor.value;
                if (!seletor.value) return;
                const registro = copia[tipo].find(item => String(item.id) === seletor.value);
                if (!registro) return;
                const pendente = (await listarEdicoesOffline(usuario))
                    .find(item => item.chave === chave(tipo, registro.id));
                for (const [campo, input] of controles) {
                    input.value = String((pendente?.dados || registro)[campo] ?? '');
                }
                if (pendente?.estado === 'conflito') {
                    mensagem('Este registro está em conflito. Se você alterar os campos aqui, ' +
                        'continuará usando a mesma revisão antiga e precisará comparar antes de enviar.');
                }
            });
            formulario.addEventListener('submit', async evento => {
                evento.preventDefault();
                if (ocupado) return;
                const registro = copia[tipo].find(item => String(item.id) === seletor.value);
                if (!registro || !Number.isInteger(registro.revision) || registro.revision < 1) {
                    mensagem('Este registro não tem revisão válida. Baixe uma cópia atualizada antes de editar.');
                    return;
                }
                bloqueio(true);
                try {
                    const existentes = await listarEdicoesOffline(usuario);
                    const anterior = existentes.find(item => item.chave === chave(tipo, registro.id));
                    const dados = Object.fromEntries([...controles].map(([campo, input]) =>
                        [campo, input.value.trim() || null]));
                    if (!(dados.nome || dados.nome_completo)) {
                        mensagem('O nome é obrigatório.'); return;
                    }
                    if (tipo === 'turmas') dados.disciplina_id = registro.disciplina_id || null;
                    const base = Object.fromEntries(campos[tipo].map(([campo]) =>
                        [campo, normalizar(registro[campo])]));
                    await salvarEdicaoOffline({
                        chave: chave(tipo, registro.id), usuario_id: usuario, tipo, id: registro.id,
                        expected_revision: anterior?.expected_revision ?? registro.revision,
                        base_dados: anterior?.base_dados || base,
                        dados, alterado_localmente_em: new Date().toISOString(),
                        estado: anterior?.estado === 'conflito' ? 'conflito' : 'pendente'
                    });
                    mensagem('Alteração salva neste dispositivo. Envie quando estiver conectado; ' +
                        'conflitos exigem comparação manual.');
                    await desenhar();
                } catch (erro) {
                    console.error(erro);
                    mensagem('Falha ao salvar a edição local.');
                } finally { bloqueio(false); }
            });
            area.append(seletor, formulario);
        }
    }

    listar.addEventListener('click', async () => {
        if (ocupado) return;
        bloqueio(true);
        try { await desenhar(); mensagem('Cópia local e pendências carregadas.'); }
        catch (erro) { console.error(erro); mensagem('Não foi possível acessar os dados locais.'); }
        finally { bloqueio(false); }
    });

    enviar.addEventListener('click', async () => {
        if (ocupado) return;
        if (!navigator.onLine) { mensagem('Conecte-se à internet para enviar.'); return; }
        let enviaveis;
        try {
            const pendentes = await listarEdicoesOffline(usuario);
            enviaveis = pendentes.filter(item => item.estado !== 'conflito');
        } catch (erro) {
            console.error(erro);
            mensagem('Não foi possível consultar as edições pendentes neste dispositivo.');
            return;
        }
        if (!enviaveis.length) {
            mensagem('Sem edições para envio. Conflitos devem ser comparados e resolvidos abaixo.');
            return;
        }
        if (!confirm(`Enviar ${enviaveis.length} edição(ões) para a nuvem? ` +
            'Cada registro será verificado pela revisão original.')) return;
        bloqueio(true);
        let enviados = 0, conflitos = 0, falhas = 0;
        try {
            for (const item of enviaveis) {
                try {
                    await pendenteAtual(item);
                    await enviarParaNuvem(item, item.dados, item.expected_revision);
                    if (await removerEdicaoOfflineSeIgual(item)) enviados++;
                    else falhas++;
                } catch (erro) {
                    if (erro.status === 409 || erro.status === 428) {
                        await marcarEdicaoOfflineSeIgual(item, 'conflito');
                        conflitos++;
                    } else { console.error(erro); falhas++; }
                }
            }
            await desenhar();
            mensagem(`Enviadas: ${enviados}. Conflitos preservados: ${conflitos}. ` +
                `Falhas ou edições alteradas em outra aba: ${falhas}. ` +
                'Use Comparar e resolver para escolher o que manter.');
        } catch (erro) { console.error(erro); mensagem('Erro ao consultar pendências.'); }
        finally { bloqueio(false); }
    });
})();
