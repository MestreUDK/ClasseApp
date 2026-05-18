// static/js/home.js

let disciplinasCache = [];

document.addEventListener('DOMContentLoaded', () => {
    carregarStats();
    carregarDisciplinas();
    carregarTurmas();

    document.getElementById('form-turma').addEventListener('submit', handleCriarTurma);
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

async function carregarStats() {
    try {
        const res = await fetch('/api/dashboard/stats');
        const stats = await res.json();

        document.getElementById('total-alunos').textContent = stats.total_alunos;
        document.getElementById('total-turmas').textContent = stats.total_turmas;
        document.getElementById('media-freq').textContent = `${stats.media_presenca}%`;

    } catch (error) {
        console.error('Erro ao carregar stats:', error);
    }
}

async function carregarDisciplinas() {
    const select = document.getElementById('disciplina_id');

    try {
        const res = await fetch('/api/disciplinas');

        if (!res.ok) {
            throw new Error('Erro ao carregar disciplinas.');
        }

        const disciplinas = await res.json();
        disciplinasCache = disciplinas;

        select.innerHTML = '<option value="">Sem disciplina específica</option>';

        disciplinas.forEach(disciplina => {
            const opt = document.createElement('option');
            opt.value = disciplina.id;
            opt.textContent = disciplina.nome;
            select.appendChild(opt);
        });

    } catch (error) {
        console.error(error);
        select.innerHTML = '<option value="">Erro ao carregar disciplinas</option>';
    }
}

async function carregarTurmas() {
    try {
        const response = await fetch('/api/turmas');
        const turmas = await response.json();

        const listaDiv = document.getElementById('lista-turmas');
        listaDiv.innerHTML = '';

        if (!Array.isArray(turmas) || turmas.length === 0) {
            listaDiv.innerHTML = '<p>Nenhuma turma cadastrada ainda.</p>';
            return;
        }

        turmas.forEach(turma => {
            const disciplina = turma.disciplinas || null;

            const disciplinaHTML = disciplina
                ? `
                    <div class="tag-disciplina">
                        <span 
                            class="bolinha-disciplina" 
                            style="background-color: ${escapeHTML(disciplina.cor || '#007bff')};"
                        ></span>
                        ${escapeHTML(disciplina.nome)}
                    </div>
                `
                : `
                    <div class="tag-disciplina">
                        <span 
                            class="bolinha-disciplina" 
                            style="background-color: #999;"
                        ></span>
                        Sem disciplina
                    </div>
                `;

            const turmaDiv = document.createElement('div');
            turmaDiv.className = 'turma';

            turmaDiv.innerHTML = `
                <div>
                    <h3>${escapeHTML(turma.nome)}</h3>
                    <p>${escapeHTML(turma.descricao || 'Sem descrição')}</p>
                    ${disciplinaHTML}
                </div>

                <div class="botoes-acao">
                    <a href="/turma/${turma.id}" class="botao-gerenciar">Gerenciar</a>
                    <a href="/turma/editar/${turma.id}" class="botao-edit">Editar</a>
                    <button class="botao-delete" onclick="handleDeleteTurma('${turma.id}')">Excluir</button>
                </div>
            `;

            listaDiv.appendChild(turmaDiv);
        });

    } catch (error) {
        console.error('Erro:', error);
        document.getElementById('lista-turmas').innerHTML = '<p>Erro ao carregar turmas.</p>';
    }
}

async function handleCriarTurma(event) {
    event.preventDefault();

    const nome = document.getElementById('nome').value.trim();
    const descricao = document.getElementById('descricao').value.trim();
    const disciplinaId = document.getElementById('disciplina_id').value || null;

    if (!nome) {
        alert('Informe o nome da turma.');
        return;
    }

    try {
        const response = await fetch('/api/turmas', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                nome,
                descricao: descricao || null,
                disciplina_id: disciplinaId
            })
        });

        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.error || 'Erro ao salvar turma.');
        }

        document.getElementById('form-turma').reset();
        document.getElementById('disciplina_id').value = '';

        carregarTurmas();
        carregarStats();

    } catch (error) {
        alert(error.message || 'Não foi possível salvar a turma.');
    }
}

window.handleDeleteTurma = async function(turmaId) {
    if (!confirm('Tem certeza que deseja excluir esta turma? Isso apagará todos os dados dela.')) {
        return;
    }

    try {
        const response = await fetch(`/api/turmas/${turmaId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.error || 'Erro ao excluir turma.');
        }

        carregarTurmas();
        carregarStats();

    } catch (error) {
        alert(error.message);
    }
};