/* Cópia local SOMENTE LEITURA de turmas e alunos da conta atual. */
(() => {
    'use strict';
    const painel = document.getElementById('dados-offline');
    if (!painel) return;
    const usuario = painel.dataset.userId;
    const el = id => document.getElementById(id);
    const estado = el('offline-estado');
    const resumo = el('offline-resumo');
    const area = el('offline-dados');
    const botoes = ['offline-baixar', 'offline-consultar', 'offline-exportar', 'offline-apagar'].map(el);
    let ocupado = false;

    function bloquear(valor) {
        ocupado = valor;
        botoes.forEach(botao => { botao.disabled = valor; });
    }

    async function atualizar() {
        const copia = await obterSnapshot(usuario);
        resumo.textContent = copia
            ? `Cópia de ${new Date(copia.salvo_em).toLocaleString('pt-BR')}: ${copia.turmas.length} turma(s) e ${copia.alunos.length} aluno(s).`
            : 'Nenhuma cópia local desta conta neste navegador.';
        return copia;
    }

    async function carregarApi(caminho) {
        const resposta = await fetch(caminho, {credentials: 'same-origin', cache: 'no-store'});
        if (!resposta.ok) throw new Error(`Falha HTTP ${resposta.status}`);
        const dados = await resposta.json();
        if (!Array.isArray(dados)) throw new Error('Resposta inesperada da API');
        return dados;
    }

    el('offline-baixar').addEventListener('click', async () => {
        if (ocupado) return;
        if (!navigator.onLine) { estado.textContent = 'Conecte-se à internet para baixar os dados.'; return; }
        if (!confirm('Salvar turmas e alunos neste navegador? Dados pessoais poderão permanecer no dispositivo.')) return;
        bloquear(true);
        estado.textContent = 'Baixando turmas e alunos...';
        try {
            // Não substituir uma cópia válida se qualquer requisição falhar.
            const [turmas, alunos] = await Promise.all([
                carregarApi('/api/turmas'), carregarApi('/api/alunos')
            ]);
            await salvarSnapshot({usuario_id: usuario, salvo_em: new Date().toISOString(), turmas, alunos});
            estado.textContent = 'Cópia de consulta salva neste dispositivo.';
            await atualizar();
        } catch (erro) {
            console.error(erro);
            estado.textContent = 'Não foi possível baixar todos os dados. Cópia anterior preservada.';
        } finally { bloquear(false); }
    });

    el('offline-consultar').addEventListener('click', async () => {
        try {
            const copia = await atualizar();
            area.replaceChildren();
            if (!copia) { estado.textContent = 'Baixe os dados primeiro.'; return; }
            for (const [titulo, itens, campo] of [
                ['Turmas', copia.turmas, 'nome'], ['Alunos', copia.alunos, 'nome_completo']
            ]) {
                const cabecalho = document.createElement('h4');
                cabecalho.textContent = `${titulo} (${itens.length})`;
                area.append(cabecalho);
                const lista = document.createElement('ul');
                for (const item of itens) {
                    const linha = document.createElement('li');
                    linha.textContent = item[campo] || '(Sem nome)';
                    lista.append(linha);
                }
                area.append(lista);
            }
            area.hidden = false;
            estado.textContent = 'Exibindo cópia local somente para consulta.';
        } catch (erro) { estado.textContent = 'Falha ao consultar a cópia local.'; }
    });

    el('offline-exportar').addEventListener('click', async () => {
        try {
            const copia = await obterSnapshot(usuario);
            if (!copia) { estado.textContent = 'Nenhuma cópia disponível para exportar.'; return; }
            if (!confirm('Exportar arquivo JSON com dados pessoais de alunos? Guarde-o em local seguro.')) return;
            const blob = new Blob([JSON.stringify(copia, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `classeapp-consulta-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
            estado.textContent = 'Arquivo de consulta exportado.';
        } catch (erro) { estado.textContent = 'Não foi possível exportar a cópia.'; }
    });

    el('offline-apagar').addEventListener('click', async () => {
        if (!confirm('Apagar a cópia de consulta desta conta neste navegador? Isso não remove dados da nuvem nem frequências pendentes.')) return;
        try {
            await apagarSnapshot(usuario);
            area.replaceChildren();
            area.hidden = true;
            await atualizar();
            estado.textContent = 'Cópia local apagada.';
        } catch (erro) { estado.textContent = 'Falha ao apagar cópia local.'; }
    });

    atualizar().catch(() => { estado.textContent = 'Armazenamento local indisponível.'; });
})();
