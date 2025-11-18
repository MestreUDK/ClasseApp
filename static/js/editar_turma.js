// static/js/editar_turma.js

// Pega o ID da turma pela URL
const TURMA_ID = window.location.pathname.split('/')[3];

let els = {};

document.addEventListener('DOMContentLoaded', () => {
    // Mapeia os elementos
    els = {
        form: document.getElementById('form-edit-turma'),
        nome: document.getElementById('nome'),
        descricao: document.getElementById('descricao'),
        msgErro: document.getElementById('msg-erro'),
        msgSucesso: document.getElementById('msg-sucesso')
    };

    // Inicia
    carregarDadosTurma();
    els.form.addEventListener('submit', handleEditSubmit);
});

async function carregarDadosTurma() {
    try {
        const response = await fetch(`/api/turmas/${TURMA_ID}`);
        if (!response.ok) {
            throw new Error('Erro ao buscar dados da turma');
        }
        const turma = await response.json();

        // Preenche o formulário
        els.nome.value = turma.nome;
        els.descricao.value = turma.descricao || '';

    } catch (error) {
        console.error(error);
        els.msgErro.textContent = error.message;
        els.msgErro.style.display = 'block';
    }
}

async function handleEditSubmit(event) {
    event.preventDefault();
    els.msgErro.style.display = 'none';
    els.msgSucesso.style.display = 'none';

    const dados = {
        nome: els.nome.value,
        descricao: els.descricao.value || null
    };

    try {
        const response = await fetch(`/api/turmas/${TURMA_ID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.error || 'Erro ao salvar alterações');
        }

        els.msgSucesso.textContent = 'Turma atualizada com sucesso!';
        els.msgSucesso.style.display = 'block';

    } catch (error) {
        console.error('Erro ao salvar:', error);
        els.msgErro.textContent = error.message;
        els.msgErro.style.display = 'block';
    }
}