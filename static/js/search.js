// static/js/search.js

// Pega o termo da busca direto da URL (ex: /search?q=Fulano)
const params = new URLSearchParams(window.location.search);
const TERMO_BUSCA = params.get('q');

let els = {};

document.addEventListener('DOMContentLoaded', () => {
    // Mapeia elementos
    els = {
        termo: document.getElementById('termo-buscado'),
        status: document.getElementById('status-busca'),
        divAlunos: document.getElementById('resultados-alunos'),
        divTurmas: document.getElementById('resultados-turmas'),
        // Precisamos dos pais (colunas) para escondê-los inteiros
        colunaAlunos: document.getElementById('resultados-alunos').parentNode,
        colunaTurmas: document.getElementById('resultados-turmas').parentNode,
        msgVazio: document.getElementById('msg-nenhum-resultado') // Novo elemento opcional
    };

    // Preenche o título e busca
    if (TERMO_BUSCA) {
        els.termo.textContent = TERMO_BUSCA;
        executarBusca();
    } else {
        els.status.textContent = 'Nenhum termo pesquisado.';
    }
});

async function executarBusca() {
    if (!TERMO_BUSCA || TERMO_BUSCA.length < 2) {
        els.status.textContent = 'Busca inválida. Digite ao menos 2 caracteres.';
        return;
    }

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(TERMO_BUSCA)}`);
        const resultados = await response.json();

        if (!response.ok) throw new Error(resultados.error || 'Erro ao buscar');

        els.status.style.display = 'none';

        // Renderiza (e esconde/mostra as seções)
        renderizarAlunos(resultados.alunos);
        renderizarTurmas(resultados.turmas);

        // Se não achou NADA em lugar nenhum
        if (resultados.alunos.length === 0 && resultados.turmas.length === 0) {
            els.colunaAlunos.style.display = 'none';
            els.colunaTurmas.style.display = 'none';
            // Mostra uma mensagem global de "nada encontrado" se preferir
            // ou reativa o status
            els.status.textContent = 'Nenhum resultado encontrado para sua busca.';
            els.status.style.display = 'block';
        }

    } catch (error) {
        console.error(error);
        els.status.textContent = `Erro: ${error.message}`;
        els.status.style.display = 'block';
    }
}

function renderizarAlunos(alunos) {
    if (alunos.length === 0) {
        // ESCONDE a coluna inteira de alunos se não tiver nada
        els.colunaAlunos.style.display = 'none';
        return;
    }

    // MOSTRA a coluna se tiver resultados (caso estivesse oculta)
    els.colunaAlunos.style.display = 'block';
    els.divAlunos.innerHTML = '';
    
    alunos.forEach(aluno => {
        const item = document.createElement('div');
        item.className = 'item-resultado';
        
        // 1. Matrícula
        let matriculaHTML = aluno.matricula 
            ? `<p style="margin-bottom: 0; color: #555;">Matrícula: ${aluno.matricula}</p>` 
            : '';

        // 2. Turmas (Links)
        let turmasHTML = '';
        if (aluno.turmas_json && aluno.turmas_json.length > 0) {
            const linksTurmas = aluno.turmas_json.map(t => 
                `<a href="/turma/${t.id}" style="color: #17a2b8; text-decoration: none; font-weight: bold;">${t.nome}</a>`
            );
            
            turmasHTML = `<p style="font-size: 0.9em; color: #666; margin-top: 5px;">
                            <strong>Turmas:</strong> ${linksTurmas.join(', ')}
                          </p>`;
        } else {
             turmasHTML = `<p style="font-size: 0.9em; color: #999; margin-top: 5px; font-style: italic;">
                            Não vinculado a turmas
                          </p>`;
        }

        item.innerHTML = `
            <a href="/aluno/editar/${aluno.id}">
                <h3>${aluno.nome_completo}</h3>
            </a>
            ${matriculaHTML}
            ${turmasHTML}
        `;
        els.divAlunos.appendChild(item);
    });
}

function renderizarTurmas(turmas) {
    if (turmas.length === 0) {
        // ESCONDE a coluna inteira de turmas se não tiver nada
        els.colunaTurmas.style.display = 'none';
        return;
    }

    // MOSTRA a coluna
    els.colunaTurmas.style.display = 'block';
    els.divTurmas.innerHTML = '';
    
    turmas.forEach(turma => {
        const item = document.createElement('div');
        item.className = 'item-resultado';
        
        let descricaoHTML = turma.descricao 
            ? `<p>${turma.descricao}</p>` 
            : '';

        item.innerHTML = `
            <a href="/turma/${turma.id}">
                <h3>${turma.nome}</h3>
            </a>
            ${descricaoHTML}
        `;
        els.divTurmas.appendChild(item);
    });
}