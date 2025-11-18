// static/js/alunos.js

// Estado Global
let editMode = false;
let listaAlunosCache = [];

// Elementos do DOM (Serão inicializados no DOMContentLoaded)
let els = {};

document.addEventListener('DOMContentLoaded', () => {
    // Inicializa referências aos elementos
    els = {
        form: document.getElementById('form-aluno'),
        tituloForm: document.getElementById('titulo-form'),
        btnSalvar: document.getElementById('btn-salvar'),
        btnCancelar: document.getElementById('btn-cancelar'),
        id: document.getElementById('aluno_id'),
        nome: document.getElementById('nome_completo'),
        matricula: document.getElementById('matricula'),
        telefone: document.getElementById('telefone'),
        email: document.getElementById('email'),
        msgErro: document.getElementById('msg-erro'),
        msgSucesso: document.getElementById('msg-sucesso'),
        filtro: document.getElementById('filtro-lista'),
        lista: document.getElementById('lista-alunos')
    };

    // Bind de eventos
    carregarAlunos();
    els.form.addEventListener('submit', handleFormSubmit);
    els.btnCancelar.addEventListener('click', resetFormulario);
    els.filtro.addEventListener('keyup', (e) => filtrarLista(e.target.value));
});

// --- CRUD: READ ---
async function carregarAlunos() {
    try {
        const response = await fetch('/api/alunos');
        const alunos = await response.json();
        listaAlunosCache = alunos;
        renderizarLista(alunos);
    } catch (error) {
        console.error('Erro:', error);
        els.lista.innerHTML = '<p style="color: red;">Erro ao carregar alunos.</p>';
    }
}

// --- RENDERIZAÇÃO ---
function renderizarLista(alunos) {
    els.lista.innerHTML = ''; 

    if (alunos.length === 0) {
        els.lista.innerHTML = '<p style="color: #666; font-style: italic;">Nenhum aluno encontrado.</p>';
        return;
    }

    alunos.forEach(aluno => {
        const div = document.createElement('div');
        div.className = 'aluno';

        const criarInfo = (label, valor) => valor 
            ? `<span style="margin-right: 10px; color: #666; font-size: 0.9em;">${label}: ${valor}</span>` 
            : '';

        const infoHTML = [
            criarInfo('Mat', aluno.matricula),
            criarInfo('Tel', aluno.telefone),
            criarInfo('Email', aluno.email)
        ].join('') || '<span style="color: #999; font-style: italic; font-size: 0.8em;">Sem dados adicionais</span>';

        div.innerHTML = `
            <div style="flex: 1; overflow: hidden;">
                <h3 style="margin-bottom: 5px;">${aluno.nome_completo}</h3>
                <div style="display: flex; flex-wrap: wrap;">
                    ${infoHTML}
                </div>
            </div>
            <div class="botoes-acao" style="margin-left: 10px; display: flex; flex-direction: column; gap: 5px;">
                <button class="edit" style="background-color: #ffc107; color: #000;" 
                    onclick='prepararEdicao(${JSON.stringify(aluno)})'>Editar</button>
                <button class="delete" onclick="handleDelete('${aluno.id}')">Excluir</button>
            </div>
        `;
        els.lista.appendChild(div);
    });
}

function filtrarLista(termo) {
    const termoLower = termo.toLowerCase();
    const filtrados = listaAlunosCache.filter(a => 
        a.nome_completo.toLowerCase().includes(termoLower) || 
        (a.matricula && a.matricula.toLowerCase().includes(termoLower))
    );
    renderizarLista(filtrados);
}

// --- CRUD: CREATE / UPDATE ---
window.prepararEdicao = function(aluno) {
    editMode = true;
    els.id.value = aluno.id;
    els.nome.value = aluno.nome_completo;
    els.matricula.value = aluno.matricula || '';
    els.telefone.value = aluno.telefone || '';
    els.email.value = aluno.email || '';

    els.tituloForm.textContent = `Editando: ${aluno.nome_completo}`;
    els.tituloForm.style.color = '#e0a800';
    els.btnSalvar.textContent = 'Atualizar Aluno';
    els.btnSalvar.style.backgroundColor = '#ffc107';
    els.btnSalvar.style.color = '#000';
    els.btnCancelar.style.display = 'inline-block';
    
    limparMensagens();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

function resetFormulario() {
    editMode = false;
    els.form.reset();
    els.id.value = '';
    
    els.tituloForm.textContent = 'Cadastrar Novo Aluno';
    els.tituloForm.style.color = '#333';
    els.btnSalvar.textContent = 'Salvar Aluno';
    els.btnSalvar.style.backgroundColor = '#007bff';
    els.btnSalvar.style.color = '#fff';
    els.btnCancelar.style.display = 'none';
    
    limparMensagens();
}

async function handleFormSubmit(event) {
    event.preventDefault(); 
    limparMensagens();

    const id = els.id.value;
    const dados = {
        nome_completo: els.nome.value,
        matricula: els.matricula.value || null,
        telefone: els.telefone.value || null,
        email: els.email.value || null
    };

    try {
        const url = editMode ? `/api/alunos/${id}` : '/api/alunos';
        const metodo = editMode ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados),
        });

        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.error || 'Erro ao processar');
        }

        mostrarSucesso(editMode ? 'Aluno atualizado!' : 'Aluno cadastrado!');
        resetFormulario();
        carregarAlunos();

    } catch (error) {
        console.error('Erro:', error);
        els.msgErro.textContent = error.message;
        els.msgErro.style.display = 'block';
    }
}

// --- CRUD: DELETE ---
window.handleDelete = async function(alunoId) {
    if (!confirm('Tem certeza? Isso removerá o aluno de todas as turmas.')) return;

    try {
        const response = await fetch(`/api/alunos/${alunoId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error((await response.json()).error);

        carregarAlunos();
        if (editMode && els.id.value === alunoId) resetFormulario();

    } catch (error) {
        alert(error.message);
    }
};

// --- Helpers ---
function limparMensagens() {
    els.msgErro.style.display = 'none';
    els.msgSucesso.style.display = 'none';
}

function mostrarSucesso(msg) {
    els.msgSucesso.textContent = msg;
    els.msgSucesso.style.display = 'block';
    setTimeout(() => { els.msgSucesso.style.display = 'none'; }, 3000);
}