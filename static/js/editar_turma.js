// static/js/editar_turma.js

// Pega o ID da turma pela URL
const TURMA_ID = window.location.pathname.split('/')[3];

let els = {};
let turmaAtual = null;

document.addEventListener('DOMContentLoaded', () => {
    els = {
        form: document.getElementById('form-edit-turma'),
        nome: document.getElementById('nome'),
        descricao: document.getElementById('descricao'),
        disciplinaId: document.getElementById('disciplina_id'),
        msgErro: document.getElementById('msg-erro'),
        msgSucesso: document.getElementById('msg-sucesso')
    };

    iniciarPagina();

    els.form.addEventListener('submit', handleEditSubmit);
});

async function iniciarPagina() {
    try {
        await carregarDisciplinas();
        await carregarDadosTurma();

    } catch (error) {
        mostrarErro(error.message);
    }
}

async function carregarDisciplinas() {
    const response = await fetch('/api/disciplinas');

    if (!response.ok) {
        const erro = await response.json();
        throw new Error(erro.error || 'Erro ao carregar disciplinas.');
    }

    const disciplinas = await response.json();

    els.disciplinaId.innerHTML = '<option value="">Sem disciplina específica</option>';

    if (!Array.isArray(disciplinas) || disciplinas.length === 0) {
        return;
    }

    disciplinas.forEach(disciplina => {
        const opt = document.createElement('option');
        opt.value = disciplina.id;
        opt.textContent = disciplina.nome;
        els.disciplinaId.appendChild(opt);
    });
}

async function carregarDadosTurma() {
    const response = await fetch(`/api/turmas/${TURMA_ID}`);

    if (!response.ok) {
        const erro = await response.json();
        throw new Error(erro.error || 'Erro ao buscar dados da turma.');
    }

    const turma = await response.json();
    turmaAtual = turma;

    els.nome.value = turma.nome || '';
    els.descricao.value = turma.descricao || '';

    if (turma.disciplina_id) {
        els.disciplinaId.value = turma.disciplina_id;
    } else if (turma.disciplinas && turma.disciplinas.id) {
        els.disciplinaId.value = turma.disciplinas.id;
    } else {
        els.disciplinaId.value = '';
    }
}

async function handleEditSubmit(event) {
    event.preventDefault();
    limparMensagens();

    const dados = {
        nome: els.nome.value.trim(),
        descricao: els.descricao.value.trim() || null,
        disciplina_id: els.disciplinaId.value || null
    };

    if (!dados.nome) {
        mostrarErro('Informe o nome da turma.');
        return;
    }

    try {
        const response = await fetch(`/api/turmas/${TURMA_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dados)
        });

        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.error || 'Erro ao salvar alterações.');
        }

        turmaAtual = await response.json();

        mostrarSucesso('Turma atualizada com sucesso!');

    } catch (error) {
        console.error('Erro ao salvar:', error);
        mostrarErro(error.message);
    }
}

function limparMensagens() {
    els.msgErro.style.display = 'none';
    els.msgSucesso.style.display = 'none';
    els.msgErro.textContent = '';
    els.msgSucesso.textContent = '';
}

function mostrarErro(mensagem) {
    els.msgErro.textContent = mensagem;
    els.msgErro.style.display = 'block';
}

function mostrarSucesso(mensagem) {
    els.msgSucesso.textContent = mensagem;
    els.msgSucesso.style.display = 'block';

    setTimeout(() => {
        els.msgSucesso.style.display = 'none';
    }, 3000);
}