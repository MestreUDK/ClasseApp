// static/js/diario.js

let els = {};

document.addEventListener('DOMContentLoaded', () => {
    els = {
        form: document.getElementById('form-diario'),
        titulo: document.getElementById('titulo'),
        dataReferencia: document.getElementById('data_referencia'), // <-- NOVO
        conteudo: document.getElementById('conteudo'),
        
        // Elementos da Turma
        inputTurma: document.getElementById('input-turma'),
        listTurmas: document.getElementById('turmas-list'),
        
        // Elementos do Aluno
        inputAluno: document.getElementById('input-aluno'),
        listAlunos: document.getElementById('alunos-list'),
        
        listaNotas: document.getElementById('lista-notas')
    };

    // Define a data de hoje como padrão no calendário de ocorrência
    if (els.dataReferencia) els.dataReferencia.valueAsDate = new Date();

    // Carrega dados iniciais
    carregarOpcoesVincular();
    carregarNotas();

    els.form.addEventListener('submit', handleSalvarNota);
});

// 1. Popula os Dropdowns (Turmas e Alunos) usando Datalist
async function carregarOpcoesVincular() {
    try {
        // Busca turmas e alunos em paralelo
        const [resTurmas, resAlunos] = await Promise.all([
            fetch('/api/turmas'),
            fetch('/api/alunos')
        ]);

        const turmas = await resTurmas.json();
        const alunos = await resAlunos.json();

        // Preenche Datalist Turma
        turmas.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.nome;     // O que aparece na busca
            opt.dataset.id = t.id;  // O ID real guardado "escondido"
            els.listTurmas.appendChild(opt);
        });

        // Preenche Datalist Aluno (Em ordem alfabética)
        alunos.sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));
        alunos.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.nome_completo; // O que aparece na busca
            opt.dataset.id = a.id;       // O ID real guardado "escondido"
            els.listAlunos.appendChild(opt);
        });

    } catch (error) {
        console.error('Erro ao carregar opções:', error);
    }
}

// Helper para achar o ID oculto baseado no texto que o usuário digitou
function getIdFromDatalist(inputValue, datalistElement) {
    if (!inputValue) return null;
    const options = Array.from(datalistElement.options);
    const option = options.find(opt => opt.value === inputValue);
    return option ? option.dataset.id : null;
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

            // Formata data de registro
            const dataRegistro = new Date(nota.created_at).toLocaleDateString('pt-BR');
            const horaRegistro = new Date(nota.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            
            // Formata a data de referência (Ocorrência)
            const dataOcorrencia = nota.data_referencia 
                ? nota.data_referencia.split('-').reverse().join('/')
                : dataRegistro;

            // Monta as tags de vínculo se existirem
            let tagsHTML = '';
            if (nota.turmas) tagsHTML += `<span class="tag">Turma: ${nota.turmas.nome}</span>`;
            if (nota.alunos) tagsHTML += `<span class="tag">Aluno: ${nota.alunos.nome_completo}</span>`;

            div.innerHTML = `
                <div class="nota-header">
                    <div>
                        <h3 class="nota-titulo">${nota.titulo}</h3>
                        <span class="nota-data">
                            <strong>Ocorrência: ${dataOcorrencia}</strong> <br>
                            <small>Registrado em: ${dataRegistro} às ${horaRegistro}</small>
                        </span>
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

    // Encontra os UUIDs baseados nos textos dos inputs
    const turmaId = getIdFromDatalist(els.inputTurma.value, els.listTurmas);
    const alunoId = getIdFromDatalist(els.inputAluno.value, els.listAlunos);

    const dados = {
        titulo: els.titulo.value,
        data_referencia: els.dataReferencia.value, // <-- NOVO
        conteudo: els.conteudo.value,
        turma_id: turmaId,
        aluno_id: alunoId
    };

    try {
        const res = await fetch('/api/diario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        if (!res.ok) throw new Error('Erro ao salvar. Verifique se digitou nomes válidos da lista.');

        // Limpa form e recarrega
        els.form.reset();
        if (els.dataReferencia) els.dataReferencia.valueAsDate = new Date(); // Reseta a data pra hoje
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