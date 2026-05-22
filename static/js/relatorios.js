// static/js/relatorios.js

let els = {};

document.addEventListener('DOMContentLoaded', () => {
    els = {
        selectTurma: document.getElementById('select-turma'),
        dataPicker: document.getElementById('data-relatorio'),

        diarioDataInicio: document.getElementById('diario-data-inicio'),
        diarioDataFim: document.getElementById('diario-data-fim'),

        freqTipoPeriodo: document.getElementById('freq-tipo-periodo'),
        freqMes: document.getElementById('freq-mes'),
        freqAno: document.getElementById('freq-ano'),
        freqPeriodoNumero: document.getElementById('freq-periodo-numero'),
        freqDataInicio: document.getElementById('freq-data-inicio'),
        freqDataFim: document.getElementById('freq-data-fim'),

        freqBoxMes: document.getElementById('freq-box-mes'),
        freqBoxPeriodo: document.getElementById('freq-box-periodo'),
        freqBoxInicio: document.getElementById('freq-box-inicio'),
        freqBoxFim: document.getElementById('freq-box-fim')
    };

    if (els.dataPicker) {
        els.dataPicker.valueAsDate = new Date();
    }

    if (els.freqAno) {
        els.freqAno.value = new Date().getFullYear();
    }

    carregarTurmas();

    els.freqTipoPeriodo.addEventListener('change', atualizarCamposFiltroFrequencia);
    atualizarCamposFiltroFrequencia();
});

async function carregarTurmas() {
    try {
        const res = await fetch('/api/turmas');

        if (!res.ok) {
            throw new Error('Erro ao buscar turmas.');
        }

        const turmas = await res.json();

        els.selectTurma.innerHTML = '';

        if (!Array.isArray(turmas) || turmas.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Nenhuma turma cadastrada';
            els.selectTurma.appendChild(opt);
            return;
        }

        const optPadrao = document.createElement('option');
        optPadrao.value = '';
        optPadrao.textContent = 'Selecione uma turma';
        els.selectTurma.appendChild(optPadrao);

        turmas.forEach(turma => {
            const opt = document.createElement('option');
            opt.value = turma.id;
            opt.textContent = turma.nome;
            els.selectTurma.appendChild(opt);
        });

    } catch (error) {
        console.error(error);

        els.selectTurma.innerHTML = '';

        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Erro ao carregar turmas';
        els.selectTurma.appendChild(opt);
    }
}

function atualizarCamposFiltroFrequencia() {
    const tipo = els.freqTipoPeriodo.value;

    els.freqBoxMes.style.display = 'none';
    els.freqBoxPeriodo.style.display = 'none';
    els.freqBoxInicio.style.display = 'none';
    els.freqBoxFim.style.display = 'none';

    els.freqPeriodoNumero.innerHTML = '';

    if (tipo === 'mes') {
        els.freqBoxMes.style.display = 'block';
    }

    if (tipo === 'bimestre') {
        els.freqBoxPeriodo.style.display = 'block';
        preencherPeriodo(6, 'Bimestre');
    }

    if (tipo === 'trimestre') {
        els.freqBoxPeriodo.style.display = 'block';
        preencherPeriodo(4, 'Trimestre');
    }

    if (tipo === 'semestre') {
        els.freqBoxPeriodo.style.display = 'block';
        preencherPeriodo(2, 'Semestre');
    }

    if (tipo === 'personalizado') {
        els.freqBoxInicio.style.display = 'block';
        els.freqBoxFim.style.display = 'block';
    }
}

function preencherPeriodo(qtd, nome) {
    for (let i = 1; i <= qtd; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${i}º ${nome}`;
        els.freqPeriodoNumero.appendChild(opt);
    }
}

function calcularIntervaloFrequencia() {
    const tipo = els.freqTipoPeriodo.value;
    const ano = Number(els.freqAno.value) || new Date().getFullYear();

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
        return intervaloMeses(ano, Number(els.freqMes.value), Number(els.freqMes.value));
    }

    if (tipo === 'bimestre') {
        const numero = Number(els.freqPeriodoNumero.value);
        const mesInicial = (numero - 1) * 2 + 1;
        const mesFinal = mesInicial + 1;

        return intervaloMeses(ano, mesInicial, mesFinal);
    }

    if (tipo === 'trimestre') {
        const numero = Number(els.freqPeriodoNumero.value);
        const mesInicial = (numero - 1) * 3 + 1;
        const mesFinal = mesInicial + 2;

        return intervaloMeses(ano, mesInicial, mesFinal);
    }

    if (tipo === 'semestre') {
        const numero = Number(els.freqPeriodoNumero.value);
        const mesInicial = numero === 1 ? 1 : 7;
        const mesFinal = numero === 1 ? 6 : 12;

        return intervaloMeses(ano, mesInicial, mesFinal);
    }

    if (tipo === 'personalizado') {
        return {
            inicio: els.freqDataInicio.value || '',
            fim: els.freqDataFim.value || ''
        };
    }

    return {};
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

async function baixarArquivo(url) {
    const btnAtual = document.activeElement;
    const textoOriginal = btnAtual && btnAtual.tagName === 'BUTTON'
        ? btnAtual.innerText
        : '';

    try {
        if (btnAtual && btnAtual.tagName === 'BUTTON') {
            btnAtual.innerText = 'Gerando...';
            btnAtual.disabled = true;
        }

        const response = await fetch(url);

        if (!response.ok) {
            let mensagem = 'Erro ao gerar relatório.';

            try {
                const erroJson = await response.json();
                mensagem = `${erroJson.error || mensagem}\n${erroJson.details || ''}`;
            } catch {
                mensagem = response.statusText || mensagem;
            }

            throw new Error(mensagem);
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = obterNomeArquivo(response) || 'relatorio.xlsx';

        document.body.appendChild(a);
        a.click();
        a.remove();

        window.URL.revokeObjectURL(downloadUrl);

    } catch (error) {
        alert(error.message || 'Erro de conexão ao gerar relatório.');

    } finally {
        if (btnAtual && btnAtual.tagName === 'BUTTON') {
            btnAtual.innerText = textoOriginal || 'Baixar';
            btnAtual.disabled = false;
        }
    }
}

function obterNomeArquivo(response) {
    const contentDisp = response.headers.get('Content-Disposition');

    if (!contentDisp) {
        return null;
    }

    const utf8Match = contentDisp.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match && utf8Match[1]) {
        return decodeURIComponent(utf8Match[1]);
    }

    const normalMatch = contentDisp.match(/filename="?([^"]+)"?/i);
    if (normalMatch && normalMatch[1]) {
        return normalMatch[1];
    }

    return null;
}

function obterTurmaSelecionadaObrigatoria() {
    const turmaId = els.selectTurma ? els.selectTurma.value : '';

    if (!turmaId) {
        alert('Selecione uma turma primeiro.');
        return null;
    }

    return turmaId;
}

window.baixarGeral = function() {
    const turmaId = obterTurmaSelecionadaObrigatoria();
    if (!turmaId) return;

    const intervalo = calcularIntervaloFrequencia();

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
        ? `/api/exportar/turma/${turmaId}/geral?${queryString}`
        : `/api/exportar/turma/${turmaId}/geral`;

    baixarArquivo(url);
};

window.baixarDiario = function() {
    const turmaId = obterTurmaSelecionadaObrigatoria();
    if (!turmaId) return;

    const data = els.dataPicker ? els.dataPicker.value : '';

    if (!data) {
        alert('Selecione uma data.');
        return;
    }

    const params = new URLSearchParams();
    params.append('data', data);

    baixarArquivo(`/api/exportar/turma/${turmaId}/frequencia?${params.toString()}`);
};

window.baixarNotas = function() {
    const turmaId = obterTurmaSelecionadaObrigatoria();
    if (!turmaId) return;

    baixarArquivo(`/api/exportar/turma/${turmaId}/notas`);
};

window.baixarDiarioBordo = function() {
    const turmaId = els.selectTurma ? els.selectTurma.value : '';
    const dataInicio = els.diarioDataInicio ? els.diarioDataInicio.value : '';
    const dataFim = els.diarioDataFim ? els.diarioDataFim.value : '';

    if (dataInicio && dataFim && dataInicio > dataFim) {
        alert('A data inicial não pode ser maior que a data final.');
        return;
    }

    const params = new URLSearchParams();

    if (turmaId) {
        params.append('turma_id', turmaId);
    }

    if (dataInicio) {
        params.append('data_inicio', dataInicio);
    }

    if (dataFim) {
        params.append('data_fim', dataFim);
    }

    const queryString = params.toString();

    const url = queryString
        ? `/api/exportar/diario?${queryString}`
        : '/api/exportar/diario';

    baixarArquivo(url);
};