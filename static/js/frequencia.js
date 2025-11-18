// static/js/frequencia.js

const TURMA_ID = window.location.pathname.split('/')[2];
let els = {};

document.addEventListener('DOMContentLoaded', () => {
    els = {
        picker: document.getElementById('data-picker'),
        listaChamada: document.getElementById('lista-chamada'),
        titulo: document.getElementById('nome-turma'),
        linkExportar: document.getElementById('link-exportar'),
        listaDatas: document.getElementById('lista-datas-anteriores'),
        linkVoltar: document.getElementById('link-voltar'),
        statusConexao: document.createElement('div') // Novo indicador
    };

    // Configura indicador de conexão
    els.statusConexao.style.cssText = "padding: 5px; text-align: center; display: none; margin-bottom: 10px; border-radius: 4px;";
    document.querySelector('.chamada-container').prepend(els.statusConexao);
    
    // Monitora conexão
    window.addEventListener('online', syncPendentes);
    window.addEventListener('offline', atualizarStatusConexao);
    atualizarStatusConexao();

    els.linkVoltar.href = `/turma/${TURMA_ID}`;
    els.picker.valueAsDate = new Date();

    carregarDetalhesTurma();
    carregarChamada();
    carregarHistoricoDatas();
    atualizarLinkExportar();

    els.picker.addEventListener('change', () => {
        carregarChamada();
        atualizarLinkExportar();
    });

    // Tenta sincronizar ao abrir a página
    if (navigator.onLine) syncPendentes();
});

function atualizarStatusConexao() {
    if (navigator.onLine) {
        els.statusConexao.textContent = "🟢 Online - Sincronizando...";
        els.statusConexao.style.backgroundColor = "#d4edda";
        els.statusConexao.style.color = "#155724";
        setTimeout(() => { els.statusConexao.style.display = 'none'; }, 3000);
    } else {
        els.statusConexao.textContent = "🔴 Offline - Salvando no celular";
        els.statusConexao.style.display = 'block';
        els.statusConexao.style.backgroundColor = "#f8d7da";
        els.statusConexao.style.color = "#721c24";
    }
}

function atualizarLinkExportar() {
    const dataSelecionada = els.picker.value;
    if (dataSelecionada) {
        els.linkExportar.href = `/api/exportar/turma/${TURMA_ID}/frequencia?data=${dataSelecionada}`;
    }
}

// --- SINCRONIZAÇÃO ---
async function syncPendentes() {
    if (!navigator.onLine) return;
    
    // Precisa do db.js carregado
    if (typeof getPendentes !== 'function') return;

    const pendentes = await getPendentes();
    if (pendentes.length === 0) return;

    console.log(`Sincronizando ${pendentes.length} registros...`);
    els.statusConexao.style.display = 'block';
    els.statusConexao.textContent = `🔄 Sincronizando ${pendentes.length} registros...`;

    for (const item of pendentes) {
        try {
            await fetch('/api/frequencia', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item.dados)
            });
            // Se sucesso, remove do local
            await limparPendentes(item.id);
        } catch (e) {
            console.error("Erro ao sincronizar item", item, e);
        }
    }
    
    atualizarStatusConexao();
    // Recarrega a lista para confirmar os dados vindos do servidor
    carregarChamada();
}

// --- API CALLS ---
async function carregarDetalhesTurma() {
    try {
        const response = await fetch(`/api/turmas/${TURMA_ID}`);
        if(!response.ok) throw new Error('Offline');
        const turma = await response.json();
        els.titulo.textContent = `Frequência: ${turma.nome}`;
    } catch (error) {
        console.log('Modo offline: Título mantido');
    }
}

async function carregarHistoricoDatas() {
    try {
        const response = await fetch(`/api/turma/${TURMA_ID}/datas_chamada`);
        if(!response.ok) throw new Error('Offline');
        const datas = await response.json();
        els.listaDatas.innerHTML = '';
        datas.forEach(item => {
            const tag = document.createElement('div');
            tag.className = 'tag-data';
            const dataFormatada = item.data_chamada.split('-').reverse().join('/');
            tag.textContent = dataFormatada;
            tag.onclick = () => {
                els.picker.value = item.data_chamada;
                carregarChamada();
                atualizarLinkExportar();
            };
            els.listaDatas.appendChild(tag);
        });
    } catch (error) {
        els.listaDatas.innerHTML = '<p>Histórico indisponível offline.</p>';
    }
}

async function carregarChamada() {
    els.listaChamada.innerHTML = '<li>Carregando...</li>';
    const dataSelecionada = els.picker.value;

    try {
        const [respAlunos, respFreq] = await Promise.all([
            fetch(`/api/turmas/${TURMA_ID}/alunos_vinculados`),
            fetch(`/api/frequencia?turma_id=${TURMA_ID}&data=${dataSelecionada}`)
        ]);

        const alunosVinculados = await respAlunos.json();
        // Se estiver offline, o respFreq pode falhar ou vir vazio, tratamos isso
        let frequenciaMap = new Map();
        
        try {
            const registrosFrequencia = await respFreq.json();
            registrosFrequencia.forEach(reg => frequenciaMap.set(reg.aluno_id, reg.presente));
        } catch(e) { console.log("Sem dados online de freq."); }

        els.listaChamada.innerHTML = '';

        if (alunosVinculados.length === 0) {
            els.listaChamada.innerHTML = '<li>Nenhum aluno vinculado.</li>';
            return;
        }

        alunosVinculados.forEach(item => {
            const aluno = item.alunos;
            const estaPresente = frequenciaMap.get(aluno.id) || false;

            const li = document.createElement('li');
            li.className = 'aluno-item';
            
            li.innerHTML = `
                <span class="aluno-nome">${aluno.nome_completo}</span>
                <div class="botoes-frequencia">
                    <button 
                        class="presente ${estaPresente ? 'active' : ''}" 
                        onclick="marcarPresenca(this, '${aluno.id}', true)">P</button>
                    <button 
                        class="ausente ${!estaPresente ? 'active' : ''}" 
                        onclick="marcarPresenca(this, '${aluno.id}', false)">F</button>
                </div>
            `;
            els.listaChamada.appendChild(li);
        });

    } catch (error) {
        console.error('Erro:', error);
        els.listaChamada.innerHTML = '<li>Você está offline e a lista de alunos não está em cache. Conecte-se uma vez para carregar.</li>';
    }
}

// --- AÇÕES ---
async function marcarPresenca(botaoClicado, alunoId, statusPresenca) {
    // 1. UI Optimista (Muda a cor na hora)
    const pai = botaoClicado.parentNode;
    pai.querySelector('.presente').classList.remove('active');
    pai.querySelector('.ausente').classList.remove('active');

    if (statusPresenca) pai.querySelector('.presente').classList.add('active');
    else pai.querySelector('.ausente').classList.add('active');

    const data = els.picker.value;
    const payload = {
        turma_id: TURMA_ID,
        aluno_id: alunoId,
        data: data,
        presente: statusPresenca
    };

    // 2. Tenta enviar
    if (navigator.onLine) {
        try {
            await fetch('/api/frequencia', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            // Sucesso Online
        } catch (error) {
            // Falhou online, salva offline
            console.warn("Falha online, salvando offline...");
            await salvarOffline({ dados: payload });
            atualizarStatusConexao(); // Mostra aviso vermelho
        }
    } else {
        // Já está offline, salva direto
        await salvarOffline({ dados: payload });
        atualizarStatusConexao(); // Mostra aviso vermelho
    }
}