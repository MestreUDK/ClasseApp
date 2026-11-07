// static/js/avaliacoes.js

const TURMA_ID = window.location.pathname.split('/')[2];

let els = {};
let avaliacaoEmEdicao = null;
let avaliacoesCarregadas = [];

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
        boxPeso: document.getElementById('box-peso'),
        avisoRecuperacao: document.getElementById('aviso-recuperacao'),
        quadro: document.getElementById('quadro-rendimento'),
        atualizarRendimento: document.getElementById('atualizar-rendimento'),

        lista: document.getElementById('lista-avaliacoes'),
        cancelar: document.getElementById('cancelar-edicao-avaliacao'),
        tituloForm: document.getElementById('titulo-form-avaliacao')
    };

    els.linkVoltar.href = `/turma/${TURMA_ID}`;

    carregarInfosTurma();
    carregarAvaliacoes();

    els.form.addEventListener('submit', handleCriar);
    els.cancelar.addEventListener('click', limparEdicao);
    els.inputCategoria.addEventListener('change', atualizarCamposCategoria);
    els.inputPeriodoNumero.addEventListener('change', atualizarPesoSugerido);
    els.inputPeriodoTipo.addEventListener('change', atualizarPesoSugerido);
    els.atualizarRendimento.addEventListener('click', carregarRendimento);
    atualizarPesoSugerido();
    atualizarCamposCategoria();
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
            await carregarRendimento();
            return;
        }

        avaliacoesCarregadas = avaliacoes;
        const grupos = agruparPorPeriodo(avaliacoes);

        const ordemGrupo = grupo => {
            const av = grupo[0];
            const numero = Number(av.periodo_numero) || 1;
            if (av.categoria === 'recuperacao') return numero === 1 ? 2.5 : 4.5;
            if (av.periodo_tipo === 'avaliacao') return numero;
            return 100 + numero;
        };
        Object.keys(grupos)
            .sort((a, b) => ordemGrupo(grupos[a]) - ordemGrupo(grupos[b]))
            .forEach(chave => {
            const grupo = grupos[chave];
            const primeira = grupo[0];

            const section = document.createElement('section');
            section.className = 'periodo-grupo';

            section.innerHTML = `
                <h3 class="periodo-titulo">
                    ${primeira.categoria === 'recuperacao'
                        ? `${escapeHTML(primeira.periodo_numero)}ª Recuperação · ${primeira.periodo_numero === 1 ? '1ª e 2ª' : '3ª e 4ª'} avaliações`
                        : escapeHTML(nomePeriodo(primeira.periodo_tipo, primeira.periodo_numero))}
                </h3>
            `;

            grupo.forEach(av => {
                section.appendChild(criarCardAvaliacao(av));
            });

            els.lista.appendChild(section);
        });
        await carregarRendimento();

    } catch (error) {
        console.error(error);
        els.lista.innerHTML = `<p style="color:red;">${escapeHTML(error.message)}</p>`;
    }
}

function agruparPorPeriodo(avaliacoes) {
    const grupos = {};

    avaliacoes.forEach(av => {
        const chave = av.categoria === 'recuperacao'
            ? `recuperacao_${av.periodo_numero}`
            : `${av.periodo_tipo || 'avaliacao'}_${av.periodo_numero || 1}`;

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
                    ${av.categoria === 'recuperacao' ? '<span class="tag-av">Sem peso próprio</span>' : `<span class="tag-av">Peso: ${escapeHTML(av.peso)}</span>`}
                    <span class="tag-av">Média: ${av.media_turma ?? '-'}</span>
                    <span class="tag-av">Notas: ${av.total_notas_lancadas || 0}</span>
                </div>
            </div>
        </div>

        <div class="acoes-av">
            <a href="/avaliacao/${av.id}/lancamento" class="botao-acao">
                Lançar Notas
            </a>

            <button type="button" onclick="editarAvaliacao('${av.id}')" class="botao-acao">Editar</button>
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
        peso: els.inputCategoria.value === 'recuperacao'
            ? 1 : Number(els.inputPeso.value || 1)
    };

    if (!dados.nome) {
        alert('Informe o nome da avaliação.');
        return;
    }

    try {
        const res = await fetch(avaliacaoEmEdicao ? `/api/avaliacoes/${avaliacaoEmEdicao.id}` : '/api/avaliacoes', {
            method: avaliacaoEmEdicao ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(avaliacaoEmEdicao ? {...dados, revision: avaliacaoEmEdicao.revision} : dados)
        });

        const resposta = await res.json();

        if (!res.ok) {
            throw new Error(resposta.error || 'Erro ao criar avaliação.');
        }

        limparEdicao();

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
function limparEdicao() {
    avaliacaoEmEdicao = null;
    els.form.reset();
    els.inputMax.value = 10;
    els.inputPeso.value = 2;
    els.inputPeriodoNumero.value = 1;
    atualizarCamposCategoria();
    els.tituloForm.textContent = 'Nova Atividade Avaliativa';
    els.form.querySelector('button[type="submit"]').textContent = 'Cadastrar Avaliação';
    els.cancelar.hidden = true;
    els.cancelar.style.display = 'none';
}

window.editarAvaliacao = function(id) {
    const av = avaliacoesCarregadas.find(item => item.id === id);
    if (!av) return;
    avaliacaoEmEdicao = av;
    els.inputNome.value = av.nome || '';
    els.inputData.value = av.data || '';
    els.inputMax.value = av.nota_maxima;
    els.inputPeriodoTipo.value = av.periodo_tipo || 'avaliacao';
    els.inputPeriodoNumero.value = av.periodo_numero || 1;
    els.inputCategoria.value = av.categoria || 'atividade';
    els.inputPeso.value = av.peso || 1;
    atualizarCamposCategoria();
    els.tituloForm.textContent = 'Editar avaliação';
    els.form.querySelector('button[type="submit"]').textContent = 'Salvar alterações';
    els.cancelar.hidden = false;
    els.cancelar.style.display = 'inline-block';
    els.form.scrollIntoView({behavior: 'smooth', block: 'start'});
};


function atualizarPesoSugerido() {
    if (avaliacaoEmEdicao || els.inputCategoria.value === 'recuperacao') return;
    if (els.inputPeriodoTipo.value !== 'avaliacao') return;
    const pesos = {1: 2, 2: 3, 3: 2, 4: 3};
    const n = Number(els.inputPeriodoNumero.value);
    if (pesos[n]) els.inputPeso.value = pesos[n];
}

function atualizarCamposCategoria() {
    const recuperacao = els.inputCategoria.value === 'recuperacao';
    els.boxPeso.hidden = recuperacao;
    els.boxPeso.style.display = recuperacao ? 'none' : '';
    els.avisoRecuperacao.hidden = !recuperacao;
    if (recuperacao) {
        els.inputPeriodoTipo.value = 'avaliacao';
        els.inputPeriodoTipo.disabled = true;
        els.inputPeriodoNumero.min = 1;
        els.inputPeriodoNumero.max = 2;
        if (Number(els.inputPeriodoNumero.value) > 2) {
            els.inputPeriodoNumero.value = 1;
        }
    } else {
        els.inputPeriodoTipo.disabled = false;
        els.inputPeriodoNumero.max = 12;
        atualizarPesoSugerido();
    }
}

function mostrarNota(numero) {
    return numero === null || numero === undefined
        ? '—' : Number(numero).toLocaleString('pt-BR', {maximumFractionDigits: 2});
}

async function carregarRendimento() {
    els.quadro.innerHTML = '<p>Calculando rendimento...</p>';
    try {
        const res = await fetch(`/api/turma/${TURMA_ID}/rendimento`);
        const dados = await res.json();
        if (!res.ok) throw new Error(dados.error || 'Erro ao consultar rendimento.');
        const alunos = dados.alunos || [];
        if (!alunos.length) {
            els.quadro.textContent = 'Não há alunos vinculados à turma.';
            return;
        }
        const linhas = alunos.map(({nome, rendimento: r}) => {
            const avaliacoes = [1, 2, 3, 4].map(n => {
                const p = r.periodos[n];
                const principal = mostrarNota(p.efetiva);
                return `<td class="${p.recuperada ? 'rec-aplicada' : ''}">
                    ${principal}
                    ${p.recuperada ? `<span class="rec-origem">Antes: ${mostrarNota(p.original)}</span>` : ''}
                </td>`;
            });
            const recs = [1, 2].map(n => {
                const rec = r.recuperacoes[n];
                return `<td title="${rec.aplicada ? `Aplicada à ${rec.alvo}ª avaliação` : 'Sem substituição'}">
                    ${mostrarNota(rec.nota)}
                    ${rec.aplicada ? `<span class="rec-origem">→ ${rec.alvo}ª AV.</span>` : ''}
                </td>`;
            });
            const media = r.completo ? mostrarNota(r.media_anual)
                : `${mostrarNota(r.media_parcial)} <span class="rec-origem">Parcial</span>`;
            return `<tr><td>${escapeHTML(nome || '')}</td>${avaliacoes.join('')}${recs.join('')}
                <td>${media}</td></tr>`;
        });
        els.quadro.innerHTML = `
            <table><thead><tr>
                <th>Aluno</th><th>1ª AV. ×2</th><th>2ª AV. ×3</th>
                <th>3ª AV. ×2</th><th>4ª AV. ×3</th>
                <th>1ª REC</th><th>2ª REC</th><th>Média</th>
            </tr></thead><tbody>${linhas.join('')}</tbody></table>`;
        const avisos = [...new Set(alunos.flatMap(item => item.rendimento.avisos || []))];
        if (avisos.length) {
            const div = document.createElement('p');
            div.style.color = '#f59e0b';
            div.textContent = avisos.join(' ');
            els.quadro.prepend(div);
        }
    } catch (error) {
        els.quadro.textContent = error.message;
    }
}
