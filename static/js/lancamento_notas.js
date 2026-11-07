// Lançamento de notas e recuperação (automática ou manual por aluno).
const AVALIACAO_ID = window.location.pathname.split('/')[2];
let els = {};
let avaliacaoAtual = null;
let alunosAtuais = [];
let notaMinima = 5;
const revisoesNotas = new Map();

document.addEventListener('DOMContentLoaded', () => {
    els = {
        titulo: document.getElementById('titulo-pagina'),
        sub: document.getElementById('subtitulo'),
        voltar: document.getElementById('link-voltar'),
        tbody: document.getElementById('tbody-notas'),
        opcoes: document.getElementById('opcoes-recuperacao'),
        modo: document.getElementById('modo-recuperacao'),
        mostrarTodos: document.getElementById('mostrar-todos-alunos'),
        resumo: document.getElementById('resumo-elegiveis'),
        aviso: document.getElementById('aviso-modo-recuperacao'),
        colunaDestino: document.getElementById('coluna-destino')
    };

    els.mostrarTodos.addEventListener('change', renderizarTabela);
    els.modo.addEventListener('change', alterarModo);
    els.tbody.addEventListener('change', event => {
        if (event.target.matches('.input-nota, .seletor-destino')) {
            salvarLinha(event.target.closest('tr'));
        }
    });
    carregarDados();
});

function escapeHTML(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function nomePeriodo(tipo, numero) {
    const mapa = {
        avaliacao: 'Avaliação', bimestre: 'Bimestre',
        trimestre: 'Trimestre', semestre: 'Semestre'
    };
    return `${numero}ª ${mapa[tipo] || 'Avaliação'}`;
}

function nomeCategoria(categoria) {
    const mapa = {
        atividade: 'Atividade', trabalho: 'Trabalho', prova: 'Prova',
        participacao: 'Participação', recuperacao: 'Recuperação', outro: 'Outro'
    };
    return mapa[categoria] || categoria || 'Atividade';
}

function eRecuperacao() {
    return avaliacaoAtual && avaliacaoAtual.categoria === 'recuperacao';
}

function modoManual() {
    return eRecuperacao() && avaliacaoAtual.recuperacao_modo === 'manual';
}

function mostrarNota(nota) {
    return nota === null || nota === undefined ? '—'
        : Number(nota).toLocaleString('pt-BR', {maximumFractionDigits: 2});
}

async function carregarDados() {
    try {
        const resposta = await fetch(`/api/avaliacao/${AVALIACAO_ID}/diario`, {
            cache: 'no-store'
        });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.error || 'Erro ao carregar notas.');

        avaliacaoAtual = dados.avaliacao;
        alunosAtuais = dados.alunos || [];
        notaMinima = Number(dados.nota_minima ?? 5);
        els.titulo.textContent = `Notas: ${avaliacaoAtual.nome}`;
        els.voltar.href = `/turma/${dados.turma_id}/avaliacoes`;
        els.sub.innerHTML = `
            <div class="meta-avaliacao">
                <span class="tag-av">${escapeHTML(nomePeriodo(avaliacaoAtual.periodo_tipo, avaliacaoAtual.periodo_numero))}</span>
                <span class="tag-av">${escapeHTML(nomeCategoria(avaliacaoAtual.categoria))}</span>
                <span class="tag-av">Nota máxima: ${escapeHTML(avaliacaoAtual.nota_maxima)}</span>
                <span class="tag-av">${eRecuperacao()
                    ? 'Sem peso próprio · usa o peso da avaliação recuperada'
                    : `Peso: ${escapeHTML(avaliacaoAtual.peso)}`}</span>
            </div>`;

        els.opcoes.hidden = !eRecuperacao();
        els.modo.value = avaliacaoAtual.recuperacao_modo || 'automatico';
        els.colunaDestino.hidden = !modoManual();
        els.tbody.closest('table').classList.toggle('modo-manual', modoManual());
        if (eRecuperacao()) {
            const totalElegiveis = alunosAtuais.filter(item => item.elegivel).length;
            els.resumo.textContent = `${totalElegiveis} aluno(s) com nota abaixo de ${mostrarNota(notaMinima)} `
                + `nas avaliações deste par, de ${alunosAtuais.length} aluno(s).`;
            els.aviso.textContent = modoManual()
                ? 'Modo manual: escolha a avaliação vermelha que cada recuperação deve cobrir. '
                  + 'Sem destino escolhido, a nota da recuperação fica salva, mas não altera a média. '
                  + 'Uma recuperação inferior à nota original não a substitui.'
                : 'Modo automático: se as duas avaliações estiverem abaixo da mínima, '
                  + 'a recuperação prioriza a de maior peso. Somente notas superiores substituem as originais.';
        }
        revisoesNotas.clear();
        alunosAtuais.forEach(item => revisoesNotas.set(String(item.id), item.revision ?? 0));
        renderizarTabela();
    } catch (erro) {
        console.error(erro);
        els.tbody.innerHTML = `<tr><td colspan="3" style="color:#f87171;">${escapeHTML(erro.message)}</td></tr>`;
    }
}

function renderizarTabela() {
    const mostrarTodos = !eRecuperacao() || els.mostrarTodos.checked;
    const lista = alunosAtuais.filter(aluno => mostrarTodos || aluno.elegivel);
    const manual = modoManual();
    els.colunaDestino.hidden = !manual;
    els.tbody.closest('table').classList.toggle('modo-manual', manual);

    if (!lista.length) {
        els.tbody.innerHTML = `<tr><td colspan="${manual ? 3 : 2}">`
            + (alunosAtuais.length === 0
                ? 'Nenhum aluno na turma.'
                : `Nenhum aluno com nota abaixo de ${mostrarNota(notaMinima)} neste par. `
                  + 'Marque “Mostrar todos os alunos” para consultar os demais.')
            + '</td></tr>';
        return;
    }
    els.tbody.innerHTML = lista.map(aluno => {
        const valor = aluno.nota ?? '';
        const detalhes = aluno.avaliacoes_alvo || {};
        const elegiveis = aluno.destinos_elegiveis || [];
        const periodos = eRecuperacao()
            ? (Number(avaliacaoAtual.periodo_numero) === 1 ? [1, 2] : [3, 4]) : [];
        const notasPar = periodos.map(num => {
            const info = detalhes[String(num)] || {};
            const vermelha = elegiveis.includes(num);
            return `<span class="${vermelha ? 'nota-baixa' : ''}">`
                + `${num}ª: ${mostrarNota(info.nota)}</span>`;
        }).join(' · ');
        const opcaoSalva = aluno.recupera_periodo;
        let opcoes = `<option value="">Escolher avaliação...</option>`;
        for (const num of periodos) {
            const elegivel = elegiveis.includes(num);
            if (elegivel || num === opcaoSalva) {
                const nota = (detalhes[String(num)] || {}).nota;
                opcoes += `<option value="${num}" ${num === opcaoSalva ? 'selected' : ''} `
                    + `${!elegivel ? 'disabled' : ''}>${num}ª avaliação (nota ${mostrarNota(nota)})`
                    + `${!elegivel ? ' · não elegível' : ''}</option>`;
            }
        }
        let aviso = '';
        if (manual && valor !== '') {
            aviso = opcaoSalva && elegiveis.includes(opcaoSalva)
                ? `Destino: ${opcaoSalva}ª avaliação`
                : 'Escolha um destino para aplicar a recuperação';
        }
        return `<tr data-aluno-id="${escapeHTML(aluno.id)}">
            <td>
                <strong>${escapeHTML(aluno.nome)}</strong><br>
                <small style="color:var(--text-sec);">Matrícula: ${escapeHTML(aluno.matricula || '-')}</small>
                ${eRecuperacao() ? `<span class="status-recuperacao">${notasPar}</span>` : ''}
                <span class="status-recuperacao" data-status>${escapeHTML(aviso)}</span>
            </td>
            <td><input type="number" class="input-nota" min="0"
                max="${escapeHTML(aluno.nota_maxima)}" step="0.1"
                value="${escapeHTML(valor)}" aria-label="Nota de ${escapeHTML(aluno.nome)}"></td>
            ${manual ? `<td class="coluna-destino">
                <select class="seletor-destino" aria-label="Destino da recuperação de ${escapeHTML(aluno.nome)}"
                    ${!elegiveis.length ? 'disabled' : ''}>${opcoes}</select>
            </td>` : ''}
        </tr>`;
    }).join('');
}

async function alterarModo() {
    if (!eRecuperacao()) return;
    const anterior = avaliacaoAtual.recuperacao_modo || 'automatico';
    const novo = els.modo.value;
    if (novo === anterior) return;
    if (novo === 'manual' && !confirm(
        'No modo manual, as notas já lançadas serão mantidas, mas só serão '
        + 'aplicadas à média depois que você escolher a avaliação de destino de cada aluno. Continuar?'
    )) {
        els.modo.value = anterior;
        return;
    }
    els.modo.disabled = true;
    try {
        const res = await fetch(`/api/avaliacoes/${AVALIACAO_ID}/modo-recuperacao`, {
            method: 'PATCH', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({modo: novo, revision: avaliacaoAtual.revision})
        });
        const dados = await res.json();
        if (!res.ok) throw new Error(dados.error || 'Não foi possível alterar o modo.');
        await carregarDados();
    } catch (erro) {
        els.modo.value = anterior;
        alert(erro.message);
        if (/Conflito|Revisão|Atualize/i.test(erro.message)) await carregarDados();
    } finally {
        els.modo.disabled = false;
    }
}

async function salvarLinha(linha) {
    if (!linha || !avaliacaoAtual || linha.dataset.salvando === 'true') return;
    const alunoId = linha.dataset.alunoId;
    const input = linha.querySelector('.input-nota');
    const destino = linha.querySelector('.seletor-destino');
    const texto = input.value;
    const nota = texto === '' ? null : Number(texto);
    if (nota !== null && (!Number.isFinite(nota) || nota < 0
            || nota > Number(avaliacaoAtual.nota_maxima))) {
        alert(`Informe uma nota entre 0 e ${avaliacaoAtual.nota_maxima}.`);
        input.classList.add('erro');
        return;
    }
    const envio = {
        avaliacao_id: AVALIACAO_ID, aluno_id: alunoId,
        valor: nota, revision: revisoesNotas.get(String(alunoId))
    };
    if (modoManual()) envio.recupera_periodo = destino && destino.value
        ? Number(destino.value) : null;

    linha.dataset.salvando = 'true';
    input.disabled = true;
    if (destino) destino.disabled = true;
    input.classList.remove('erro', 'salvo');
    input.classList.add('salvando');
    try {
        const resposta = await fetch('/api/notas', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(envio)
        });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.error || 'Erro ao salvar nota.');
        revisoesNotas.set(String(alunoId), dados.revision);
        const aluno = alunosAtuais.find(item => String(item.id) === String(alunoId));
        if (aluno) {
            aluno.nota = nota;
            if (modoManual()) aluno.recupera_periodo = envio.recupera_periodo;
        }
        const status = linha.querySelector('[data-status]');
        if (status) {
            status.textContent = modoManual() && nota !== null && !envio.recupera_periodo
                ? 'Nota salva; escolha o destino para aplicar à média.'
                : 'Salvo na nuvem.';
        }
        input.classList.add('salvo');
        setTimeout(() => input.classList.remove('salvo'), 1200);
    } catch (erro) {
        console.error(erro);
        input.classList.add('erro');
        alert(erro.message);
        if (/Conflito|Revisão|Atualize/i.test(erro.message)) {
            await carregarDados();
        }
    } finally {
        input.classList.remove('salvando');
        input.disabled = false;
        if (destino) destino.disabled = !((alunosAtuais.find(item =>
            String(item.id) === String(alunoId)) || {}).destinos_elegiveis || []).length;
        delete linha.dataset.salvando;
    }
}
