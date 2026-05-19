// static/js/lancamento_notas.js

const AVALIACAO_ID = window.location.pathname.split('/')[2];

let els = {};
let avaliacaoAtual = null;

document.addEventListener('DOMContentLoaded', () => {
    els = {
        titulo: document.getElementById('titulo-pagina'),
        sub: document.getElementById('subtitulo'),
        voltar: document.getElementById('link-voltar'),
        tbody: document.getElementById('tbody-notas')
    };

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

async function carregarDados() {
    try {
        const res = await fetch(`/api/avaliacao/${AVALIACAO_ID}/diario`);
        const dados = await res.json();

        if (!res.ok) {
            throw new Error(dados.error || 'Erro ao carregar notas.');
        }

        avaliacaoAtual = dados.avaliacao;

        els.titulo.textContent = `Notas: ${avaliacaoAtual.nome}`;

        els.sub.innerHTML = `
            <div class="meta-avaliacao">
                <span class="tag-av">
                    ${escapeHTML(nomePeriodo(avaliacaoAtual.periodo_tipo, avaliacaoAtual.periodo_numero))}
                </span>

                <span class="tag-av">
                    ${escapeHTML(nomeCategoria(avaliacaoAtual.categoria))}
                </span>

                <span class="tag-av">
                    Nota máxima: ${escapeHTML(avaliacaoAtual.nota_maxima)}
                </span>

                <span class="tag-av">
                    Peso: ${escapeHTML(avaliacaoAtual.peso)}
                </span>
            </div>
        `;

        els.voltar.href = `/turma/${dados.turma_id}/avaliacoes`;

        if (!dados.alunos || dados.alunos.length === 0) {
            els.tbody.innerHTML = '<tr><td colspan="2">Nenhum aluno na turma.</td></tr>';
            return;
        }

        renderizarTabela(dados.alunos);

    } catch (error) {
        console.error(error);
        els.tbody.innerHTML = `
            <tr>
                <td colspan="2" style="color:red">
                    ${escapeHTML(error.message)}
                </td>
            </tr>
        `;
    }
}

function renderizarTabela(lista) {
    els.tbody.innerHTML = '';

    lista.forEach(aluno => {
        const tr = document.createElement('tr');
        const valorNota = aluno.nota !== null && aluno.nota !== undefined ? aluno.nota : '';

        tr.innerHTML = `
            <td>
                <strong>${escapeHTML(aluno.nome)}</strong><br>
                <small style="color: var(--text-sec);">
                    Matrícula: ${escapeHTML(aluno.matricula || '-')}
                </small>
            </td>

            <td>
                <input 
                    type="number" 
                    class="input-nota" 
                    min="0" 
                    max="${escapeHTML(aluno.nota_maxima)}" 
                    step="0.1"
                    value="${escapeHTML(valorNota)}"
                    data-aluno-id="${escapeHTML(aluno.id)}"
                    onchange="salvarNota(this)"
                >
            </td>
        `;

        els.tbody.appendChild(tr);
    });
}

window.salvarNota = async function(input) {
    const alunoId = input.dataset.alunoId;
    const valorDigitado = input.value;

    const valor = valorDigitado === '' ? null : Number(valorDigitado);

    if (valor !== null && valor < 0) {
        alert('A nota não pode ser menor que zero.');
        input.classList.add('erro');
        return;
    }

    if (valor !== null && valor > Number(avaliacaoAtual.nota_maxima)) {
        alert(`A nota não pode ser maior que ${avaliacaoAtual.nota_maxima}.`);
        input.classList.add('erro');
        return;
    }

    input.classList.remove('salvo', 'erro');
    input.classList.add('salvando');

    try {
        const res = await fetch('/api/notas', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                avaliacao_id: AVALIACAO_ID,
                aluno_id: alunoId,
                valor: valor
            })
        });

        const resposta = await res.json();

        if (!res.ok) {
            throw new Error(resposta.error || 'Erro ao salvar nota.');
        }

        input.classList.remove('salvando');
        input.classList.add('salvo');

        setTimeout(() => {
            input.classList.remove('salvo');
        }, 1200);

    } catch (error) {
        console.error(error);

        input.classList.remove('salvando');
        input.classList.add('erro');

        alert(error.message);
    }
};