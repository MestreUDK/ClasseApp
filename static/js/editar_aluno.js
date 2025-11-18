// static/js/editar_aluno.js

// Pega o ID do aluno direto da URL (ex: /aluno/editar/UUID)
const ALUNO_ID = window.location.pathname.split('/')[3];

let els = {};

document.addEventListener('DOMContentLoaded', () => {
    // Mapeia os elementos do formulário
    els = {
        form: document.getElementById('form-edit-aluno'),
        nome: document.getElementById('nome_completo'),
        matricula: document.getElementById('matricula'),
        telefone: document.getElementById('telefone'),
        email: document.getElementById('email'),
        msgErro: document.getElementById('msg-erro'),
        msgSucesso: document.getElementById('msg-sucesso')
    };

    // Inicia
    carregarDadosAluno();
    els.form.addEventListener('submit', handleEditSubmit);
});

async function carregarDadosAluno() {
    try {
        const response = await fetch(`/api/alunos/${ALUNO_ID}`);
        if (!response.ok) throw new Error('Erro ao buscar dados do aluno');

        const aluno = await response.json();

        // Preenche os campos
        els.nome.value = aluno.nome_completo;
        els.matricula.value = aluno.matricula || '';
        els.telefone.value = aluno.telefone || ''; 
        els.email.value = aluno.email || '';       

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
        nome_completo: els.nome.value,
        matricula: els.matricula.value || null,
        telefone: els.telefone.value || null, 
        email: els.email.value || null        
    };

    try {
        const response = await fetch(`/api/alunos/${ALUNO_ID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.error || 'Erro ao salvar alterações');
        }

        els.msgSucesso.textContent = 'Aluno atualizado com sucesso!';
        els.msgSucesso.style.display = 'block';

    } catch (error) {
        console.error('Erro ao salvar:', error);
        els.msgErro.textContent = error.message;
        els.msgErro.style.display = 'block';
    }
}