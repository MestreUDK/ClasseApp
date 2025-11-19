// static/js/lancamento_notas.js

const AVALIACAO_ID = window.location.pathname.split('/')[2];
let els = {};
let notaMaxima = 10;

document.addEventListener('DOMContentLoaded', () => {
    els = {
        titulo: document.getElementById('titulo-pagina'),
        sub: document.getElementById('subtitulo'),
        voltar: document.getElementById('link-voltar'),
        tbody: document.getElementById('tbody-notas')
    };

    carregarDados();
});

async function carregarDados() {
    try {
        const res = await fetch(`/api/avaliacao/${AVALIACAO_ID}/diario`);
        const dados = await res.json();

        if (!dados || dados.length === 0) {
            els.tbody.innerHTML = '<tr><td colspan="2">Nenhum aluno na turma.</td></tr>';
            return;
        }

        // Pega metadados do primeiro item (todos têm a mesma nota máxima)
        notaMaxima = dados[0].nota_maxima;
        
        // Não temos o nome da avaliação/turma direto nessa API para simplificar,
        // mas podemos inferir ou fazer outra chamada. Vamos focar na lista.
        els.titulo.textContent = `Lançamento de Notas`;
        els.sub.textContent = `Valor Máximo: ${notaMaxima}`;
        
        // O link de voltar não temos o ID da turma fácil aqui sem outra chamada API.
        // Truque: Histórico do navegador ou uma chamada extra.
        // Vamos fazer uma chamada extra para pegar detalhes da avaliação e saber a turma.
        // (Implementação simplificada: Volta pro histórico -1)
        els.voltar.onclick = (e) => { e.preventDefault(); window.history.back(); };

        renderizarTabela(dados);

    } catch (error) {
        console.error(error);
        els.tbody.innerHTML = '<tr><td colspan="2" style="color:red">Erro ao carregar.</td></tr>';
    }
}

function renderizarTabela(lista) {
    els.tbody.innerHTML = '';

    lista.forEach(aluno => {
        const tr = document.createElement('tr');
        
        const valorNota = aluno.nota !== null ? aluno.nota : '';

        tr.innerHTML = `
            <td>
                <strong>${aluno.nome}</strong><br>
                <small style="color: var(--text-sec)">${aluno.matricula || ''}</small>
            </td>
            <td>
                <input type="number" step="0.1" min="0" max="${notaMaxima}" 
                       class="input-nota" 
                       value="${valorNota}" 
                       data-aluno="${aluno.id}"
                       onblur="salvarNota(this)">
            </td>
        `;
        els.tbody.appendChild(tr);
    });
}

// Função global chamada no onblur do input
window.salvarNota = async function(input) {
    const alunoId = input.dataset.aluno;
    let valor = input.value;

    // Validação básica
    if (valor === '') return; // Não salva vazio por enquanto (ou poderia deletar)
    if (parseFloat(valor) > notaMaxima) {
        alert(`A nota não pode ser maior que ${notaMaxima}`);
        input.classList.add('erro');
        return;
    }

    input.classList.remove('salvo', 'erro');

    try {
        const payload = {
            avaliacao_id: AVALIACAO_ID,
            aluno_id: alunoId,
            valor: parseFloat(valor)
        };

        const res = await fetch('/api/notas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            // Feedback visual: Borda verde por 1 segundo
            input.classList.add('salvo');
            setTimeout(() => input.classList.remove('salvo'), 2000);
        } else {
            input.classList.add('erro');
        }

    } catch (e) {
        console.error(e);
        input.classList.add('erro');
    }
};
