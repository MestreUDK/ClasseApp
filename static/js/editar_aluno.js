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
        
        // ==========================================
        // --- NOVO: REFERÊNCIAS DOS NOVOS CAMPOS ---
        // ==========================================
        nascimentoDia: document.getElementById('nascimento_dia'),
        nascimentoMes: document.getElementById('nascimento_mes'),
        nascimentoAno: document.getElementById('nascimento_ano'),
        detalhes: document.getElementById('detalhes'),

        msgErro: document.getElementById('msg-erro'),
        msgSucesso: document.getElementById('msg-sucesso')
    };

    // Inicia
    carregarDadosAluno();
    els.form.addEventListener('submit', handleEditSubmit);
});

let revisaoAluno = null;

async function carregarDadosAluno() {
    try {
        const response = await fetch(`/api/alunos/${ALUNO_ID}`);
        if (!response.ok) throw new Error('Erro ao buscar dados do aluno');

        const aluno = await response.json();
        revisaoAluno = aluno.revision;

        // Preenche os campos
        els.nome.value = aluno.nome_completo;
        els.matricula.value = aluno.matricula || '';
        els.telefone.value = aluno.telefone || ''; 
        els.email.value = aluno.email || '';       
        
        // ==========================================
        // --- NOVO: PREENCHE OS NOVOS CAMPOS ---
        // ==========================================
        ClasseDataAniversario.preencher(els, aluno);
        els.detalhes.value = aluno.detalhes || '';

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

    try {
        const dados = {
        nome_completo: els.nome.value,
        matricula: els.matricula.value || null,
        telefone: els.telefone.value || null, 
        email: els.email.value || null,
        
        // ==========================================
        // --- NOVO: ENVIA OS NOVOS CAMPOS ---
        // ==========================================
        ...ClasseDataAniversario.obter(els),
        detalhes: els.detalhes.value || null,
        expected_revision: revisaoAluno
    };

        const response = await fetch(`/api/alunos/${ALUNO_ID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.error || 'Erro ao salvar alterações');
        }

        const atualizado = await response.json();
        revisaoAluno = atualizado.revision;
        els.msgSucesso.textContent = 'Aluno atualizado com sucesso!';
        els.msgSucesso.style.display = 'block';

    } catch (error) {
        console.error('Erro ao salvar:', error);
        els.msgErro.textContent = error.message;
        els.msgErro.style.display = 'block';
    }
}