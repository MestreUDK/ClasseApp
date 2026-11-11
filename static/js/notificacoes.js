/* Central de aniversários e avisos do dispositivo; somente alunos da conta. */
(() => {
    'use strict';
    const painel = document.getElementById('notificacoes');
    if (!painel) return;
    const conta = String(painel.dataset.userId || '');
    const chaveOcultos = `classeapp:notificacoes:dispensados:${conta}`;
    const lista = document.getElementById('notificacoes-lista');
    const estado = document.getElementById('notificacoes-estado');
    const contador = document.getElementById('notificacoes-contador');
    const atualizar = document.getElementById('notificacoes-atualizar');
    const periodo = document.getElementById('notificacoes-periodo');
    const filaEstado = document.getElementById('notificacoes-fila-estado');
    let avisos = [];
    let totalComData = 0;
    let totalAlunos = 0;
    let falhaRemota = false;

    function dispensados() {
        try { return JSON.parse(localStorage.getItem(chaveOcultos) || '{}'); }
        catch (_) { return {}; }
    }
    function dispensar(id) {
        try {
            const atual = dispensados();
            atual[id] = true;
            localStorage.setItem(chaveOcultos, JSON.stringify(atual));
        } catch (_) { /* Navegador pode bloquear storage; aviso permanece nesta aba. */ }
        avisos = avisos.filter(a => a.id !== id);
        renderizar();
    }
    function elemento(tag, classe, texto) {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        if (texto !== undefined) el.textContent = texto;
        return el;
    }
    function renderizar() {
        const dias = Number(periodo.value);
        const visiveis = avisos.filter(a => Number(a.dias) <= dias && !dispensados()[a.id]);
        lista.replaceChildren();
        for (const aviso of visiveis) {
            const item = elemento('article', 'notificacoes-item');
            const titulo = elemento('strong', '', aviso.dias === 0
                ? `🎂 Hoje! ${aviso.nome}` : `🎂 ${aviso.nome} — ${aviso.data_formatada}`);
            const mensagem = elemento('p', '', aviso.mensagem);
            const botao = elemento('button', '', 'Dispensar este aniversário');
            botao.type = 'button';
            botao.addEventListener('click', () => dispensar(aviso.id));
            item.append(titulo, mensagem, botao);
            lista.append(item);
        }
        contador.textContent = String(visiveis.length);
        contador.hidden = !visiveis.length;
        if (falhaRemota) {
            estado.textContent = 'Não foi possível consultar os aniversários agora. Verifique a conexão e tente Atualizar.';
        } else if (visiveis.length) {
            estado.textContent = `${visiveis.length} aniversário(s) nos próximos ${dias} dias (incluindo hoje).`;
        } else if (!totalAlunos) {
            estado.textContent = 'Nenhum aluno cadastrado nesta conta.';
        } else if (!totalComData) {
            estado.textContent = 'Nenhuma data de nascimento cadastrada. Preencha o campo Nascimento no cadastro dos alunos para receber avisos.';
        } else {
            estado.textContent = `Nenhum aniversário nos próximos ${dias} dias. ${totalComData} aluno(s) com nascimento cadastrado.`;
        }
        window.ClasseNotificacoes?.registrar(avisos);
    }
    async function carregarFila() {
        if (!filaEstado) return;
        try {
            if (typeof getPendentes !== 'function') throw new Error('offline-indisponivel');
            const registros = await getPendentes();
            const pendentes = registros.filter(p => String(p.usuario_id) === conta);
            filaEstado.replaceChildren();
            if (!pendentes.length) {
                filaEstado.textContent = 'Nenhuma frequência pendente neste dispositivo.';
            } else {
                const texto = elemento('span', '', `${pendentes.length} registro(s) de frequência aguardando sincronização. `);
                const link = elemento('a', '', 'Abrir Central de Sincronização');
                link.href = '/sincronizacao';
                filaEstado.append(texto, link);
            }
        } catch (_) {
            filaEstado.replaceChildren();
            filaEstado.append('Não foi possível consultar a fila. Se você já configurou o acesso offline, ');
            const link = elemento('a', '', 'desbloqueie o cofre em Configurações');
            link.href = '/configuracoes#offline-acesso';
            filaEstado.append(link, '.');
        }
    }
    async function carregar() {
        atualizar.disabled = true;
        estado.textContent = 'Consultando aniversários...';
        falhaRemota = false;
        try {
            // A consulta de 30 dias permite alternar o filtro sem outra requisição.
            const resposta = await fetch('/api/notificacoes/resumo?dias=30', {
                cache: 'no-store', credentials: 'same-origin'
            });
            if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
            const dados = await resposta.json();
            avisos = Array.isArray(dados.alertas) ? dados.alertas : [];
            totalComData = Number(dados.alunos_com_nascimento) || 0;
            totalAlunos = Number(dados.total_alunos) || 0;
        } catch (_) {
            falhaRemota = true;
            avisos = [];
        } finally {
            renderizar();
            atualizar.disabled = false;
        }
        await carregarFila();
    }
    periodo.addEventListener('change', renderizar);
    atualizar.addEventListener('click', carregar);
    carregar();
})();
