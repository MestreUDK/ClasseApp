// static/js/visualizar_compartilhado.js

const CODIGO = window.CODIGO_COMPARTILHAMENTO;

let dadosCompartilhados = null;
let els = {};

document.addEventListener('DOMContentLoaded', () => {
    els = {
        status: document.getElementById('status-compartilhado'),
        conteudo: document.getElementById('conteudo-compartilhado'),

        nomeTurma: document.getElementById('nome-turma'),
        descricaoTurma: document.getElementById('descricao-turma'),
        tags: document.getElementById('tags-compartilhamento'),

        listaAlunos: document.getElementById('lista-alunos'),

        secaoFrequencia: document.getElementById('secao-frequencia'),
        listaFrequencia: document.getElementById('lista-frequencia'),

        secaoNotas: document.getElementById('secao-notas'),
        listaNotas: document.getElementById('lista-notas'),

        secaoDiario: document.getElementById('secao-diario'),
        listaDiario: document.getElementById('lista-diario'),

        btnCopiar: document.getElementById('btn-copiar-turma'),
        btnImprimir: document.getElementById('btn-imprimir-consulta'),
        buscaAlunos: document.getElementById('busca-alunos-compartilhados'),
        totalAlunos: document.getElementById('total-alunos-compartilhados'),
        navegacao: document.getElementById('navegacao-consulta')
    };

    els.btnCopiar.addEventListener('click', abrirCopiaSeletiva);
    document.getElementById('confirmar-copia-seletiva').addEventListener('click', copiarTurmaParaMinhaConta);
    document.getElementById('cancelar-copia-seletiva').addEventListener('click', () => {
        document.getElementById('painel-copia-seletiva').hidden = true;
    });
    document.querySelectorAll('[data-copia]').forEach(input => {
        input.addEventListener('change', atualizarDependenciasCopia);
    });
    els.btnImprimir.addEventListener('click', () => window.print());
    els.buscaAlunos.addEventListener('input', () => {
        renderizarAlunos(dadosCompartilhados?.alunos || []);
    });

    carregarCompartilhamento();
});

async function carregarCompartilhamento() {
    try {
        const response = await fetch(`/api/compartilhamentos/codigo/${CODIGO}`);
        const dados = await response.json();

        if (!response.ok) {
            throw new Error(dados.error || 'Compartilhamento não encontrado.');
        }

        dadosCompartilhados = dados;
        renderizarCompartilhamento(dados);

    } catch (error) {
        console.error(error);
        els.status.textContent = error.message;
        els.status.style.color = 'red';
    }
}

function renderizarCompartilhamento(dados) {
    const turma = dados.turma;
    const comp = dados.compartilhamento;

    els.status.style.display = 'none';
    els.conteudo.style.display = 'block';
    els.btnImprimir.style.display = 'inline-block';

    els.nomeTurma.textContent = turma.nome || 'Turma sem nome';
    els.descricaoTurma.textContent = turma.descricao || 'Sem descrição.';

    els.tags.innerHTML = '';

    adicionarTag('Turma');

    if (comp.compartilhar_alunos) adicionarTag('Alunos');
    if (comp.compartilhar_frequencia) adicionarTag('Frequência');
    if (comp.compartilhar_notas) adicionarTag('Notas');
    if (comp.compartilhar_diario) adicionarTag('Diário');

    if (comp.permite_copia) {
        adicionarTag('Permite cópia');
        els.btnCopiar.style.display = 'inline-block';
    }

    renderizarAlunos(dados.alunos || []);
    renderizarFrequencia(dados.frequencia_resumo || []);
    renderizarNotas(dados.notas_resumo || []);
    renderizarDiario(dados.diario || []);

    // O menu só apresenta os conjuntos de dados autorizados pelo proprietário.
    const permissoes = {
        'secao-alunos': comp.compartilhar_alunos,
        'secao-frequencia': comp.compartilhar_frequencia,
        'secao-notas': comp.compartilhar_notas,
        'secao-diario': comp.compartilhar_diario
    };
    els.navegacao.querySelectorAll('[data-secao]').forEach(link => {
        link.hidden = !permissoes[link.dataset.secao];
    });
    document.getElementById('secao-alunos').hidden = !comp.compartilhar_alunos;
    els.buscaAlunos.disabled = !comp.compartilhar_alunos;
}

function adicionarTag(texto) {
    const span = document.createElement('span');
    span.className = 'tag-comp';
    span.textContent = texto;
    els.tags.appendChild(span);
}

function renderizarAlunos(alunos) {
    els.listaAlunos.innerHTML = '';

    if (!Array.isArray(alunos) || alunos.length === 0) {
        els.listaAlunos.innerHTML = '<p>Nenhum aluno compartilhado.</p>';
        els.totalAlunos.textContent = '0 alunos';
        return;
    }

    const busca = els.buscaAlunos.value.trim().toLocaleLowerCase('pt-BR');
    const filtrados = alunos.filter(aluno =>
        `${aluno.nome_completo || ''} ${aluno.matricula || ''}`
            .toLocaleLowerCase('pt-BR').includes(busca)
    );
    els.totalAlunos.textContent = `${filtrados.length} de ${alunos.length} aluno(s)`;
    if (!filtrados.length) {
        els.listaAlunos.textContent = 'Nenhum aluno encontrado.';
    }
    filtrados.forEach(aluno => {
        const div = document.createElement('div');
        div.className = 'aluno-comp-card';

        div.innerHTML = `
            <h3>${escapeHTML(aluno.nome_completo)}</h3>
            <p>Matrícula: ${escapeHTML(aluno.matricula || '-')}</p>
            <p>Nascimento: ${formatarData(aluno.data_nascimento)}</p>
        `;

        els.listaAlunos.appendChild(div);
    });
}

function renderizarFrequencia(lista) {
    if (!Array.isArray(lista) || lista.length === 0) {
        els.secaoFrequencia.style.display = 'none';
        return;
    }

    els.secaoFrequencia.style.display = 'block';

    els.listaFrequencia.innerHTML = `
        <table class="tabela-comp">
            <thead>
                <tr>
                    <th>Aluno</th>
                    <th class="center">Presenças</th>
                    <th class="center">Faltas</th>
                    <th class="center">Total</th>
                    <th class="center">%</th>
                </tr>
            </thead>
            <tbody>
                ${lista.map(item => `
                    <tr>
                        <td>${escapeHTML(item.nome_completo)}</td>
                        <td class="center">${escapeHTML(item.presencas)}</td>
                        <td class="center">${escapeHTML(item.faltas)}</td>
                        <td class="center">${escapeHTML(item.total)}</td>
                        <td class="center">${escapeHTML(item.porcentagem)}%</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderizarNotas(periodos) {
    if (!Array.isArray(periodos) || periodos.length === 0) {
        els.secaoNotas.style.display = 'none';
        return;
    }

    els.secaoNotas.style.display = 'block';
    els.listaNotas.innerHTML = '';

    periodos.forEach(periodo => {
        const div = document.createElement('div');
        div.className = 'resumo-card';

        div.innerHTML = `
            <h3>${escapeHTML(periodo.nome_periodo)}</h3>

            <p>
                Avaliações:
                ${periodo.avaliacoes.map(av => escapeHTML(av.nome)).join(', ')}
            </p>

            <table class="tabela-comp">
                <thead>
                    <tr>
                        <th>Aluno</th>
                        <th class="center">Notas</th>
                        <th class="center">Média</th>
                    </tr>
                </thead>
                <tbody>
                    ${periodo.alunos.map(aluno => `
                        <tr>
                            <td>${escapeHTML(aluno.nome_completo)}</td>
                            <td class="center">
                                ${escapeHTML(aluno.total_lancadas)}/${escapeHTML(aluno.total_avaliacoes)}
                            </td>
                            <td class="center">
                                ${escapeHTML(aluno.media ?? '-')}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        els.listaNotas.appendChild(div);
    });
}

function renderizarDiario(lista) {
    if (!Array.isArray(lista) || lista.length === 0) {
        els.secaoDiario.style.display = 'none';
        return;
    }

    els.secaoDiario.style.display = 'block';
    els.listaDiario.innerHTML = '';

    lista.forEach(item => {
        const aluno = item.alunos || {};

        const div = document.createElement('div');
        div.className = 'diario-card';

        div.innerHTML = `
            <h3>${escapeHTML(item.titulo)}</h3>
            <p>Data: ${formatarData(item.data_referencia)}</p>
            <p>Aluno: ${escapeHTML(aluno.nome_completo || '-')}</p>
            <p>${escapeHTML(item.conteudo || '')}</p>
        `;

        els.listaDiario.appendChild(div);
    });
}

const CAMPOS_COPIA = [
    'compartilhar_alunos', 'compartilhar_frequencia',
    'compartilhar_notas', 'compartilhar_diario'
];

function abrirCopiaSeletiva() {
    const comp = dadosCompartilhados?.compartilhamento;
    if (!comp || !comp.permite_copia) return;
    CAMPOS_COPIA.forEach(campo => {
        const input = document.querySelector(`[data-copia="${campo}"]`);
        input.closest('label').hidden = !comp[campo];
        input.checked = Boolean(comp[campo]);
        input.disabled = !comp[campo];
    });
    atualizarDependenciasCopia();
    document.getElementById('painel-copia-seletiva').hidden = false;
    document.getElementById('painel-copia-seletiva').scrollIntoView({ behavior: 'smooth' });
}

function atualizarDependenciasCopia() {
    const alunos = document.querySelector('[data-copia="compartilhar_alunos"]');
    const frequencia = document.querySelector('[data-copia="compartilhar_frequencia"]');
    const notas = document.querySelector('[data-copia="compartilhar_notas"]');
    const aviso = document.getElementById('aviso-copia-seletiva');
    if (!alunos.checked) {
        frequencia.checked = false;
        notas.checked = false;
    }
    frequencia.disabled = !alunos.checked || !dadosCompartilhados.compartilhamento.compartilhar_frequencia;
    notas.disabled = !alunos.checked || !dadosCompartilhados.compartilhamento.compartilhar_notas;
    aviso.textContent = 'Notas e frequência exigem a cópia dos alunos. Registros do diário associados a alunos não selecionados serão copiados sem vínculo individual.';
}

async function copiarTurmaParaMinhaConta() {
    if (!dadosCompartilhados?.compartilhamento?.permite_copia) return;
    const selecionar = {};
    CAMPOS_COPIA.forEach(campo => {
        const input = document.querySelector(`[data-copia="${campo}"]`);
        selecionar[campo] = Boolean(input.checked && !input.disabled);
    });
    if (!confirm('Criar uma nova turma com os dados selecionados?')) return;

    const botao = document.getElementById('confirmar-copia-seletiva');
    try {
        botao.disabled = true;
        botao.textContent = 'Copiando...';
        const response = await fetch(`/api/compartilhamentos/codigo/${CODIGO}/copiar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selecionar })
        });
        const resposta = await response.json();
        if (!response.ok) throw new Error(resposta.error || 'Erro ao copiar turma.');
        if (resposta.ja_existia) {
            alert('Esta turma já foi copiada anteriormente. Abrindo a cópia existente.');
        } else {
            alert('Turma copiada com sucesso!');
        }
        window.location.href = `/turma/${resposta.turma_id}`;
    } catch (error) {
        console.error(error);
        alert(error.message);
    } finally {
        botao.disabled = false;
        botao.textContent = 'Confirmar cópia';
    }
}

function formatarData(data) {
    if (!data) return '-';
    return data.split('-').reverse().join('/');
}

function escapeHTML(valor) {
    if (valor === null || valor === undefined) return '';

    return String(valor)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}