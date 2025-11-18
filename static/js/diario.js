// static/js/diario.js

let els = {};

document.addEventListener('DOMContentLoaded', () => {
    els = {
        form: document.getElementById('form-diario'),
        titulo: document.getElementById('titulo'),
        conteudo: document.getElementById('conteudo'),
        selectTurma: document.getElementById('select-turma'),
        selectAluno: document.getElementById('select-aluno'),
        listaNotas: document.getElementById('lista-notas')
    };

    // Carrega dados iniciais
    carregarOpcoesVincular();
    carregarNotas();

    els.form.addEventListener('submit', handleSalvarNota);
});

// 1. Popula os Dropdowns (Turmas e Alunos)
async function carregarOpcoesVincular() {
    try {
        // Busca turmas e alunos em paralelo
        const [resTurmas, resAlunos] = await Promise.all([
            fetch('/api/turmas'),
            fetch('/api/alunos')
        ]);

        const turmas = await resTurmas.json();
        const alunos = await resAlunos.json();

        // Preenche Select Turma
        turmas.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.nome;
            els.selectTurma.appendChild(opt);
        });

        // Preenche Select Aluno
        alunos.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = a.nome_completo;
            els.selectAluno.appendChild(opt);
        });

    } catch (error) {
        console.error('Erro ao carregar opções:', error);
    }
}

// 2. Carrega e Renderiza as Notas
async function carregarNotas() {
    els.listaNotas.innerHTML = '<p>Carregando...</p>';
    try {
        const response = await fetch('/api/diario');
        const notas = await response.json();

        els.listaNotas.innerHTML = '';

        if (notas.length === 0) {
            els.listaNotas.innerHTML = '<p style="color:#777;">Nenhuma anotação encontrada.</p>';
            return;
        }

        notas.forEach(nota => {
            const div = document.createElement('div');
            div.className = 'nota-card';

            // Formata data
            const data = new Date(nota.created_at).toLocaleDateString('pt-BR');
            const hora = new Date(nota.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

            // Monta as tags de vínculo se existirem
            let tagsHTML = '';
            if (nota.turmas) tagsHTML += `<span class="tag">Turma: ${nota.turmas.nome}</span>`;
            if (nota.alunos) tagsHTML += `<span class="tag">Aluno: ${nota.alunos.nome_completo}</span>`;

            div.innerHTML = `
                <div class="nota-header">
                    <div>
                        <h3 class="nota-titulo">${nota.titulo}</h3>
                        <span class="nota-data">${data} às ${hora}</span>
                    </div>
                    <button class="btn-delete-nota" onclick="deletarNota('${nota.id}')">Excluir</button>
                </div>
                <div class="nota-tags">${tagsHTML}</div>
                <div class="nota-conteudo">${nota.conteudo || ''}</div>
            `;
            els.listaNotas.appendChild(div);
        });

    } catch (error) {
        console.error(error);
        els.listaNotas.innerHTML = '<p>Erro ao carregar notas.</p>';
    }
}

// 3. Salvar Nota
async function handleSalvarNota(e) {
    e.preventDefault();
    
    const dados = {
        titulo: els.titulo.value,
        conteudo: els.conteudo.value,
        turma_id: els.selectTurma.value || null,
        aluno_id: els.selectAluno.value || null
    };

    try {
        const res = await fetch('/api/diario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        if (!res.ok) throw new Error('Erro ao salvar');

        // Limpa form e recarrega
        els.form.reset();
        carregarNotas();

    } catch (error) {
        alert(error.message);
    }
}

// 4. Deletar Nota (Global para ser acessível via onclick)
window.deletarNota = async function(id) {
    if(!confirm('Tem certeza que deseja excluir esta anotação?')) return;

    try {
        await fetch(`/api/diario/${id}`, { method: 'DELETE' });
        carregarNotas();
    } catch (error) {
        alert('Erro ao excluir.');
    }
};