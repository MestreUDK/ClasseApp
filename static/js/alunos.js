// static/js/alunos.js

// Estado Global
let editMode = false;
let revisaoEmEdicao = null;
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
        // ==========================================
        // --- NOVO: REFERÊNCIAS DOS NOVOS CAMPOS ---
        // ==========================================
        nascimentoDia: document.getElementById('nascimento_dia'),
        nascimentoMes: document.getElementById('nascimento_mes'),
        nascimentoAno: document.getElementById('nascimento_ano'),
        detalhes: document.getElementById('detalhes'),
        
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
    els.lista.replaceChildren();
    if (alunos.length === 0) {
        const vazio = document.createElement('p');
        vazio.style.cssText = 'color: #666; font-style: italic;';
        vazio.textContent = 'Nenhum aluno encontrado.';
        els.lista.append(vazio);
        return;
    }
    alunos.forEach(aluno => {
        const div = document.createElement('div');
        div.className = 'aluno';
        const conteudo = document.createElement('div');
        conteudo.style.cssText = 'flex: 1; overflow: hidden;';
        const titulo = document.createElement('h3');
        titulo.style.marginBottom = '5px';
        titulo.textContent = aluno.nome_completo || 'Aluno';
        if (aluno.detalhes) {
            const badge = document.createElement('span');
            badge.style.cssText = 'background: #17a2b8; color: white; padding: 2px 6px; border-radius: 4px; font-size: .7em; margin-left: 5px;';
            badge.textContent = 'Tem Detalhes';
            titulo.append(' ', badge);
        }
        conteudo.append(titulo);
        const infos = document.createElement('div');
        infos.style.cssText = 'display:flex;flex-wrap:wrap;';
        const criarInfo = (rotulo, valor) => {
            if (valor === null || valor === undefined || valor === '') return;
            const info = document.createElement('span');
            info.style.cssText = 'margin-right:10px;color:#666;font-size:.9em;';
            info.textContent = `${rotulo}: ${valor}`;
            infos.append(info);
        };
        criarInfo('Mat', aluno.matricula);
        criarInfo('Tel', aluno.telefone);
        criarInfo('Email', aluno.email);
        criarInfo('Nasc', ClasseDataAniversario.formatar(aluno));
        if (!infos.childNodes.length) {
            const vazio = document.createElement('span');
            vazio.style.cssText = 'color:#999;font-style:italic;font-size:.8em;';
            vazio.textContent = 'Sem dados adicionais';
            infos.append(vazio);
        }
        conteudo.append(infos);
        const botoes = document.createElement('div');
        botoes.className = 'botoes-acao';
        botoes.style.cssText = 'margin-left:10px;display:flex;flex-direction:column;gap:5px;';
        const editar = document.createElement('button');
        editar.type = 'button';
        editar.className = 'edit';
        editar.style.cssText = 'background-color:#ffc107;color:#000;';
        editar.textContent = 'Editar';
        editar.addEventListener('click', () => window.prepararEdicao(aluno));
        const excluir = document.createElement('button');
        excluir.type = 'button';
        excluir.className = 'delete';
        excluir.textContent = 'Excluir';
        excluir.addEventListener('click', () => window.handleDelete(aluno.id));
        botoes.append(editar, excluir);
        div.append(conteudo, botoes);
        els.lista.append(div);
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
    revisaoEmEdicao = aluno.revision;
    editMode = true;
    els.id.value = aluno.id;
    els.nome.value = aluno.nome_completo;
    els.matricula.value = aluno.matricula || '';
    els.telefone.value = aluno.telefone || '';
    els.email.value = aluno.email || '';
    
    // ==========================================
    // --- NOVO: PREENCHE OS NOVOS CAMPOS ---
    // ==========================================
    ClasseDataAniversario.preencher(els, aluno);
    els.detalhes.value = aluno.detalhes || '';

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
    revisaoEmEdicao = null;
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
        ...(editMode ? { expected_revision: revisaoEmEdicao } : {})
    };

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