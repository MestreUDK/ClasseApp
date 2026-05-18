// static/js/estatisticas.js

const TURMA_ID = window.location.pathname.split('/')[2];

let els = {};

document.addEventListener('DOMContentLoaded', () => {
    els = {
        h1Titulo: document.getElementById('nome-turma'),
        linkVoltar: document.getElementById('link-voltar'),
        status: document.getElementById('status-stats'),
        tableBody: document.getElementById('stats-tbody'),

        tipoPeriodo: document.getElementById('tipo-periodo'),
        mes: document.getElementById('mes'),
        ano: document.getElementById('ano'),
        periodoNumero: document.getElementById('periodo-numero'),
        dataInicio: document.getElementById('data-inicio'),
        dataFim: document.getElementById('data-fim'),

        boxMes: document.getElementById('box-mes'),
        boxPeriodo: document.getElementById('box-periodo'),
        boxInicio: document.getElementById('box-inicio'),
        boxFim: document.getElementById('box-fim'),

        btnAplicarFiltro: document.getElementById('btn-aplicar-filtro')
    };

    const anoAtual = new Date().getFullYear();
    els.ano.value = anoAtual;

    els.linkVoltar.href = `/turma/${TURMA_ID}`;

    els.tipoPeriodo.addEventListener('change', atualizarCamposFiltro);
    els.btnAplicarFiltro.addEventListener('click', carregarEstatisticas);

    carregarDetalhesTurma();
    atualizarCamposFiltro();
    carregarEstatisticas();
});

async function carregarDetalhesTurma() {
    try {
        const response = await fetch(`/api/turmas/${TURMA_ID}`);
        const turma = await response.json();

        if (!response.ok) {
            throw new Error(turma.error || 'Erro ao carregar turma.');
        }

        els.h1Titulo.textContent = `Estatísticas: ${turma.nome}`;

    } catch (error) {
        console.error(error);
        els.h1Titulo.textContent = 'Erro ao carregar turma';
    }
}

function atualizarCamposFiltro() {
    const tipo = els.tipoPeriodo.value;

    els.boxMes.style.display = 'none';
    els.boxPeriodo.style.display = 'none';
    els.boxInicio.style.display = 'none';
    els.boxFim.style.display = 'none';

    els.periodoNumero.innerHTML = '';

    if (tipo === 'mes') {
        els.boxMes.style.display = 'block';
    }

    if (tipo === 'bimestre') {
        els.boxPeriodo.style.display = 'block';
        preencherPeriodo(6, 'Bimestre');
    }

    if (tipo === 'trimestre') {
        els.boxPeriodo.style.display = 'block';
        preencherPeriodo(4, 'Trimestre');
    }

    if (tipo === 'semestre') {
        els.boxPeriodo.style.display = 'block';
        preencherPeriodo(2, 'Semestre');
    }

    if (tipo === 'personalizado') {
        els.boxInicio.style.display = 'block';
        els.boxFim.style.display = 'block';
    }
}

function preencherPeriodo(qtd, nome) {
    for (let i = 1; i <= qtd; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${i}º ${nome}`;
        els.periodoNumero.appendChild(opt);
    }
}

function calcularIntervaloFiltro() {
    const tipo = els.tipoPeriodo.value;
    const ano = Number(els.ano.value) || new Date().getFullYear();

    if (tipo === 'tudo') {
        return {};
    }

    if (tipo === 'ano') {
        return {
            inicio: `${ano}-01-01`,
            fim: `${ano}-12-31`
        };
    }

    if (tipo === 'mes') {
        const mes = Number(els.mes.value);
        return intervaloMes(ano, mes);
    }

    if (tipo === 'bimestre') {
        const numero = Number(els.periodoNumero.value);
        const mesInicial = (numero - 1) * 2 + 1;
        const mesFinal = mesInicial + 1;

        return intervaloMeses(ano, mesInicial, mesFinal);
    }

    if (tipo === 'trimestre') {
        const numero = Number(els.periodoNumero.value);
        const mesInicial = (numero - 1) * 3 + 1;
        const mesFinal = mesInicial + 2;

        return intervaloMeses(ano, mesInicial, mesFinal);
    }

    if (tipo === 'semestre') {
        const numero = Number(els.periodoNumero.value);
        const mesInicial = numero === 1 ? 1 : 7;
        const mesFinal = numero === 1 ? 6 : 12;

        return intervaloMeses(ano, mesInicial, mesFinal);
    }

    if (tipo === 'personalizado') {
        return {
            inicio: els.dataInicio.value || '',
            fim: els.dataFim.value || ''
        };
    }

    return {};
}

function intervaloMes(ano, mes) {
    return intervaloMeses(ano, mes, mes);
}

function intervaloMeses(ano, mesInicial, mesFinal) {
    const inicio = `${ano}-${String(mesInicial).padStart(2, '0')}-01`;

    const ultimoDia = new Date(ano, mesFinal, 0).getDate();

    const fim = `${ano}-${String(mesFinal).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

    return {
        inicio,
        fim
    };
}

async function carregarEstatisticas() {
    try {
        els.status.textContent = 'Carregando dados...';
        els.status.style.display = 'block';
        els.status.style.color = '';

        els.tableBody.innerHTML = '';

        const intervalo = calcularIntervaloFiltro();

        if (intervalo.inicio && intervalo.fim && intervalo.inicio > intervalo.fim) {
            alert('A data inicial não pode ser maior que a data final.');
            return;
        }

        const params = new URLSearchParams();

        if (intervalo.inicio) {
            params.append('inicio', intervalo.inicio);
        }

        if (intervalo.fim) {
            params.append('fim', intervalo.fim);
        }

        const queryString = params.toString();
        const url = queryString
            ? `/api/turma/${TURMA_ID}/stats?${queryString}`
            : `/api/turma/${TURMA_ID}/stats`;

        const response = await fetch(url);
        const stats = await response.json();

        if (!response.ok) {
            throw new Error(stats.error || 'Erro ao carregar estatísticas.');
        }

        if (!Array.isArray(stats) || stats.length === 0) {
            els.status.textContent = 'Sem alunos vinculados nesta turma.';
            return;
        }

        els.status.style.display = 'none';

        stats.forEach(aluno => {
            const tr = document.createElement('tr');

            const porcentagem = aluno.porcentagem_presenca || 0;

            let corPorcentagem = '';

            if (aluno.total_registros === 0) {
                corPorcentagem = 'color: #6c757d;';
            } else if (porcentagem < 50) {
                corPorcentagem = 'color: #dc3545;';
            } else if (porcentagem >= 75) {
                corPorcentagem = 'color: #28a745;';
            }

            tr.innerHTML = `
                <td>
                    <a href="/aluno/editar/${aluno.aluno_id}" class="link-aluno">
                        ${escapeHTML(aluno.nome_completo)}
                    </a>
                </td>

                <td class="center">${aluno.total_presencas}</td>
                <td class="center">${aluno.total_faltas}</td>
                <td class="center">${aluno.total_registros}</td>

                <td class="center porcentagem" style="${corPorcentagem}">
                    ${porcentagem}%
                </td>
            `;

            els.tableBody.appendChild(tr);
        });

    } catch (error) {
        console.error(error);
        els.status.textContent = `Erro: ${error.message}`;
        els.status.style.color = 'red';
    }
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