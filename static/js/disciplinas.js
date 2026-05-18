// static/js/disciplinas.js

let editMode = false;
let disciplinasCache = [];
let els = {};

document.addEventListener('DOMContentLoaded', () => {
    els = {
        form: document.getElementById('form-disciplina'),
        tituloForm: document.getElementById('titulo-form'),
        disciplinaId: document.getElementById('disciplina_id'),
        nome: document.getElementById('nome'),
        descricao: document.getElementById('descricao'),
        cor: document.getElementById('cor'),
        btnSalvar: document.getElementById('btn-salvar'),
        btnCancelar: document.getElementById('btn-cancelar'),
        msgSucesso: document.getElementById('msg-sucesso'),
        msgErro: document.getElementById('msg-erro'),
        lista: document.getElementById('lista-disciplinas')
    };

    carregarDisciplinas();

    els.form.addEventListener('submit', handleSubmit);
    els.btnCancelar.addEventListener('click', resetFormulario);
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

async function carregarDisciplinas() {
    try {
        els.lista.innerHTML = '<p>Carregando...</p>';

        const response = await fetch('/api/disciplinas');

        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.error || 'Erro ao carregar disciplinas.');
        }

        const disciplinas = await response.json();
        disciplinasCache = disciplinas;

        renderizarDisciplinas(disciplinas);

    } catch (error) {
        console.error(error);
        els.lista.innerHTML = `<p style="color: red;">${escapeHTML(error.message)}</p>`;
    }
}

function renderizarDisciplinas(disciplinas) {
    els.lista.innerHTML = '';

    if (!Array.isArray(disciplinas) || disciplinas.length === 0) {
        els.lista.innerHTML = '<p style="color:#777;">Nenhuma disciplina cadastrada.</p>';
        return;
    }

    disciplinas.forEach(disciplina => {
        const cor = disciplina.cor || '#007bff';

        const div = document.createElement('div');
        div.className = 'disciplina-card';
        div.style.borderLeftColor = cor;

        div.innerHTML = `
            <div class="disciplina-info">
                <h3>
                    <span 
                        class="disciplina-cor" 
                        style="background-color: ${escapeHTML(cor)};"
                    ></span>
                    ${escapeHTML(disciplina.nome)}
                </h3>

                <p>
                    ${disciplina.descricao 
                        ? escapeHTML(disciplina.descricao) 
                        : 'Sem descrição.'}
                </p>
            </div>

            <div class="disciplina-acoes">
                <button 
                    class="btn-editar-disciplina" 
                    onclick='prepararEdicaoDisciplina(${JSON.stringify(disciplina)})'
                >
                    Editar
                </button>

                <button 
                    class="btn-excluir-disciplina" 
                    onclick="excluirDisciplina('${disciplina.id}')"
                >
                    Excluir
                </button>
            </div>
        `;

        els.lista.appendChild(div);
    });
}

async function handleSubmit(event) {
    event.preventDefault();
    limparMensagens();

    const dados = {
        nome: els.nome.value.trim(),
        descricao: els.descricao.value.trim() || null,
        cor: els.cor.value || '#007bff'
    };

    if (!dados.nome) {
        mostrarErro('Informe o nome da disciplina.');
        return;
    }

    const id = els.disciplinaId.value;
    const url = editMode ? `/api/disciplinas/${id}` : '/api/disciplinas';
    const method = editMode ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dados)
        });

        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.error || 'Erro ao salvar disciplina.');
        }

        mostrarSucesso(editMode ? 'Disciplina atualizada!' : 'Disciplina cadastrada!');
        resetFormulario();
        carregarDisciplinas();

    } catch (error) {
        mostrarErro(error.message);
    }
}

window.prepararEdicaoDisciplina = function(disciplina) {
    editMode = true;

    els.disciplinaId.value = disciplina.id;
    els.nome.value = disciplina.nome || '';
    els.descricao.value = disciplina.descricao || '';
    els.cor.value = disciplina.cor || '#007bff';

    els.tituloForm.textContent = `Editando: ${disciplina.nome}`;
    els.btnSalvar.textContent = 'Atualizar Disciplina';
    els.btnCancelar.style.display = 'inline-block';

    limparMensagens();

    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
};

window.excluirDisciplina = async function(id) {
    const disciplina = disciplinasCache.find(item => item.id === id);
    const nome = disciplina ? disciplina.nome : 'esta disciplina';

    if (!confirm(`Tem certeza que deseja excluir "${nome}"? As turmas vinculadas ficarão sem disciplina.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/disciplinas/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const erro = await response.json();
            throw new Error(erro.error || 'Erro ao excluir disciplina.');
        }

        if (editMode && els.disciplinaId.value === id) {
            resetFormulario();
        }

        mostrarSucesso('Disciplina excluída com sucesso!');
        carregarDisciplinas();

    } catch (error) {
        mostrarErro(error.message);
    }
};

function resetFormulario() {
    editMode = false;

    els.form.reset();
    els.disciplinaId.value = '';
    els.cor.value = '#007bff';

    els.tituloForm.textContent = 'Cadastrar Nova Disciplina';
    els.btnSalvar.textContent = 'Salvar Disciplina';
    els.btnCancelar.style.display = 'none';

    limparMensagens();
}

function limparMensagens() {
    els.msgSucesso.style.display = 'none';
    els.msgErro.style.display = 'none';
    els.msgSucesso.textContent = '';
    els.msgErro.textContent = '';
}

function mostrarSucesso(mensagem) {
    els.msgSucesso.textContent = mensagem;
    els.msgSucesso.style.display = 'block';

    setTimeout(() => {
        els.msgSucesso.style.display = 'none';
    }, 3000);
}

function mostrarErro(mensagem) {
    els.msgErro.textContent = mensagem;
    els.msgErro.style.display = 'block';
}