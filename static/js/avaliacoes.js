// static/js/avaliacoes.js

const TURMA_ID = window.location.pathname.split('/')[2];

let els = {};

document.addEventListener('DOMContentLoaded', () => {
    els = {
        titulo: document.getElementById('titulo-pagina'),
        linkVoltar: document.getElementById('link-voltar'),
        form: document.getElementById('form-avaliacao'),

        inputNome: document.getElementById('nome'),
        inputData: document.getElementById('data'),
        inputMax: document.getElementById('nota_maxima'),
        inputPeriodoTipo: document.getElementById('periodo_tipo'),
        inputPeriodoNumero: document.getElementById('periodo_numero'),
        inputCategoria: document.getElementById('categoria'),
        inputPeso: document.getElementById('peso'),

        lista: document.getElementById('lista-avaliacoes')
    };

    els.linkVoltar.href = `/turma/${TURMA_ID}`;

    carregarInfosTurma();
    carregarAvaliacoes();

    els.form.addEventListener('submit', handleCriar);
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

function formatarData(data) {
    return data ? data.split('-').reverse().join('/') : 'Sem data';
}

function nomePeriodo(tipo, numero) {
    const mapa = {
        avaliacao: 'Avaliação',
        bimestre: 'Bimestre',
        trimestre: 'Trimestre',
        semestre: 'Semestre'
    };

    return `${numero}ª ${mapa[tipo] || 'Avaliação'}`;
}

function nomeCategoria(categoria) {
    const mapa = {
        atividade: 'Atividade',
        trabalho: 'Trabalho',
        prova: 'Prova',
        participacao: 'Participação',
        recuperacao: 'Recuperação',
        outro: 'Outro'
    };

    return mapa[categoria] || categoria || 'Atividade';
}

async function carregarInfosTurma() {
    try {
        const res = await fetch(`/api/turmas/${TURMA_ID}`);
        const turma = await res.json();

        if (!res.ok) {
            throw new Error(turma.error || 'Erro ao carregar turma.');
        }

        els.titulo.textContent = `Avaliações: ${turma.nome}`;

    } catch (error) {
        console.error(error);
        els.titulo.textContent = 'Erro ao carregar turma';
    }
}

async function carregarAvaliacoes() {
    try {
        const res = await fetch(`/api/turma/${TURMA_ID}/avaliacoes`);
        const avaliacoes = await res.json();

        if (!res.ok) {
            throw new Error(avaliacoes.error || 'Erro ao carregar avaliações.');
        }

        els.lista.innerHTML = '';

        if (!Array.isArray(avaliacoes) || avaliacoes.length === 0) {
            els.lista.innerHTML = '<p style="color: #777;">Nenhuma avaliação cadastrada.</p>';
            return;
        }

        const grupos = agruparPorPeriodo(avaliacoes);

        Object.keys(grupos).forEach(chave => {
            const grupo = grupos[chave];
            const primeira = grupo[0];

            const section = document.createElement('section');
            section.className = 'periodo-grupo';

            section.innerHTML = `
                <h3 class="periodo-titulo">
                    ${escapeHTML(nomePeriodo(primeira.periodo_tipo, primeira.periodo_numero))}
                </h3>
            `;

            grupo.forEach(av => {
                section.appendChild(criarCardAvaliacao(av));
            });

            els.lista.appendChild(section);
        });

    } catch (error) {
        console.error(error);
        els.lista.innerHTML = `<p style="color:red;">${escapeHTML(error.message)}</p>`;
    }
}

function agruparPorPeriodo(avaliacoes) {
    const grupos = {};

    avaliacoes.forEach(av => {
        const chave = `${av.periodo_tipo || 'avaliacao'}_${av.periodo_numero || 1}`;

        if (!grupos[chave]) {
            grupos[chave] = [];
        }

        grupos[chave].push(av);
    });

    return grupos;
}

function criarCardAvaliacao(av) {
    const div = document.createElement('div');
    div.className = 'dash-card avaliacao-card';

    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
            <div>
                <h3 style="margin: 0; font-size: 1.2em; color: var(--primary);">
                    ${escapeHTML(av.nome)}
                </h3>

                <div class="avaliacao-meta">
                    <span class="tag-av">${escapeHTML(nomeCategoria(av.categoria))}</span>
                    <span class="tag-av">Data: ${escapeHTML(formatarData(av.data))}</span>
                    <span class="tag-av">Nota máx.: ${escapeHTML(av.nota_maxima)}</span>
                    <span class="tag-av">Peso: ${escapeHTML(av.peso)}</span>
                    <span class="tag-av">Média: ${av.media_turma ?? '-'}</span>
                    <span class="tag-av">Notas: ${av.total_notas_lancadas || 0}</span>
                </div>
            </div>
        </div>

        <div class="acoes-av">
            <a href="/avaliacao/${av.id}/lancamento" class="botao-acao">
                Lançar Notas
            </a>

            <button onclick="deletarAvaliacao('${av.id}')" class="botao-delete">
                Excluir
            </button>
        </div>
    `;

    return div;
}

async function handleCriar(e) {
    e.preventDefault();

    const dados = {
        turma_id: TURMA_ID,
        nome: els.inputNome.value.trim(),
        data: els.inputData.value || null,
        nota_maxima: Number(els.inputMax.value || 10),
        periodo_tipo: els.inputPeriodoTipo.value || 'avaliacao',
        periodo_numero: Number(els.inputPeriodoNumero.value || 1),
        categoria: els.inputCategoria.value || 'atividade',
        peso: Number(els.inputPeso.value || 1)
    };

    if (!dados.nome) {
        alert('Informe o nome da avaliação.');
        return;
    }

    try {
        const res = await fetch('/api/avaliacoes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        const resposta = await res.json();

        if (!res.ok) {
            throw new Error(resposta.error || 'Erro ao criar avaliação.');
        }

        els.form.reset();
        els.inputMax.value = 10;
        els.inputPeso.value = 1;
        els.inputPeriodoNumero.value = 1;

        carregarAvaliacoes();

    } catch (error) {
        alert(error.message);
    }
}

window.deletarAvaliacao = async function(id) {
    if (!confirm('Tem certeza? As notas lançadas nessa avaliação serão apagadas.')) {
        return;
    }

    try {
        const res = await fetch(`/api/avaliacoes/${id}`, {
            method: 'DELETE'
        });

        const resposta = await res.json();

        if (!res.ok) {
            throw new Error(resposta.error || 'Erro ao excluir avaliação.');
        }

        carregarAvaliacoes();

    } catch (error) {
        alert(error.message);
    }
};