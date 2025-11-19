// static/js/turma_detalhe.js

// Pega o ID da turma da URL
const TURMA_ID = window.location.pathname.split('/')[2];

// Estado Global
let TODOS_ALUNOS = []; 
let ALUNOS_VINCULADOS_MAP = new Map(); 
let els = {};

document.addEventListener('DOMContentLoaded', () => {
    // Inicializa referências
    els = {
        msgErro: document.getElementById('msg-erro'),
        nomeTurma: document.getElementById('nome-turma'),
        inputBusca: document.getElementById('busca-aluno'),
        listaBusca: document.getElementById('lista-busca-alunos'),
        listaVinculados: document.getElementById('lista-alunos-vinculados'),
        linkFreq: document.getElementById('link-frequencia'),
        linkStats: document.getElementById('link-stats'),
        linkNotas: document.getElementById('link-notas') // <-- ADICIONADO
    };

    // Configura links
    els.linkFreq.href = `/turma/${TURMA_ID}/frequencia`;
    els.linkStats.href = `/turma/${TURMA_ID}/estatisticas`;
    els.linkNotas.href = `/turma/${TURMA_ID}/avaliacoes`; // <-- ADICIONADO

    // Carrega dados
    Promise.all([
        carregarDetalhesTurma(),
        carregarTodosAlunos(), 
        carregarAlunosVinculados() 
    ]).then(() => {
        renderizarBusca();
    });

    // Event Listeners
    els.inputBusca.addEventListener('keyup', renderizarBusca);
});

// --- API CALLS ---
async function carregarDetalhesTurma() {
    try {
        const res = await fetch(`/api/turmas/${TURMA_ID}`);
        if (!res.ok) throw new Error((await res.json()).error);
        const turma = await res.json();
        els.nomeTurma.textContent = `Gerenciando Turma: ${turma.nome}`;
    } catch (err) {
        console.error(err);
        els.msgErro.textContent = err.message;
        els.msgErro.style.display = 'block';
    }
}

async function carregarTodosAlunos() {
    try {
        const res = await fetch('/api/alunos');
        if (!res.ok) throw new Error((await res.json()).error);
        TODOS_ALUNOS = await res.json();
    } catch (err) {
        console.error(err);
        els.listaBusca.innerHTML = '<p style="color: red; padding: 10px;">Erro ao carregar lista global.</p>';
    }
}

async function carregarAlunosVinculados() {
    try {
        const res = await fetch(`/api/turmas/${TURMA_ID}/alunos_vinculados`);
        if (!res.ok) throw new Error((await res.json()).error);
        const alunos = await res.json();

        els.listaVinculados.innerHTML = ''; 
        ALUNOS_VINCULADOS_MAP.clear(); 

        if (alunos.length === 0) {
            els.listaVinculados.innerHTML = '<li style="padding:10px; color:#666;">Nenhum aluno vinculado ainda.</li>';
            return;
        }

        alunos.forEach(item => {
            const aluno = item.alunos; 
            ALUNOS_VINCULADOS_MAP.set(aluno.id, item.id); 

            const li = document.createElement('li');
            li.className = 'aluno-vinculado-item';
            li.innerHTML = `
                <span>${aluno.nome_completo}</span>
                <button class="remover" onclick="handleRemover('${item.id}', '${aluno.id}')">Remover</button>
            `;
            els.listaVinculados.appendChild(li);
        });
    } catch (err) {
        console.error(err);
        els.listaVinculados.innerHTML = '<li style="color:red;">Erro ao carregar vinculados.</li>';
    }
}

// --- LÓGICA DE UI ---
function renderizarBusca() {
    const termo = els.inputBusca.value.toLowerCase().trim();

    if (termo.length < 2) {
        els.listaBusca.innerHTML = '<p style="padding: 10px; color: #777;">Digite ao menos 2 caracteres...</p>';
        return;
    }

    const filtrados = TODOS_ALUNOS.filter(aluno => {
        const matchNome = aluno.nome_completo.toLowerCase().includes(termo);
        const matchMatricula = (aluno.matricula || '').toLowerCase().includes(termo);
        // Só mostra se NÃO estiver vinculado
        return (matchNome || matchMatricula) && !ALUNOS_VINCULADOS_MAP.has(aluno.id);
    });

    els.listaBusca.innerHTML = ''; 

    if (filtrados.length === 0) {
        els.listaBusca.innerHTML = '<p style="padding: 10px; color: #777;">Nenhum aluno encontrado.</p>';
        return;
    }

    filtrados.forEach(aluno => {
        const div = document.createElement('div');
        div.className = 'aluno-busca-item';

        let infoExtra = '';
        if (aluno.matricula) {
            infoExtra = `<br><small style="color: #666;">Mat: ${aluno.matricula}</small>`;
        }

        div.innerHTML = `
            <span>
                <strong>${aluno.nome_completo}</strong>
                ${infoExtra}
            </span>
            <button onclick="handleVincular('${aluno.id}')">Vincular</button>
        `;
        els.listaBusca.appendChild(div);
    });
}

// --- AÇÕES DE CLIQUE ---
// Precisam ser globais (window) porque são chamadas via onclick no HTML gerado
window.handleVincular = async function(alunoId) {
    try {
        const res = await fetch('/api/turmas/vincular_aluno', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ turma_id: TURMA_ID, aluno_id: alunoId })
        });
        if (!res.ok) throw new Error((await res.json()).error);

        await carregarAlunosVinculados(); 
        renderizarBusca(); 

    } catch (err) {
        alert(`Erro: ${err.message}`);
    }
};

window.handleRemover = async function(vinculoId, alunoId) {
    if (!confirm('Remover aluno da turma?')) return;

    try {
        const res = await fetch(`/api/turmas/remover_aluno/${vinculoId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error((await res.json()).error);

        ALUNOS_VINCULADOS_MAP.delete(alunoId);
        await carregarAlunosVinculados(); 
        renderizarBusca(); 

    } catch (err) {
        alert(`Erro: ${err.message}`);
    }
};
