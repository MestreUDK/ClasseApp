// static/js/relatorios.js

let els = {};

document.addEventListener('DOMContentLoaded', () => {
    els = {
        selectTurma: document.getElementById('select-turma'),
        dataPicker: document.getElementById('data-relatorio'),
        diarioDataInicio: document.getElementById('diario-data-inicio'),
        diarioDataFim: document.getElementById('diario-data-fim')
    };

    if (els.dataPicker) {
        els.dataPicker.valueAsDate = new Date();
    }

    carregarTurmas();
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

window.baixarGeral = function(formato) {
    const turmaId = obterTurmaSelecionadaObrigatoria();
    if (!turmaId) return;

    let url = `/api/exportar/turma/${turmaId}/geral`;

    if (formato === 'pdf') {
        url += '/pdf';
    }

    baixarArquivo(url);
};

window.baixarDiario = function(formato) {
    const turmaId = obterTurmaSelecionadaObrigatoria();
    if (!turmaId) return;

    const data = els.dataPicker ? els.dataPicker.value : '';

    if (!data) {
        alert('Selecione uma data.');
        return;
    }

    let url = `/api/exportar/turma/${turmaId}/frequencia`;

    if (formato === 'pdf') {
        url += '/pdf';
    }

    const params = new URLSearchParams();
    params.append('data', data);

    baixarArquivo(`${url}?${params.toString()}`);
};

window.baixarNotas = function(formato) {
    const turmaId = obterTurmaSelecionadaObrigatoria();
    if (!turmaId) return;

    let url = `/api/exportar/turma/${turmaId}/notas`;

    if (formato === 'pdf') {
        url += '/pdf';
    }

    baixarArquivo(url);
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