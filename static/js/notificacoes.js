/* Avisos da conta e fila offline. Não grava dados de alunos no localStorage. */
(() => {
    'use strict';
    const painel = document.getElementById('notificacoes');
    if (!painel) return;
    const usuario = painel.dataset.userId;
    const chave = `classeapp:notificacoes:dispensados:${usuario}`;
    const lista = document.getElementById('notificacoes-lista');
    const estado = document.getElementById('notificacoes-estado');
    const contador = document.getElementById('notificacoes-contador');
    const botao = document.getElementById('notificacoes-atualizar');

    function dispensados() {
        try { return JSON.parse(localStorage.getItem(chave) || '{}'); }
        catch (_) { return {}; }
    }

    async function carregar() {
        botao.disabled = true;
        estado.textContent = 'Atualizando avisos...';
        let avisos = [];
        let erroRemoto = false;
        try {
            const resposta = await fetch('/api/notificacoes/resumo', {cache: 'no-store'});
            if (!resposta.ok) throw new Error('Falha ao consultar aniversários');
            const dados = await resposta.json();
            avisos = Array.isArray(dados.alertas) ? dados.alertas : [];
        } catch (_) { erroRemoto = true; }

        try {
            const pendentes = await getPendentes();
            if (pendentes.length) {
                avisos.unshift({
                    id: 'frequencias-pendentes',
                    titulo: 'Sincronização pendente',
                    mensagem: `${pendentes.length} registro(s) de frequência aguardando envio neste dispositivo. Acesse Frequência quando estiver online para sincronizar.`,
                    permanente: true
                });
            }
        } catch (_) {
            avisos.unshift({id: 'fila-indisponivel', titulo: 'Armazenamento local',
                mensagem: 'Não foi possível verificar a fila offline neste dispositivo.', permanente: true});
        }
        const ocultos = dispensados();
        const visiveis = avisos.filter(aviso => aviso.permanente || !ocultos[aviso.id]);
        lista.replaceChildren();
        for (const aviso of visiveis) {
            const item = document.createElement('article');
            item.className = 'notificacoes-item';
            const titulo = document.createElement('strong');
            titulo.textContent = aviso.titulo;
            const mensagem = document.createElement('p');
            mensagem.textContent = aviso.mensagem;
            item.append(titulo, mensagem);
            if (!aviso.permanente) {
                const dispensar = document.createElement('button');
                dispensar.type = 'button';
                dispensar.textContent = 'Dispensar neste dispositivo';
                dispensar.addEventListener('click', () => {
                    const atual = dispensados();
                    atual[aviso.id] = true;
                    localStorage.setItem(chave, JSON.stringify(atual));
                    item.remove();
                    const total = lista.children.length;
                    contador.textContent = total;
                    contador.hidden = total === 0;
                });
                item.append(dispensar);
            }
            lista.append(item);
        }
        contador.textContent = visiveis.length;
        contador.hidden = visiveis.length === 0;
        estado.textContent = erroRemoto
            ? 'Aniversários indisponíveis sem conexão. Avisos locais exibidos abaixo.'
            : (visiveis.length ? `${visiveis.length} aviso(s) encontrado(s).` : 'Nenhum aviso no momento.');
        botao.disabled = false;
    }
    botao.addEventListener('click', carregar);
    carregar();
})();
