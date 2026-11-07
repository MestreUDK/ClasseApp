/*
 * ClasseApp — demonstração pública isolada.
 * Não usa fetch(), endpoints privados, autenticação ou armazenamento persistente.
 * Tudo abaixo é fictício e existe somente na memória desta página.
 */
(() => {
    'use strict';

    const PESOS = [2, 3, 2, 3];
    const CORTE = 5;
    const SECOES = ['inicio', 'turmas', 'alunos', 'frequencia', 'notas', 'diario', 'relatorios'];

    const $ = (id) => document.getElementById(id);
    const nomeSeguro = (texto) => String(texto || '').trim();
    const notaTexto = (valor) => valor === null || valor === undefined
        ? '—' : Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const dataHoje = () => {
        const hoje = new Date();
        return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    };
    const dataExtenso = (data) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return 'Data não informada';
        const [ano, mes, dia] = data.split('-');
        return `${dia}/${mes}/${ano}`;
    };

    const estadoInicial = () => ({
        turmas: [
            { id: 't6', nome: '6º A', disciplina: 'Matemática' },
            { id: 't7', nome: '7º A', disciplina: 'Matemática' },
            { id: 't8', nome: '8º A', disciplina: 'Matemática' },
            { id: 't9', nome: '9º A', disciplina: 'Matemática' },
        ],
        alunos: [
            { id: 'a1', turma: 't6', nome: 'Ana Beatriz Costa' },
            { id: 'a2', turma: 't6', nome: 'Bruno Martins Lima' },
            { id: 'a3', turma: 't6', nome: 'Carolina Ribeiro' },
            { id: 'a4', turma: 't6', nome: 'Daniel Souza' },
            { id: 'a5', turma: 't7', nome: 'Eduarda Almeida' },
            { id: 'a6', turma: 't7', nome: 'Felipe Nascimento' },
            { id: 'a7', turma: 't7', nome: 'Gabriela Freitas' },
            { id: 'a8', turma: 't8', nome: 'Henrique Ferreira' },
            { id: 'a9', turma: 't8', nome: 'Isabela Campos' },
            { id: 'a10', turma: 't8', nome: 'João Victor Melo' },
            { id: 'a11', turma: 't9', nome: 'Laura Rodrigues' },
            { id: 'a12', turma: 't9', nome: 'Marcos Pereira' },
            { id: 'a13', turma: 't9', nome: 'Natália Fonseca' },
        ],
        notas: {
            a1: [7, 8, 6, 9, null, null], a2: [4, 3, 6, 7, 8, null],
            a3: [6, 5, 8, 7, null, null], a4: [9, 8, 9, 10, null, null],
            a5: [7, 6, 8, 7, null, null], a6: [4, 6, 3, 7, 9, null],
            a7: [8, 9, 8, 9, null, null], a8: [7, 7, 6, 8, null, null],
            a9: [4, 3, 7, 8, 8, null], a10: [9, 9, 8, 10, null, null],
            a11: [8, 7, 9, 8, null, null], a12: [5, 6, 7, 6, null, null],
            a13: [6, 8, 7, 9, null, null],
        },
        frequencias: {},
        diario: [
            { id: 'd1', titulo: 'Revisão de frações', data: '2026-09-03', texto: 'Revisão de equivalência e comparação de frações com a turma do 6º ano.' },
            { id: 'd2', titulo: 'Atividade de porcentagem', data: '2026-09-10', texto: 'Situações-problema sobre descontos e acréscimos.' },
        ],
        turmaAtual: 't6',
        proximoId: 20,
    });

    let estado = estadoInicial();
    let mensagemTimeout = null;

    function alunosDaTurma(turmaId = estado.turmaAtual) {
        return estado.alunos.filter(aluno => aluno.turma === turmaId)
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }

    function novaTag(tag, texto, classe = '') {
        const elemento = document.createElement(tag);
        elemento.textContent = String(texto);
        if (classe) elemento.className = classe;
        return elemento;
    }

    function botao(texto, classe, onClick) {
        const elemento = novaTag('button', texto, classe);
        elemento.type = 'button';
        elemento.addEventListener('click', onClick);
        return elemento;
    }

    function vazio(local, mensagem) {
        local.replaceChildren(novaTag('p', mensagem, 'demo-empty'));
    }

    function avisar(mensagem) {
        const local = $('demo-feedback');
        local.textContent = mensagem;
        local.hidden = false;
        if (mensagemTimeout) clearTimeout(mensagemTimeout);
        mensagemTimeout = setTimeout(() => { local.hidden = true; }, 4500);
    }

    function selecionarTurma(turmaId) {
        if (!estado.turmas.some(turma => turma.id === turmaId)) return;
        estado.turmaAtual = turmaId;
        atualizar();
    }

    function mostrarSecao(secao) {
        if (!SECOES.includes(secao)) return;
        for (const nome of SECOES) {
            $(`view-${nome}`).hidden = nome !== secao;
        }
        document.querySelectorAll('.demo-nav-btn').forEach(elemento => {
            const ativa = elemento.dataset.view === secao;
            elemento.classList.toggle('is-active', ativa);
            if (ativa) elemento.setAttribute('aria-current', 'page');
            else elemento.removeAttribute('aria-current');
        });
        if (window.location.hash !== `#${secao}`) {
            history.replaceState(null, '', `#${secao}`);
        }
        atualizar();
    }

    function linhaTurma(turma, comAcao = true) {
        const total = alunosDaTurma(turma.id).length;
        const item = document.createElement('div');
        item.className = 'demo-item';
        const principal = document.createElement('div');
        principal.className = 'demo-item-main';
        principal.append(novaTag('strong', turma.nome), novaTag('small', `${turma.disciplina} · ${total} aluno(s)`));
        item.append(principal);
        if (comAcao) item.append(botao('Ver alunos', 'demo-soft', () => {
            selecionarTurma(turma.id);
            mostrarSecao('alunos');
        }));
        return item;
    }

    function resumoFrequencia() {
        let presencas = 0;
        let ausencias = 0;
        Object.values(estado.frequencias).forEach(chamada => {
            Object.values(chamada).forEach(situacao => {
                if (situacao === 'P') presencas += 1;
                if (situacao === 'F') ausencias += 1;
            });
        });
        return presencas + ausencias ? `${Math.round(presencas * 100 / (presencas + ausencias))}%` : '—';
    }

    function renderInicio() {
        $('stat-turmas').textContent = estado.turmas.length;
        $('stat-alunos').textContent = estado.alunos.length;
        $('stat-frequencia').textContent = resumoFrequencia();
        const local = $('resumo-turmas');
        local.replaceChildren(...estado.turmas.map(turma => linhaTurma(turma)));
    }

    function renderTurmas() {
        const local = $('lista-turmas');
        local.replaceChildren(...estado.turmas.map(turma => linhaTurma(turma)));
    }

    function renderSeletores() {
        document.querySelectorAll('[data-turma-select]').forEach(select => {
            select.replaceChildren(...estado.turmas.map(turma => {
                const option = document.createElement('option');
                option.value = turma.id;
                option.textContent = `${turma.nome} · ${turma.disciplina}`;
                return option;
            }));
            select.value = estado.turmaAtual;
        });
    }

    function renderAlunos() {
        const pesquisa = nomeSeguro($('buscar-aluno').value).toLocaleLowerCase('pt-BR');
        const encontrados = alunosDaTurma().filter(aluno => aluno.nome.toLocaleLowerCase('pt-BR').includes(pesquisa));
        const local = $('lista-alunos');
        if (!encontrados.length) return vazio(local, 'Nenhum aluno encontrado nesta turma.');
        local.replaceChildren(...encontrados.map(aluno => {
            const item = document.createElement('div');
            item.className = 'demo-item';
            const principal = document.createElement('div');
            principal.className = 'demo-item-main';
            principal.append(novaTag('strong', aluno.nome), novaTag('small', 'Matrícula de demonstração'));
            item.append(principal);
            return item;
        }));
    }

    function chaveFrequencia() {
        return `${estado.turmaAtual}::${$('frequencia-data').value}`;
    }

    function renderFrequencia() {
        const chave = chaveFrequencia();
        const chamada = estado.frequencias[chave] || {};
        const alunos = alunosDaTurma();
        const presentes = alunos.filter(aluno => chamada[aluno.id] === 'P').length;
        const faltas = alunos.filter(aluno => chamada[aluno.id] === 'F').length;
        $('frequencia-resumo').textContent = `${presentes} presente(s) · ${faltas} falta(s) · ${alunos.length - presentes - faltas} sem marcação`;
        const local = $('frequencia-lista');
        if (!alunos.length) return vazio(local, 'Cadastre alunos fictícios para simular uma chamada.');
        local.replaceChildren(...alunos.map(aluno => {
            const item = document.createElement('div');
            item.className = 'demo-item';
            item.append(novaTag('span', aluno.nome));
            const acoes = document.createElement('div');
            acoes.className = 'demo-inline-actions';
            const situacao = chamada[aluno.id];
            const presente = botao('Presente', `demo-choice ${situacao === 'P' ? 'is-present' : ''}`, () => marcarFrequencia(aluno.id, 'P'));
            const ausente = botao('Falta', `demo-choice ${situacao === 'F' ? 'is-absent' : ''}`, () => marcarFrequencia(aluno.id, 'F'));
            presente.setAttribute('aria-pressed', situacao === 'P');
            ausente.setAttribute('aria-pressed', situacao === 'F');
            acoes.append(presente, ausente);
            item.append(acoes);
            return item;
        }));
    }

    function marcarFrequencia(id, situacao) {
        if (!$('frequencia-data').value) return avisar('Escolha uma data para a chamada.');
        const chave = chaveFrequencia();
        if (!estado.frequencias[chave]) estado.frequencias[chave] = {};
        estado.frequencias[chave][id] = situacao;
        renderFrequencia();
        renderInicio();
    }

    function escolherCandidata(notas, inicio) {
        // A recuperação não tem peso próprio: herda o da avaliação recuperada.
        const possiveis = [inicio, inicio + 1]
            .filter(indice => Number.isFinite(notas[indice]) && notas[indice] < CORTE);
        return possiveis.sort((a, b) => PESOS[b] - PESOS[a])[0];
    }

    function rendimento(alunoId) {
        const valores = estado.notas[alunoId] || [null, null, null, null, null, null];
        const originais = valores.slice(0, 4);
        const efetivas = [...originais];
        const recuperacoes = [{ indice: 4, base: 0 }, { indice: 5, base: 2 }];
        const cobertas = [];
        for (const recuperacao of recuperacoes) {
            const nota = valores[recuperacao.indice];
            if (!Number.isFinite(nota)) continue;
            const alvo = escolherCandidata(originais, recuperacao.base);
            if (alvo !== undefined && nota > originais[alvo]) {
                efetivas[alvo] = nota;
                cobertas.push(`${recuperacao.indice === 4 ? 'REC1' : 'REC2'} → ${alvo + 1}ª`);
            }
        }
        const completa = efetivas.every(Number.isFinite);
        const media = completa
            ? efetivas.reduce((soma, valor, indice) => soma + valor * PESOS[indice], 0) / 10
            : null;
        return { originais, efetivas, media, cobertas };
    }

    function inputNota(aluno, indice) {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = '10';
        input.step = '0.5';
        input.inputMode = 'decimal';
        input.placeholder = '—';
        input.setAttribute('aria-label', `${aluno.nome} · ${indice === 4 ? '1ª recuperação' : indice === 5 ? '2ª recuperação' : `${indice + 1}ª avaliação`}`);
        const valor = (estado.notas[aluno.id] || [])[indice];
        if (Number.isFinite(valor)) input.value = valor;
        input.addEventListener('change', () => {
            const texto = input.value.trim();
            if (texto !== '' && (!Number.isFinite(Number(texto)) || Number(texto) < 0 || Number(texto) > 10)) {
                avisar('Use notas de 0 a 10.');
                requestAnimationFrame(renderNotas);
                return;
            }
            if (!estado.notas[aluno.id]) estado.notas[aluno.id] = [null, null, null, null, null, null];
            estado.notas[aluno.id][indice] = texto === '' ? null : Number(texto);
            // Aguarda o encerramento do evento change/blur antes de trocar o DOM.
            requestAnimationFrame(() => { renderNotas(); renderRelatorios(); });
        });
        return input;
    }

    function renderNotas() {
        const local = $('notas-tabela');
        const linhas = alunosDaTurma().map(aluno => {
            const linha = document.createElement('tr');
            const detalhes = rendimento(aluno.id);
            const primeira = document.createElement('td');
            primeira.append(novaTag('strong', aluno.nome));
            if (detalhes.cobertas.length) primeira.append(novaTag('small', detalhes.cobertas.join(' · ')));
            linha.append(primeira);
            for (const indice of [0, 1, 4, 2, 3, 5]) {
                const coluna = document.createElement('td');
                coluna.append(inputNota(aluno, indice));
                linha.append(coluna);
            }
            const media = document.createElement('td');
            media.append(novaTag('strong', notaTexto(detalhes.media)));
            linha.append(media);
            return linha;
        });
        local.replaceChildren(...linhas);
    }

    function renderDiario() {
        const local = $('diario-lista');
        if (!estado.diario.length) return vazio(local, 'Ainda não há registros na demonstração.');
        local.replaceChildren(...[...estado.diario].reverse().map(registro => {
            const item = document.createElement('div');
            item.className = 'demo-item';
            const principal = document.createElement('div');
            principal.className = 'demo-item-main';
            principal.append(novaTag('strong', registro.titulo), novaTag('small', `${dataExtenso(registro.data)} · ${registro.texto}`));
            item.append(principal, botao('Excluir', 'demo-danger', () => {
                estado.diario = estado.diario.filter(nota => nota.id !== registro.id);
                renderDiario();
                avisar('Anotação fictícia excluída.');
            }));
            return item;
        }));
    }

    function renderRelatorios() {
        const local = $('relatorios-tabela');
        local.replaceChildren(...alunosDaTurma().map(aluno => {
            const linha = document.createElement('tr');
            const detalhes = rendimento(aluno.id);
            const campos = [aluno.nome, ...detalhes.originais.map(notaTexto), notaTexto(detalhes.media)];
            campos.forEach((campo, indice) => linha.append(novaTag('td', campo)));
            return linha;
        }));
    }

    function atualizar() {
        renderSeletores();
        renderInicio();
        renderTurmas();
        renderAlunos();
        renderFrequencia();
        renderNotas();
        renderDiario();
        renderRelatorios();
    }

    function sanitizarCsv(valor) {
        // Evita que nomes inseridos pelo visitante sejam interpretados como fórmulas no Excel.
        let texto = String(valor === null || valor === undefined ? '' : valor);
        if (/^[\s\u0000-\u001f]*[=+\-@]/.test(texto)) texto = `'${texto}`;
        return `"${texto.replace(/"/g, '""')}"`;
    }

    function baixarRelatorio() {
        const turma = estado.turmas.find(item => item.id === estado.turmaAtual);
        const linhas = [['Aluno', '1ª AV', '2ª AV', '3ª AV', '4ª AV', 'REC 1', 'REC 2', 'Média ponderada']];
        alunosDaTurma().forEach(aluno => {
            const notas = estado.notas[aluno.id] || [null, null, null, null, null, null];
            const { media } = rendimento(aluno.id);
            linhas.push([aluno.nome, ...notas.slice(0, 4).map(notaTexto), notaTexto(notas[4]), notaTexto(notas[5]), notaTexto(media)]);
        });
        const csv = '\ufeff' + linhas.map(campos => campos.map(sanitizarCsv).join(';')).join('\r\n');
        const objectURL = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = objectURL;
        link.download = `ClasseApp-Demonstracao-${turma.nome.replace(/[^0-9a-zA-Z]/g, '')}.csv`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
        avisar('CSV fictício gerado. Nenhum dado real foi consultado.');
    }

    function configurarEventos() {
        document.querySelectorAll('.demo-nav-btn').forEach(elemento => {
            elemento.addEventListener('click', () => mostrarSecao(elemento.dataset.view));
        });
        document.querySelectorAll('[data-turma-select]').forEach(select => {
            select.addEventListener('change', () => selecionarTurma(select.value));
        });
        $('demo-reiniciar').addEventListener('click', () => {
            if (!window.confirm('Reiniciar todas as alterações fictícias desta demonstração?')) return;
            estado = estadoInicial();
            $('buscar-aluno').value = '';
            atualizar();
            mostrarSecao('inicio');
            avisar('Demonstração reiniciada.');
        });
        $('form-turma').addEventListener('submit', (evento) => {
            evento.preventDefault();
            const nome = nomeSeguro($('nova-turma-nome').value);
            const disciplina = nomeSeguro($('nova-turma-disciplina').value);
            if (!nome || !disciplina) return;
            const id = `t${estado.proximoId++}`;
            estado.turmas.push({ id, nome, disciplina });
            $('form-turma').reset();
            selecionarTurma(id);
            avisar('Turma fictícia adicionada.');
        });
        $('buscar-aluno').addEventListener('input', renderAlunos);
        $('form-aluno').addEventListener('submit', (evento) => {
            evento.preventDefault();
            const nome = nomeSeguro($('novo-aluno').value);
            if (!nome) return;
            estado.alunos.push({ id: `a${estado.proximoId++}`, turma: estado.turmaAtual, nome });
            $('novo-aluno').value = '';
            $('buscar-aluno').value = '';
            atualizar();
            avisar('Aluno fictício cadastrado.');
        });
        $('frequencia-data').addEventListener('change', renderFrequencia);
        $('frequencia-todos').addEventListener('click', () => {
            const chave = chaveFrequencia();
            if (!$('frequencia-data').value) return avisar('Escolha a data da chamada.');
            if (!estado.frequencias[chave]) estado.frequencias[chave] = {};
            alunosDaTurma().forEach(aluno => { estado.frequencias[chave][aluno.id] = 'P'; });
            renderFrequencia();
            renderInicio();
        });
        $('frequencia-salvar').addEventListener('click', () => {
            avisar('Chamada registrada somente nesta demonstração. Nenhum dado foi enviado.');
        });
        $('form-diario').addEventListener('submit', (evento) => {
            evento.preventDefault();
            const titulo = nomeSeguro($('diario-titulo').value);
            const data = $('diario-data').value;
            const texto = nomeSeguro($('diario-texto').value);
            if (!titulo || !data || !texto) return;
            estado.diario.push({ id: `d${estado.proximoId++}`, titulo, data, texto });
            $('form-diario').reset();
            $('diario-data').value = dataHoje();
            renderDiario();
            avisar('Anotação fictícia adicionada.');
        });
        $('relatorios-exportar').addEventListener('click', baixarRelatorio);
    }

    $('frequencia-data').value = dataHoje();
    $('diario-data').value = dataHoje();
    configurarEventos();
    mostrarSecao(SECOES.includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'inicio');
})();
