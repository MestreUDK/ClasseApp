/* Edição local explícita; nenhum envio automático e nenhuma sobrescrita forçada. */
(() => {
    'use strict';
    const painel = document.getElementById('dados-offline');
    if (!painel || painel.dataset.edicoesIniciadas) return;
    painel.dataset.edicoesIniciadas = '1';
    const usuario = painel.dataset.userId;
    const listar = document.getElementById('edicoes-listar');
    const enviar = document.getElementById('edicoes-enviar');
    const estado = document.getElementById('edicoes-estado');
    const area = document.getElementById('edicoes-lista');
    let ocupado = false;
    const campos = {
        turmas: [['nome', 'Nome'], ['descricao', 'Descrição']],
        alunos: [['nome_completo', 'Nome completo'], ['matricula', 'Matrícula'],
            ['telefone', 'Telefone'], ['email', 'Email'], ['data_nascimento', 'Nascimento (AAAA-MM-DD)'],
            ['detalhes', 'Detalhes']]
    };
    function chave(tipo, id) { return `${usuario}:${tipo}:${id}`; }
    function mensagem(texto) { estado.textContent = texto; }
    function bloqueio(valor) { ocupado = valor; listar.disabled = valor; enviar.disabled = valor; }
    function linha(texto, elemento = 'p') {
        const el = document.createElement(elemento); el.textContent = texto; return el;
    }
    async function desenhar() {
        const [copia, pendentes] = await Promise.all([obterSnapshot(usuario), listarEdicoesOffline(usuario)]);
        area.replaceChildren();
        if (!copia) { area.append(linha('Baixe uma cópia da nuvem antes de editar.')); return; }
        area.append(linha(`Edições pendentes: ${pendentes.length}`, 'h4'));
        for (const item of pendentes) {
            const rotulo = item.dados.nome_completo || item.dados.nome || item.id;
            area.append(linha(`${item.tipo === 'turmas' ? 'Turma' : 'Aluno'}: ${rotulo} — ${item.estado || 'aguardando envio'}`));
        }
        for (const tipo of ['turmas', 'alunos']) {
            area.append(linha(tipo === 'turmas' ? 'Turmas' : 'Alunos', 'h4'));
            const seletor = document.createElement('select');
            const inicial = document.createElement('option');
            inicial.value = ''; inicial.textContent = 'Selecione para editar'; seletor.append(inicial);
            for (const registro of copia[tipo]) {
                if (!registro.id) continue;
                const opcao = document.createElement('option');
                opcao.value = String(registro.id);
                opcao.textContent = registro.nome_completo || registro.nome || String(registro.id);
                seletor.append(opcao);
            }
            const formulario = document.createElement('form');
            formulario.style.margin = '12px 0';
            formulario.hidden = true;
            const controles = new Map();
            for (const [campo, rotulo] of campos[tipo]) {
                const etiqueta = document.createElement('label');
                etiqueta.textContent = rotulo + ': ';
                etiqueta.style.display = 'block';
                const input = document.createElement('input');
                input.name = campo; input.type = 'text'; input.style.width = '100%';
                etiqueta.append(input); formulario.append(etiqueta); controles.set(campo, input);
            }
            const botao = document.createElement('button');
            botao.type = 'submit'; botao.className = 'notificacoes-atualizar';
            botao.textContent = 'Salvar alteração no dispositivo'; formulario.append(botao);
            seletor.addEventListener('change', async () => {
                formulario.hidden = !seletor.value;
                if (!seletor.value) return;
                const registro = copia[tipo].find(item => String(item.id) === seletor.value);
                const pendente = (await listarEdicoesOffline(usuario))
                    .find(item => item.chave === chave(tipo, registro.id));
                for (const [campo, input] of controles) {
                    input.value = String((pendente?.dados || registro)[campo] ?? '');
                }
            });
            formulario.addEventListener('submit', async evento => {
                evento.preventDefault();
                if (ocupado) return;
                const registro = copia[tipo].find(item => String(item.id) === seletor.value);
                if (!registro || !Number.isInteger(registro.revision) || registro.revision < 1) {
                    mensagem('Este registro não tem revisão válida. Baixe uma cópia atualizada antes de editar.'); return;
                }
                const anteriores = await listarEdicoesOffline(usuario);
                const existente = anteriores.find(item => item.chave === chave(tipo, registro.id));
                const dados = Object.fromEntries([...controles].map(([campo, input]) => [campo, input.value.trim() || null]));
                if (!(dados.nome || dados.nome_completo)) { mensagem('O nome é obrigatório.'); return; }
                if (tipo === 'turmas') dados.disciplina_id = registro.disciplina_id || null;
                await salvarEdicaoOffline({
                    chave: chave(tipo, registro.id), usuario_id: usuario, tipo, id: registro.id,
                    expected_revision: existente?.expected_revision || registro.revision,
                    dados, alterado_localmente_em: new Date().toISOString(), estado: 'pendente'
                });
                mensagem('Edição salva somente neste dispositivo. Use Enviar edições pendentes quando estiver conectado.');
                await desenhar();
            });
            area.append(seletor, formulario);
        }
    }
    listar.addEventListener('click', async () => {
        if (ocupado) return; bloqueio(true);
        try { await desenhar(); mensagem('Cópia local carregada.'); }
        catch (erro) { console.error(erro); mensagem('Não foi possível acessar os dados locais.'); }
        finally { bloqueio(false); }
    });
    enviar.addEventListener('click', async () => {
        if (ocupado) return;
        if (!navigator.onLine) { mensagem('Conecte-se à internet para enviar.'); return; }
        if (!confirm('Enviar edições locais para a nuvem? Cada registro será verificado pela revisão original.')) return;
        bloqueio(true);
        let enviados = 0, conflitos = 0, falhas = 0;
        try {
            const pendentes = await listarEdicoesOffline(usuario);
            for (const item of pendentes) {
                if (item.estado === 'conflito') { conflitos++; continue; }
                try {
                    const resposta = await fetch(`/api/${item.tipo}/${encodeURIComponent(item.id)}`, {
                        method: 'PUT', credentials: 'same-origin', cache: 'no-store',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({...item.dados, expected_revision: item.expected_revision})
                    });
                    if (resposta.ok) { await removerEdicaoOffline(item.chave); enviados++; }
                    else if (resposta.status === 409 || resposta.status === 428) {
                        await salvarEdicaoOffline({...item, estado: 'conflito'}); conflitos++;
                    } else { falhas++; }
                } catch (erro) { console.error(erro); falhas++; }
            }
            mensagem(`Enviadas: ${enviados}. Conflitos preservados: ${conflitos}. Falhas: ${falhas}. ` +
                'Para conflitos, compare com a nuvem e revise os dados antes de decidir.');
            // Não baixar automaticamente: isso poderia ocultar diferenças não resolvidas.
            await desenhar();
        } catch (erro) { console.error(erro); mensagem('Erro ao consultar pendências.'); }
        finally { bloqueio(false); }
    });
})();
