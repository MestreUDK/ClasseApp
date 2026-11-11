/* Download versionado da cópia acadêmica local, incluindo chamadas anuais. */
(() => {
    'use strict';
    const painel = document.getElementById('dados-offline');
    if (!painel || painel.dataset.offlineInicializado === '1') return;
    painel.dataset.offlineInicializado = '1';
    const usuario = painel.dataset.userId;
    const el = id => document.getElementById(id);
    const estado = el('offline-estado');
    const resumo = el('offline-resumo');
    const pendenciasResumo = el('offline-pendencias-resumo');
    const pendenciasLista = el('offline-pendencias-lista');
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
            ? `Cópia de ${new Date(copia.salvo_em).toLocaleString('pt-BR')}: ${copia.turmas.length} turma(s), ${copia.alunos.length} aluno(s), ${copia.avaliacoes?.length ?? 0} avaliação(ões), ${copia.diario?.length ?? 0} registro(s) de diário e ${copia.frequencias?.length ?? 0} chamada(s) de ${copia.ano_letivo ?? 'ano não definido'}.`
            : 'Nenhuma cópia local desta conta neste navegador.';
        return copia;
    }


    async function atualizarResumoPendencias() {
        if (!pendenciasResumo) return;
        try {
            const pendentes = await listarEdicoesOffline(usuario);
            const conflitos = pendentes.filter(item => item.estado === 'conflito').length;
            pendenciasLista.replaceChildren();
            if (pendentes.length) {
                const lista = document.createElement('ul');
                for (const item of pendentes) {
                    const linha = document.createElement('li');
                    const nome = item.dados?.nome_completo || item.dados?.nome || String(item.id);
                    linha.textContent = `${item.tipo === 'turmas' ? 'Turma' : 'Aluno'}: ${nome} — ` +
                        (item.estado === 'conflito' ? 'conflito a resolver' : 'alteração ainda não enviada');
                    lista.append(linha);
                }
                pendenciasLista.append(lista);
            }
            pendenciasResumo.textContent = pendentes.length
                ? `${pendentes.length} edição(ões) aguardando envio neste dispositivo` +
                    (conflitos ? `, incluindo ${conflitos} conflito(s).` : '.')
                : 'Não há edições de turmas ou alunos aguardando envio neste dispositivo.';
        } catch (_) {
            pendenciasResumo.textContent = 'Não foi possível consultar as edições locais.';
        }
    }
    document.addEventListener('classeapp:edicoes-atualizadas', () => {
        atualizarResumoPendencias();
        const resultado = el('offline-comparacao');
        if (resultado && !resultado.hidden) {
            resultado.hidden = true;
            estado.textContent = 'As edições locais mudaram. Clique em “Ver diferenças e edições pendentes” para atualizar.';
        }
    });
    async function carregarApi(caminho) {
        const resposta = await fetch(caminho, {credentials: 'same-origin', cache: 'no-store'});
        if (!resposta.ok) throw new Error(`Falha HTTP ${resposta.status}`);
        const dados = await resposta.json();
        if (!Array.isArray(dados)) throw new Error('Resposta inesperada da API');
        return dados;
    }

    async function carregarObjetoApi(caminho) {
        const resposta = await fetch(caminho, {credentials: 'same-origin', cache: 'no-store'});
        if (!resposta.ok) throw new Error(`Falha HTTP ${resposta.status}`);
        const dados = await resposta.json();
        if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
            throw new Error('Resposta inválida da API de notas.');
        }
        return dados;
    }

    el('offline-baixar').addEventListener('click', async () => {
        if (ocupado) return;
        if (!navigator.onLine) { estado.textContent = 'Conecte-se à internet para baixar os dados.'; return; }
        if (!await obterAcessoOffline(usuario)) {
            estado.textContent = 'Ative a senha e a criptografia local nas Configurações antes de baixar os dados.';
            return;
        }
        if (!confirm('Baixar turmas, alunos, notas e diário neste dispositivo? Esses dados escolares são sensíveis e permanecerão armazenados no navegador.')) return;
        bloquear(true);
        const anoLetivo = Number(el('offline-ano')?.value);
        if (!Number.isInteger(anoLetivo) || anoLetivo < 2000 || anoLetivo > 2100) {
            bloquear(false);
            estado.textContent = 'Informe um ano letivo válido entre 2000 e 2100.';
            return;
        }
        estado.textContent = `Baixando turmas, alunos, notas, diário e frequências de ${anoLetivo}...`;
        try {
            // Mantém também os vínculos turma↔aluno. O aluno pode participar de
            // mais de uma turma, e a tabela alunos não contém campo turma_id.
            // Uma falha em qualquer requisição preserva a cópia anterior.
            const [turmas, alunos] = await Promise.all([
                carregarApi('/api/turmas'), carregarApi('/api/alunos')
            ]);
            if (turmas.length >= 1000 || alunos.length >= 1000) {
                throw new Error('Limite de registros atingido. Cópia antiga preservada.');
            }
            const vinculos = [];
            // Evita disparar dezenas de consultas simultâneas ao Supabase.
            for (let inicio = 0; inicio < turmas.length; inicio += 4) {
                const lote = turmas.slice(inicio, inicio + 4);
                const registros = await Promise.all(lote.map(turma =>
                    carregarApi(`/api/turmas/${encodeURIComponent(turma.id)}/alunos_vinculados`)));
                registros.forEach((lista, indice) => {
                    lista.forEach(item => {
                        if (item?.alunos?.id) vinculos.push({
                            turma_id: lote[indice].id, aluno_id: item.alunos.id
                        });
                    });
                });
            }
            // Carrega todos os módulos antes de substituir a cópia. Qualquer
            // erro preserva o snapshot anterior; nunca salva uma cópia incompleta.
            const [diario, grupos] = await Promise.all([
                carregarApi('/api/diario'),
                (async () => {
                    const lista = [];
                    for (let inicio = 0; inicio < turmas.length; inicio += 4) {
                        const lote = await Promise.all(turmas.slice(inicio, inicio + 4).map(turma =>
                            carregarApi(`/api/turma/${encodeURIComponent(turma.id)}/avaliacoes`)));
                        lote.forEach(avaliacoes => lista.push(...avaliacoes));
                    }
                    return lista;
                })()
            ]);
            if (diario.length >= 1000 || grupos.length >= 1000) {
                throw new Error('Limite de avaliações ou diário atingido. Cópia antiga preservada.');
            }
            const notas = [];
            for (let inicio = 0; inicio < grupos.length; inicio += 4) {
                const respostas = await Promise.all(grupos.slice(inicio, inicio + 4).map(av =>
                    carregarObjetoApi(`/api/avaliacao/${encodeURIComponent(av.id)}/diario`)));
                respostas.forEach((dados, i) => {
                    const av = grupos[inicio + i];
                    // Esta API devolve objeto e não lista; valida para não salvar
                    // dados parciais ou em formato inesperado.
                    if (!dados || !Array.isArray(dados.alunos) || !dados.avaliacao) {
                        throw new Error('Dados de notas incompletos.');
                    }
                    if (dados.alunos.length >= 1000) {
                        throw new Error('Limite de alunos por avaliação atingido.');
                    }
                    for (const aluno of dados.alunos) {
                        notas.push({avaliacao_id: av.id, aluno_id: aluno.id,
                            nota_id: aluno.nota_id || null,
                            valor: aluno.nota, revision: aluno.revision,
                            recupera_periodo: aluno.recupera_periodo ?? null});
                    }
                });
            }
            // Frequência é coletada por ano e turma, com permissão validada no servidor.
            // Se alguma chamada falhar, não substituímos a cópia existente.
            const frequencias = [];
            for (let inicio = 0; inicio < turmas.length; inicio += 3) {
                const lote = await Promise.all(turmas.slice(inicio, inicio + 3).map(turma =>
                    carregarApi(`/api/turma/${encodeURIComponent(turma.id)}/frequencias_ano?ano=${anoLetivo}`)));
                lote.forEach(registros => frequencias.push(...registros));
                if (frequencias.length > 100000) {
                    throw new Error('Limite de frequência excedido. Cópia anterior preservada.');
                }
            }
            await salvarSnapshotVersionado({
                usuario_id: usuario, salvo_em: new Date().toISOString(), ano_letivo: anoLetivo,
                turmas, alunos, vinculos, avaliacoes: grupos, notas, diario, frequencias
            });
            estado.textContent = `Cópia completa salva, incluindo frequências de ${anoLetivo}.`;
            await atualizar();
        } catch (erro) {
            console.error(erro);
            estado.textContent = `Não foi possível baixar todos os dados: ${erro.message}. Cópia anterior preservada.`;
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
                ['Turmas', copia.turmas, 'nome'], ['Alunos', copia.alunos, 'nome_completo'],
                ['Avaliações', copia.avaliacoes || [], 'nome'], ['Diário', copia.diario || [], 'titulo']
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
            if (!confirm('Exportar arquivo JSON com dados pessoais, notas e diário escolar? Guarde-o em local seguro.')) return;
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
                if (!['created_at', 'updated_at', 'revision'].includes(chave)) {
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

    // Uma única visão: diferenças entre a cópia baixada e a nuvem, além das
    // alterações que estão aguardando envio e NÃO fazem parte da cópia base.
    el('offline-comparar').addEventListener('click', async () => {
        if (ocupado) return;
        const resultado = el('offline-comparacao');
        resultado.hidden = true;
        resultado.replaceChildren();
        if (!navigator.onLine) {
            estado.textContent = 'Para comparar com a nuvem, conecte-se. As edições locais seguem salvas.';
            return;
        }
        bloquear(true);
        estado.textContent = 'Consultando cópia base, edições locais e nuvem...';
        try {
            const [copia, pendentes] = await Promise.all([
                obterSnapshot(usuario), listarEdicoesOffline(usuario)
            ]);
            if (!copia) {
                estado.textContent = 'Baixe uma cópia local antes de comparar.';
                return;
            }
            const [turmas, alunos] = await Promise.all([
                carregarApi('/api/turmas'), carregarApi('/api/alunos')
            ]);
            const conjuntos = [
                ['Turmas', 'turmas', copia.turmas, turmas],
                ['Alunos', 'alunos', copia.alunos, alunos]
            ];
            const cabecalho = document.createElement('h4');
            cabecalho.textContent = 'Comparação em duas camadas';
            resultado.append(cabecalho);
            const orientacao = document.createElement('p');
            orientacao.textContent = '1) A cópia baixada é uma referência antiga e não inclui automaticamente suas edições. ' +
                '2) As edições pendentes são comparadas separadamente com a versão atual da nuvem. ' +
                'Nenhum dado será enviado nesta tela.';
            resultado.append(orientacao);
            let totalBase = 0;
            let totalPendencias = 0;
            for (const [nome, tipo, locais, remotos] of conjuntos) {
                const diferencas = compararColecao(locais, remotos);
                const titulo = document.createElement('h4');
                titulo.textContent = `${nome} — cópia baixada × nuvem`;
                resultado.append(titulo);
                const lista = document.createElement('ul');
                for (const [rotulo, itens] of [
                    ['Somente na cópia baixada', diferencas.apenasLocal],
                    ['Somente na nuvem', diferencas.apenasNuvem],
                    ['Alterados desde o último download', diferencas.diferentes]
                ]) {
                    totalBase += itens.length;
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
                const indiceRemoto = new Map(remotos.map(item => [String(item.id), item]));
                const edicoes = pendentes.filter(item => item.tipo === tipo);
                totalPendencias += edicoes.length;
                const sub = document.createElement('h4');
                sub.textContent = `${nome} — minhas edições ainda não enviadas (${edicoes.length})`;
                resultado.append(sub);
                if (!edicoes.length) {
                    const nenhum = document.createElement('p');
                    nenhum.textContent = 'Nenhuma edição pendente.';
                    resultado.append(nenhum);
                }
                for (const edicao of edicoes) {
                    const remoto = indiceRemoto.get(String(edicao.id));
                    const detalhe = document.createElement('details');
                    const tituloEdicao = document.createElement('summary');
                    tituloEdicao.textContent = (edicao.dados?.nome_completo || edicao.dados?.nome || String(edicao.id)) +
                        (edicao.estado === 'conflito' ? ' — ⚠ Conflito identificado' : ' — Aguardando envio');
                    detalhe.append(tituloEdicao);
                    const resumoRev = document.createElement('p');
                    resumoRev.textContent = !remoto ? 'Registro não encontrado na nuvem. A edição local será preservada.' :
                        `Base da edição: revisão ${edicao.expected_revision}; nuvem: revisão ${remoto.revision ?? '?'}${remoto.revision !== edicao.expected_revision ? ' — revisões diferentes' : ''}.`;
                    detalhe.append(resumoRev);
                    const comparacoes = document.createElement('ul');
                    for (const [campo, valorLocal] of Object.entries(edicao.dados || {})) {
                        if (campo === 'disciplina_id') continue;
                        const valorRemoto = remoto?.[campo];
                        if (JSON.stringify(valorLocal ?? null) === JSON.stringify(valorRemoto ?? null)) continue;
                        const linha = document.createElement('li');
                        const formato = valor => valor == null || valor === '' ? '(vazio)' : String(valor);
                        linha.textContent = `${campo}: dispositivo “${formato(valorLocal)}” / nuvem “${formato(valorRemoto)}”`;
                        comparacoes.append(linha);
                    }
                    if (!comparacoes.children.length) {
                        const igual = document.createElement('li');
                        igual.textContent = 'Os campos editáveis possuem os mesmos valores na nuvem.';
                        comparacoes.append(igual);
                    }
                    detalhe.append(comparacoes);
                    resultado.append(detalhe);
                }
            }
            const rodape = document.createElement('p');
            rodape.textContent = `Diferenças da cópia original: ${totalBase}. Edições pendentes separadas: ${totalPendencias}. ` +
                'Para resolver conflitos ou enviar, use “Editar dados locais” e “Enviar edições pendentes” abaixo.';
            resultado.append(rodape);
            resultado.hidden = false;
            estado.textContent = 'Comparação concluída sem alterar os dados.';
            await atualizarResumoPendencias();
        } catch (erro) {
            console.error(erro);
            estado.textContent = 'Falha ao comparar. Confirme sua conexão e sessão; nenhuma edição foi apagada.';
        } finally { bloquear(false); }
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

    atualizar().catch(() => { estado.textContent = 'Dados locais protegidos. Clique em “Desbloquear dados locais” acima para consultá-los; o login online continua funcionando.'; });
    atualizarResumoPendencias();
})();
