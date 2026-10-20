/* Cópia local SOMENTE LEITURA de turmas e alunos da conta atual. */
(() => {
    'use strict';
    const painel = document.getElementById('dados-offline');
    if (!painel || painel.dataset.offlineInicializado === '1') return;
    painel.dataset.offlineInicializado = '1';
    const usuario = painel.dataset.userId;
    const el = id => document.getElementById(id);
    const estado = el('offline-estado');
    const resumo = el('offline-resumo');
    const area = el('offline-dados');
    const botoes = ['offline-baixar', 'offline-consultar', 'offline-exportar', 'offline-apagar', 'offline-comparar', 'offline-versoes'].map(el);
    let ocupado = false;

    function bloquear(valor) {
        ocupado = valor;
        botoes.forEach(botao => { botao.disabled = valor; });
    }

    async function atualizar() {
        const copia = await obterSnapshot(usuario);
        resumo.textContent = copia
            ? `Cópia de ${new Date(copia.salvo_em).toLocaleString('pt-BR')}: ${copia.turmas.length} turma(s) e ${copia.alunos.length} aluno(s).`
            : 'Nenhuma cópia local desta conta neste navegador.';
        return copia;
    }

    async function carregarApi(caminho) {
        const resposta = await fetch(caminho, {credentials: 'same-origin', cache: 'no-store'});
        if (!resposta.ok) throw new Error(`Falha HTTP ${resposta.status}`);
        const dados = await resposta.json();
        if (!Array.isArray(dados)) throw new Error('Resposta inesperada da API');
        return dados;
    }

    el('offline-baixar').addEventListener('click', async () => {
        if (ocupado) return;
        if (!navigator.onLine) { estado.textContent = 'Conecte-se à internet para baixar os dados.'; return; }
        if (!confirm('Salvar turmas e alunos neste navegador? Dados pessoais poderão permanecer no dispositivo.')) return;
        bloquear(true);
        estado.textContent = 'Baixando turmas e alunos...';
        try {
            // Não substituir uma cópia válida se qualquer requisição falhar.
            const [turmas, alunos] = await Promise.all([
                carregarApi('/api/turmas'), carregarApi('/api/alunos')
            ]);
            await salvarSnapshotVersionado({usuario_id: usuario, salvo_em: new Date().toISOString(), turmas, alunos});
            estado.textContent = 'Cópia de consulta salva neste dispositivo.';
            await atualizar();
        } catch (erro) {
            console.error(erro);
            estado.textContent = 'Não foi possível baixar todos os dados. Cópia anterior preservada.';
        } finally { bloquear(false); }
    });

    el('offline-consultar').addEventListener('click', async () => {
        if (ocupado) return;
        bloquear(true);
        try {
            const copia = await atualizar();
            area.replaceChildren();
            if (!copia) { estado.textContent = 'Baixe os dados primeiro.'; return; }
            for (const [titulo, itens, campo] of [
                ['Turmas', copia.turmas, 'nome'], ['Alunos', copia.alunos, 'nome_completo']
            ]) {
                const cabecalho = document.createElement('h4');
                cabecalho.textContent = `${titulo} (${itens.length})`;
                area.append(cabecalho);
                const lista = document.createElement('ul');
                for (const item of itens) {
                    const linha = document.createElement('li');
                    linha.textContent = item[campo] || '(Sem nome)';
                    lista.append(linha);
                }
                area.append(lista);
            }
            area.hidden = false;
            estado.textContent = 'Exibindo cópia local somente para consulta.';
        } catch (erro) { estado.textContent = 'Falha ao consultar a cópia local.'; }
        finally { bloquear(false); }
    });

    el('offline-exportar').addEventListener('click', async () => {
        if (ocupado) return;
        bloquear(true);
        try {
            const copia = await obterSnapshot(usuario);
            if (!copia) { estado.textContent = 'Nenhuma cópia disponível para exportar.'; return; }
            if (!confirm('Exportar arquivo JSON com dados pessoais de alunos? Guarde-o em local seguro.')) return;
            const blob = new Blob([JSON.stringify(copia, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `classeapp-consulta-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
            estado.textContent = 'Arquivo de consulta exportado.';
        } catch (erro) { estado.textContent = 'Não foi possível exportar a cópia.'; }
        finally { bloquear(false); }
    });

    // Comparação somente leitura. Não sincroniza nem altera dados remotos ou locais.
    function normalizar(valor) {
        if (Array.isArray(valor)) return valor.map(normalizar);
        if (valor && typeof valor === 'object') {
            const saida = {};
            Object.keys(valor).sort().forEach(chave => {
                if (!['created_at', 'updated_at'].includes(chave)) {
                    saida[chave] = normalizar(valor[chave]);
                }
            });
            return saida;
        }
        return valor === undefined ? null : valor;
    }

    function compararColecao(locais, remotos) {
        const indexar = registros => new Map(registros.filter(item => item && item.id != null)
            .map(item => [String(item.id), item]));
        const local = indexar(locais);
        const remoto = indexar(remotos);
        const apenasLocal = [], apenasNuvem = [], diferentes = [];
        for (const [id, item] of local) {
            if (!remoto.has(id)) apenasLocal.push(item);
            else if (JSON.stringify(normalizar(item)) !== JSON.stringify(normalizar(remoto.get(id)))) {
                diferentes.push(item);
            }
        }
        for (const [id, item] of remoto) {
            if (!local.has(id)) apenasNuvem.push(item);
        }
        return { apenasLocal, apenasNuvem, diferentes };
    }

    el('offline-comparar').addEventListener('click', async () => {
        if (ocupado) return;
        const resultado = el('offline-comparacao');
        resultado.hidden = true;
        resultado.replaceChildren();
        if (!navigator.onLine) {
            estado.textContent = 'É necessária conexão para comparar com a nuvem.';
            return;
        }
        bloquear(true);
        estado.textContent = 'Comparando cópia local com a nuvem...';
        try {
            const copia = await obterSnapshot(usuario);
            if (!copia) {
                estado.textContent = 'Baixe uma cópia local antes de comparar.';
                return;
            }
            const [turmas, alunos] = await Promise.all([
                carregarApi('/api/turmas'), carregarApi('/api/alunos')
            ]);
            const conjuntos = [
                ['Turmas', copia.turmas, turmas],
                ['Alunos', copia.alunos, alunos]
            ];
            let total = 0;
            for (const [nome, locais, remotos] of conjuntos) {
                const diferencas = compararColecao(locais, remotos);
                const titulo = document.createElement('h4');
                titulo.textContent = nome;
                resultado.append(titulo);
                const lista = document.createElement('ul');
                for (const [rotulo, itens] of [
                    ['Somente na cópia local', diferencas.apenasLocal],
                    ['Somente na nuvem', diferencas.apenasNuvem],
                    ['Mesmo ID com dados diferentes', diferencas.diferentes]
                ]) {
                    total += itens.length;
                    const linha = document.createElement('li');
                    linha.textContent = `${rotulo}: ${itens.length}`;
                    lista.append(linha);
                    if (itens.length) {
                        const detalhes = document.createElement('details');
                        const sumario = document.createElement('summary');
                        sumario.textContent = `Ver registros — ${rotulo.toLowerCase()}`;
                        detalhes.append(sumario);
                        const nomes = document.createElement('ul');
                        itens.forEach(item => {
                            const registro = document.createElement('li');
                            registro.textContent = item.nome_completo || item.nome || String(item.id);
                            nomes.append(registro);
                        });
                        detalhes.append(nomes);
                        lista.append(detalhes);
                    }
                }
                resultado.append(lista);
            }
            const aviso = document.createElement('p');
            aviso.textContent = 'Apenas comparação: nenhum dado foi modificado. Campos de data de criação/atualização são ignorados. Registros ausentes podem ter sido excluídos ou criados depois da cópia.';
            resultado.append(aviso);
            resultado.hidden = false;
            estado.textContent = total
                ? `Comparação concluída: ${total} diferença(s) encontrada(s).`
                : 'Comparação concluída: nenhum dado diferente encontrado.';
        } catch (erro) {
            console.error(erro);
            estado.textContent = 'Falha ao comparar. Verifique a conexão e a sessão; nenhum dado foi alterado.';
        } finally {
            bloquear(false);
        }
    });

    el('offline-versoes').addEventListener('click', async () => {
        if (ocupado) return;
        bloquear(true);
        const historico = el('offline-historico');
        historico.replaceChildren();
        try {
            const versoes = await listarVersoesSnapshot(usuario);
            if (!versoes.length) {
                estado.textContent = 'Nenhuma versão anterior. Baixe novamente para criar histórico.';
                return;
            }
            const titulo = document.createElement('h4');
            titulo.textContent = 'Versões anteriores neste dispositivo';
            historico.append(titulo);
            versoes.forEach((versao, indice) => {
                const linha = document.createElement('div');
                linha.style.marginBottom = '10px';
                const rotulo = document.createElement('span');
                const data = new Date(versao.salvo_em);
                rotulo.textContent = `${Number.isNaN(data.getTime()) ? 'Data desconhecida' : data.toLocaleString('pt-BR')} — ${versao.turmas.length} turma(s), ${versao.alunos.length} aluno(s). `;
                const botao = document.createElement('button');
                botao.type = 'button';
                botao.textContent = 'Restaurar cópia local';
                botao.className = 'notificacoes-atualizar';
                botao.addEventListener('click', async () => {
                    if (ocupado) return;
                    if (!confirm('Restaurar esta versão SOMENTE neste dispositivo? A cópia atual ficará no histórico. Nada será enviado à nuvem.')) return;
                    bloquear(true);
                    try {
                        await restaurarVersaoSnapshot(usuario, indice);
                        await atualizar();
                        area.hidden = true;
                        el('offline-comparacao').hidden = true;
                        historico.hidden = true;
                        estado.textContent = 'Versão local restaurada. Nenhum dado da nuvem foi modificado.';
                    } catch (erro) {
                        console.error(erro);
                        estado.textContent = 'Não foi possível restaurar a versão.';
                    } finally { bloquear(false); }
                });
                linha.append(rotulo, botao);
                historico.append(linha);
            });
            historico.hidden = false;
            estado.textContent = `${versoes.length} versão(ões) anterior(es) encontrada(s).`;
        } catch (erro) {
            console.error(erro);
            estado.textContent = 'Falha ao consultar histórico local.';
        } finally { bloquear(false); }
    });

    el('offline-apagar').addEventListener('click', async () => {
        if (ocupado) return;
        bloquear(true);
        try {
            if (!confirm('Apagar a cópia de consulta desta conta neste navegador? Isso não remove dados da nuvem nem frequências pendentes.')) return;
            await apagarSnapshotComHistorico(usuario);
            el('offline-historico').replaceChildren();
            el('offline-historico').hidden = true;
            area.replaceChildren();
            area.hidden = true;
            await atualizar();
            estado.textContent = 'Cópia local apagada.';
        } catch (erro) { estado.textContent = 'Falha ao apagar cópia local.'; }
        finally { bloquear(false); }
    });

    atualizar().catch(() => { estado.textContent = 'Armazenamento local indisponível.'; });
})();
