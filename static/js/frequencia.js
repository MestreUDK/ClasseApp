// static/js/frequencia.js

const TURMA_ID = window.location.pathname.split('/')[2];
let els = {};
const revisoesFrequencia = new Map();

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
let sincronizacaoEmAndamento = false;
async function syncPendentes() {
    if (!navigator.onLine || sincronizacaoEmAndamento ||
        typeof getPendentes !== 'function') return;

    sincronizacaoEmAndamento = true;
    let falhas = 0;
    let enviados = 0;
    try {
        const pendentes = await getPendentes();
        const meusPendentes = pendentes.filter(item => item.usuario_id && item.usuario_id === window.CLASSE_USUARIO_ID && !item.conflito);
        if (!meusPendentes.length) return;

        els.statusConexao.style.display = 'block';
        els.statusConexao.textContent = `🔄 Enviando ${meusPendentes.length} registros...`;
        for (const item of meusPendentes) {
            try {
                const resposta = await fetch('/api/frequencia', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify(item.dados)
                });
                // Erros 401/403/500 não são confirmação de salvamento.
                if (!resposta.ok) {
                    if (resposta.status === 409 || resposta.status === 428) {
                        item.conflito = true;
                        item.erro_conflito = `HTTP ${resposta.status}`;
                        await atualizarPendente(item);
                    }
                    throw new Error(`Servidor retornou HTTP ${resposta.status}`);
                }
                const gravado = await resposta.json();
                revisoesFrequencia.set(`${item.dados.data}:${item.dados.aluno_id}`, gravado.revision);
                await limparPendentes(item.id);
                enviados += 1;
            } catch (erro) {
                falhas += 1;
                console.error('Registro mantido na fila local:', item.id, erro);
            }
        }
        if (falhas) {
            els.statusConexao.style.display = 'block';
            els.statusConexao.style.backgroundColor = '#fff3cd';
            els.statusConexao.style.color = '#664d03';
            els.statusConexao.textContent = `⚠️ ${falhas} registro(s) ainda pendente(s).`;
        } else {
            atualizarStatusConexao();
        }
        if (enviados) carregarChamada();
    } catch (erro) {
        console.error('Não foi possível consultar a fila local:', erro);
    } finally {
        sincronizacaoEmAndamento = false;
    }
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

        // ==========================================
        // --- NOVO: ORDENAÇÃO ALFABÉTICA AQUI ---
        // ==========================================
        alunosVinculados.sort((a, b) => a.alunos.nome_completo.localeCompare(b.alunos.nome_completo));

        // Se estiver offline, o respFreq pode falhar ou vir vazio, tratamos isso
        let frequenciaMap = new Map();
        revisoesFrequencia.clear();

        try {
            const registrosFrequencia = await respFreq.json();
            registrosFrequencia.forEach(reg => {
                frequenciaMap.set(reg.aluno_id, reg.presente);
                revisoesFrequencia.set(`${dataSelecionada}:${reg.aluno_id}`, reg.revision);
            });
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
        presente: statusPresenca,
        revision: revisoesFrequencia.get(`${data}:${alunoId}`) ?? 0
    };

    // 2. Tenta enviar
    if (navigator.onLine) {
        try {
            const resposta = await fetch('/api/frequencia', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });
            if (!resposta.ok) {
                const erro = await resposta.json().catch(() => ({}));
                if ([409, 428, 403, 401].includes(resposta.status)) {
                    alert(erro.error || 'Conflito de frequência. Recarregue a chamada.');
                    await carregarChamada();
                    return;
                }
                throw new Error(`HTTP ${resposta.status}`);
            }
            const gravado = await resposta.json();
            revisoesFrequencia.set(`${data}:${alunoId}`, gravado.revision);
            // Sucesso Online
        } catch (error) {
            // Falhou online, salva offline
            console.warn("Falha online, salvando offline...");
            await salvarOffline({ dados: payload, usuario_id: window.CLASSE_USUARIO_ID || null });
            atualizarStatusConexao(); // Mostra aviso vermelho
        }
    } else {
        // Já está offline, salva direto
        await salvarOffline({ dados: payload, usuario_id: window.CLASSE_USUARIO_ID || null });
        atualizarStatusConexao(); // Mostra aviso vermelho
    }
}

// ==========================================
// --- NOVO: AÇÃO DE APAGAR FREQUÊNCIA ---
// ==========================================
document.getElementById('btn-apagar-dia').addEventListener('click', async () => {
    const dataSelecionada = els.picker.value;
    if (!dataSelecionada) return;
    
    // Formata a data para exibir no alerta de forma mais amigável (DD/MM/AAAA)
    const dataFormatada = dataSelecionada.split('-').reverse().join('/');
    
    if (confirm(`Atenção! Deseja apagar toda a chamada do dia ${dataFormatada}?`)) {
        try {
            const res = await fetch('/api/frequencia/dia', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ turma_id: TURMA_ID, data: dataSelecionada })
            });
            
            if (res.ok) {
                alert('Frequência do dia apagada com sucesso.');
                // Recarrega a chamada e o histórico de datas para atualizar a tela
                carregarChamada(); 
                carregarHistoricoDatas();
            } else {
                const erro = await res.json();
                alert(`Erro ao apagar: ${erro.error || 'Desconhecido'}`);
            }
        } catch (e) {
            alert('Erro de conexão ao tentar apagar a frequência.');
            console.error(e);
        }
    }
});