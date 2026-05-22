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

        btnCopiar: document.getElementById('btn-copiar-turma')
    };

    els.btnCopiar.addEventListener('click', copiarTurmaParaMinhaConta);

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
        return;
    }

    alunos.forEach(aluno => {
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
                        <td class="center">${item.presencas}</td>
                        <td class="center">${item.faltas}</td>
                        <td class="center">${item.total}</td>
                        <td class="center">${item.porcentagem}%</td>
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
                                ${aluno.total_lancadas}/${aluno.total_avaliacoes}
                            </td>
                            <td class="center">
                                ${aluno.media ?? '-'}
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

async function copiarTurmaParaMinhaConta() {
    if (!dadosCompartilhados) {
        alert('Dados ainda não carregados.');
        return;
    }

    if (!confirm('Deseja copiar esta turma e os dados permitidos para seu espaço?')) {
        return;
    }

    try {
        els.btnCopiar.disabled = true;
        els.btnCopiar.textContent = 'Copiando...';

        const response = await fetch(`/api/compartilhamentos/codigo/${CODIGO}/copiar`, {
            method: 'POST'
        });

        const resposta = await response.json();

        if (!response.ok) {
            throw new Error(resposta.error || 'Erro ao copiar turma.');
        }

        alert('Turma copiada com sucesso!');
        window.location.href = `/turma/${resposta.turma_id}`;

    } catch (error) {
        console.error(error);
        alert(error.message);

        els.btnCopiar.disabled = false;
        els.btnCopiar.textContent = 'Copiar para meu espaço';
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