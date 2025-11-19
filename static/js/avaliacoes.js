// static/js/avaliacoes.js

const TURMA_ID = window.location.pathname.split('/')[2];
let els = {};

document.addEventListener('DOMContentLoaded', () => {
    els = {
        titulo: document.getElementById('titulo-pagina'),
        linkVoltar: document.getElementById('link-voltar'),
        form: document.getElementById('form-avaliacao'),
        inputNome: document.getElementById('nome'),
        inputData: document.getElementById('data'),
        inputMax: document.getElementById('nota_maxima'),
        lista: document.getElementById('lista-avaliacoes')
    };

    els.linkVoltar.href = `/turma/${TURMA_ID}`;
    
    carregarInfosTurma();
    carregarAvaliacoes();

    els.form.addEventListener('submit', handleCriar);
});

async function carregarInfosTurma() {
    try {
        const res = await fetch(`/api/turmas/${TURMA_ID}`);
        const turma = await res.json();
        els.titulo.textContent = `Avaliações: ${turma.nome}`;
    } catch (e) { console.error(e); }
}

async function carregarAvaliacoes() {
    try {
        const res = await fetch(`/api/turma/${TURMA_ID}/avaliacoes`);
        const avaliacoes = await res.json();

        els.lista.innerHTML = '';

        if (avaliacoes.length === 0) {
            els.lista.innerHTML = '<p style="color: #777;">Nenhuma avaliação cadastrada.</p>';
            return;
        }

        avaliacoes.forEach(av => {
            const div = document.createElement('div');
            div.className = 'dash-card'; // Reusando estilo de card
            div.style.display = 'block'; // Ajuste para layout vertical
            
            const dataFormatada = av.data ? av.data.split('-').reverse().join('/') : 'Sem data';

            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0; font-size: 1.2em; color: var(--primary);">${av.nome}</h3>
                    <span class="tag-data">${dataFormatada}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <p style="margin: 0; font-size: 0.9em; color: var(--text-sec);">Valor: <strong>${av.nota_maxima}</strong></p>
                        <p style="margin: 5px 0 0; font-size: 0.9em;">Média da Turma: <strong>${av.media_turma || '-'}</strong></p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <a href="/avaliacao/${av.id}/lancamento" class="botao-acao" style="font-size: 0.9em; padding: 8px 12px;">Lançar Notas</a>
                        <button onclick="deletarAvaliacao('${av.id}')" class="botao-delete" style="font-size: 0.9em; padding: 8px 12px;">Excluir</button>
                    </div>
                </div>
            `;
            els.lista.appendChild(div);
        });

    } catch (error) {
        console.error(error);
        els.lista.innerHTML = '<p>Erro ao carregar.</p>';
    }
}

async function handleCriar(e) {
    e.preventDefault();
    
    const dados = {
        turma_id: TURMA_ID,
        nome: els.inputNome.value,
        data: els.inputData.value,
        nota_maxima: els.inputMax.value
    };

    try {
        const res = await fetch('/api/avaliacoes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        
        if(!res.ok) throw new Error('Erro ao criar');
        
        els.form.reset();
        carregarAvaliacoes();

    } catch (error) {
        alert(error.message);
    }
}

window.deletarAvaliacao = async function(id) {
    if(!confirm('Tem certeza? As notas lançadas serão apagadas.')) return;
    try {
        await fetch(`/api/avaliacoes/${id}`, { method: 'DELETE' });
        carregarAvaliacoes();
    } catch (e) { alert('Erro ao excluir'); }
};
