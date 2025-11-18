// static/js/home.js

document.addEventListener('DOMContentLoaded', () => {
    carregarStats(); // Carrega os cards
    carregarTurmas(); // Carrega a lista (lógica antiga refatorada)
    
    // Configura o formulário de nova turma
    document.getElementById('form-turma').addEventListener('submit', handleCriarTurma);
});

// --- DASHBOARD STATS ---
async function carregarStats() {
    try {
        const res = await fetch('/api/dashboard/stats');
        const stats = await res.json();

        // Atualiza os números na tela com animação simples
        document.getElementById('total-alunos').textContent = stats.total_alunos;
        document.getElementById('total-turmas').textContent = stats.total_turmas;
        document.getElementById('media-freq').textContent = `${stats.media_presenca}%`;
        
    } catch (error) {
        console.error('Erro ao carregar stats:', error);
    }
}

// --- LISTA DE TURMAS (Lógica que já existia) ---
async function carregarTurmas() {
    try {
        const response = await fetch('/api/turmas');
        const turmas = await response.json();
        const listaDiv = document.getElementById('lista-turmas');
        listaDiv.innerHTML = ''; 
        
        if (turmas.length === 0) {
            listaDiv.innerHTML = '<p>Nenhuma turma cadastrada ainda.</p>';
            return;
        }
        
        turmas.forEach(turma => {
            const turmaDiv = document.createElement('div');
            turmaDiv.className = 'turma';
            turmaDiv.innerHTML = `
                <div>
                    <h3>${turma.nome}</h3>
                    <p>${turma.descricao || 'Sem descrição'}</p>
                </div>
                <div class="botoes-acao">
                    <a href="/turma/${turma.id}" class="botao-gerenciar">Gerenciar</a>
                    <a href="/turma/editar/${turma.id}" class="botao-edit">Editar</a>
                    <button class="botao-delete" onclick="handleDeleteTurma('${turma.id}')">Excluir</button>
                </div>
            `;
            listaDiv.appendChild(turmaDiv);
        });
    } catch (error) {
        console.error('Erro:', error);
        document.getElementById('lista-turmas').innerHTML = '<p>Erro ao carregar turmas.</p>';
    }
}

async function handleCriarTurma(event) {
    event.preventDefault(); 
    const nome = document.getElementById('nome').value;
    const descricao = document.getElementById('descricao').value;
    
    try {
        const response = await fetch('/api/turmas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: nome, descricao: descricao }),
        });
        
        if (!response.ok) throw new Error('Erro ao salvar turma');
        
        document.getElementById('form-turma').reset();
        carregarTurmas(); // Recarrega lista
        carregarStats(); // Recarrega os números do dashboard
        
    } catch (error) {
        alert('Não foi possível salvar a turma.');
    }
}

// Função global para o onclick do botão excluir
window.handleDeleteTurma = async function(turmaId) {
    if (!confirm('Tem certeza que deseja excluir esta turma? Isso apagará todos os dados dela.')) return;
    
    try {
        const response = await fetch(`/api/turmas/${turmaId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Erro ao excluir');
        
        carregarTurmas();
        carregarStats();
        
    } catch (error) {
        alert(error.message);
    }
};