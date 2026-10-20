// static/js/diario.js

let els = {};
let notasCarregadas = [];
let notaEmEdicao = null;

document.addEventListener('DOMContentLoaded', () => {
    els = {
        form: document.getElementById('form-diario'),
        titulo: document.getElementById('titulo'),
        dataReferencia: document.getElementById('data_referencia'),
        conteudo: document.getElementById('conteudo'),

        selectTurma: document.getElementById('select-turma'),
        selectAluno: document.getElementById('select-aluno'),

        listaNotas: document.getElementById('lista-notas'),
        tituloForm: document.getElementById('titulo-form-diario'),
        btnSalvar: document.getElementById('btn-salvar-diario'),
        btnCancelar: document.getElementById('btn-cancelar-edicao-diario')
    };

    if (els.dataReferencia) {
        els.dataReferencia.valueAsDate = new Date();
    }

    carregarOpcoesVincular();
    carregarNotas();

    els.form.addEventListener('submit', handleSalvarNota);
    els.btnCancelar.addEventListener('click', cancelarEdicao);
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

async function carregarOpcoesVincular() {
    try {
        const [resTurmas, resAlunos] = await Promise.all([
            fetch('/api/turmas'),
            fetch('/api/alunos')
        ]);

        const turmas = await resTurmas.json();
        const alunos = await resAlunos.json();

        els.selectTurma.innerHTML = '<option value="">Nenhuma turma vinculada</option>';
        els.selectAluno.innerHTML = '<option value="">Nenhum aluno vinculado</option>';

        turmas.forEach(turma => {
            const opt = document.createElement('option');
            opt.value = turma.id;
            opt.textContent = turma.nome;
            els.selectTurma.appendChild(opt);
        });

        alunos.sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));

        alunos.forEach(aluno => {
            const opt = document.createElement('option');
            opt.value = aluno.id;
            opt.textContent = aluno.nome_completo;
            els.selectAluno.appendChild(opt);
        });

    } catch (error) {
        console.error('Erro ao carregar opções:', error);
    }
}

async function carregarNotas() {
    els.listaNotas.innerHTML = '<p>Carregando...</p>';

    try {
        const response = await fetch('/api/diario');
        const notas = await response.json();

        els.listaNotas.innerHTML = '';
        notasCarregadas = Array.isArray(notas) ? notas : [];

        if (!Array.isArray(notas) || notas.length === 0) {
            els.listaNotas.innerHTML = '<p style="color:#777;">Nenhuma anotação encontrada.</p>';
            return;
        }

        notas.forEach(nota => {
            const div = document.createElement('div');
            div.className = 'nota-card';

            const dataRegistro = new Date(nota.created_at).toLocaleDateString('pt-BR');
            const horaRegistro = new Date(nota.created_at).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const dataOcorrencia = nota.data_referencia
                ? nota.data_referencia.split('-').reverse().join('/')
                : dataRegistro;

            let tagsHTML = '';

            if (nota.turmas) {
                tagsHTML += `<span class="tag">Turma: ${escapeHTML(nota.turmas.nome)}</span>`;
            }

            if (nota.alunos) {
                tagsHTML += `<span class="tag">Aluno: ${escapeHTML(nota.alunos.nome_completo)}</span>`;
            }

            div.innerHTML = `
                <div class="nota-header">
                    <div>
                        <h3 class="nota-titulo">${escapeHTML(nota.titulo)}</h3>
                        <span class="nota-data">
                            <strong>Ocorrência: ${escapeHTML(dataOcorrencia)}</strong> <br>
                            <small>Registrado em: ${escapeHTML(dataRegistro)} às ${escapeHTML(horaRegistro)}</small>
                        </span>
                    </div>
                    <div class="nota-acoes">
                        <button class="btn-edit-nota" type="button" data-editar="${escapeHTML(nota.id)}">Editar</button>
                        <button class="btn-delete-nota" type="button" data-excluir="${escapeHTML(nota.id)}">Excluir</button>
                    </div>
                </div>

                <div class="nota-tags">${tagsHTML}</div>
                <div class="nota-conteudo">${escapeHTML(nota.conteudo || '')}</div>
            `;

            div.querySelector('[data-editar]').addEventListener('click', () => editarNota(nota.id));
            div.querySelector('[data-excluir]').addEventListener('click', () => deletarNota(nota.id));
            els.listaNotas.appendChild(div);
        });

    } catch (error) {
        console.error(error);
        els.listaNotas.innerHTML = '<p>Erro ao carregar notas.</p>';
    }
}

async function handleSalvarNota(e) {
    e.preventDefault();

    const dados = {
        titulo: els.titulo.value,
        data_referencia: els.dataReferencia.value,
        conteudo: els.conteudo.value,
        turma_id: els.selectTurma.value || null,
        aluno_id: els.selectAluno.value || null,
        ...(notaEmEdicao ? {revision: notasCarregadas.find(n => String(n.id) === String(notaEmEdicao))?.revision} : {})
    };

    try {
        const res = await fetch(notaEmEdicao ? `/api/diario/${notaEmEdicao}` : '/api/diario', {
            method: notaEmEdicao ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        if (!res.ok) {
            const erro = await res.json();
            throw new Error(erro.error || 'Erro ao salvar anotação.');
        }

        cancelarEdicao();
        await carregarNotas();

    } catch (error) {
        alert(error.message);
        if (/Conflito|Revisão/i.test(error.message)) await carregarNotas();
    }
}

window.deletarNota = async function(id) {
    if (!confirm('Tem certeza que deseja excluir esta anotação?')) return;

    try {
        const res = await fetch(`/api/diario/${id}`, {
            method: 'DELETE'
        });

        if (!res.ok) {
            const erro = await res.json();
            throw new Error(erro.error || 'Erro ao excluir anotação.');
        }

        carregarNotas();

    } catch (error) {
        alert(error.message);
    }
};

function editarNota(id) {
    const nota = notasCarregadas.find(item => String(item.id) === String(id));
    if (!nota) return;
    notaEmEdicao = nota.id;
    els.titulo.value = nota.titulo || '';
    els.conteudo.value = nota.conteudo || '';
    els.dataReferencia.value = (nota.data_referencia || '').slice(0, 10);
    els.selectTurma.value = nota.turma_id || '';
    els.selectAluno.value = nota.aluno_id || '';
    els.tituloForm.textContent = 'Editar Anotação';
    els.btnSalvar.textContent = 'Salvar alterações';
    els.btnCancelar.hidden = false;
    els.btnCancelar.style.display = 'inline-block';
    els.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    els.titulo.focus({ preventScroll: true });
}

function cancelarEdicao() {
    notaEmEdicao = null;
    els.form.reset();
    els.dataReferencia.valueAsDate = new Date();
    els.tituloForm.textContent = 'Nova Anotação';
    els.btnSalvar.textContent = 'Salvar Nota';
    els.btnCancelar.hidden = true;
    els.btnCancelar.style.display = 'none';
}
