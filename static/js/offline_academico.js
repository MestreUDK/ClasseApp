/* Consulta e edição de notas existentes e anotações do diário exclusivamente
 * no IndexedDB. Esta página não consulta APIs e não mantém tokens de sessão.
 */
(() => {
    'use strict';
    const area = document.getElementById('offline-academico');
    if (!area) return;
    let escolhaAvaliacao = '';

    const elemento = (tag, texto, classe = '') => {
        const no = document.createElement(tag);
        if (texto !== undefined) no.textContent = String(texto);
        if (classe) no.className = classe;
        return no;
    };
    const campo = (titulo, valor, tipo = 'text') => {
        const label = elemento('label');
        label.append(elemento('span', titulo));
        const input = document.createElement(tipo === 'textarea' ? 'textarea' : 'input');
        if (tipo !== 'textarea') input.type = tipo;
        input.value = valor == null ? '' : String(valor);
        label.append(input);
        return {label, input};
    };
    const idDeEdicao = () => (crypto.randomUUID ? crypto.randomUUID() :
        `${Date.now()}-${Math.random()}`);
    const nomeAluno = (snapshot, id) => snapshot.alunos.find(a => String(a.id) === String(id))?.nome_completo || 'Aluno';
    const nomeTurma = (snapshot, id) => snapshot.turmas.find(t => String(t.id) === String(id))?.nome || 'Turma';
    const chaveNota = (conta, avId, alunoId) => `${conta}:nota:${avId}:${alunoId}`;
    const chaveDiario = (conta, id) => `${conta}:diario:${id}`;

    async function desenharNotas(snapshot, conta, fila) {
        const avaliacoes = snapshot.avaliacoes || [];
        if (!Array.isArray(snapshot.notas) || !avaliacoes.length) {
            area.append(elemento('p', 'Esta cópia não contém avaliações e notas. Conecte-se e use Meu Perfil → Baixar da nuvem.', 'warning'));
            return;
        }
        const escolha = elemento('div', '', 'academico-selecao');
        escolha.append(elemento('h3', 'Lançamento local de notas'));
        const select = document.createElement('select');
        for (const av of avaliacoes) {
            const op = document.createElement('option');
            op.value = av.id;
            op.textContent = `${nomeTurma(snapshot, av.turma_id)} — ${av.nome} (${av.categoria || 'avaliação'})`;
            select.append(op);
        }
        if (avaliacoes.some(a => a.id === escolhaAvaliacao)) select.value = escolhaAvaliacao;
        else escolhaAvaliacao = select.value;
        escolha.append(select);
        area.append(escolha);
        const lista = elemento('div', '', 'items');
        area.append(lista);
        const atualizarLista = () => {
            escolhaAvaliacao = select.value;
            lista.replaceChildren();
            const av = avaliacoes.find(item => item.id === select.value);
            const alunos = snapshot.notas.filter(item => String(item.avaliacao_id) === String(av.id))
                .sort((a,b) => nomeAluno(snapshot,a.aluno_id).localeCompare(nomeAluno(snapshot,b.aluno_id),'pt-BR'));
            for (const nota of alunos) {
                const pendencia = fila.find(item => item.chave === chaveNota(conta, av.id, nota.aluno_id));
                const valor = pendencia ? pendencia.dados.valor : nota.valor;
                const card = elemento('article', '', 'item');
                card.append(elemento('h3', nomeAluno(snapshot, nota.aluno_id)));
                card.append(elemento('p', `Nota: ${valor == null ? 'Não lançada' : valor} / ${av.nota_maxima} · Revisão base: ${nota.revision ?? 0}`, 'meta'));
                if (pendencia) card.append(elemento('p', pendencia.estado === 'conflito' ?
                    'Conflito: resolver online no Perfil.' : 'Alteração ainda não enviada', 'pending'));
                const editar = elemento('button', 'Editar nota no dispositivo');
                editar.type = 'button';
                editar.addEventListener('click', () => {
                    card.querySelector('.editor')?.remove();
                    const editor = elemento('div', '', 'editor');
                    const form = document.createElement('form');
                    const numero = campo('Nota (deixe vazio para não lançada)', valor, 'number');
                    numero.input.min = '0'; numero.input.max = String(av.nota_maxima);
                    numero.input.step = '0.01';
                    form.append(numero.label);
                    let destino = null;
                    if (av.categoria === 'recuperacao' && av.recuperacao_modo === 'manual') {
                        destino = document.createElement('select');
                        const opVazio = new Option('Sem destino selecionado', '');
                        destino.append(opVazio);
                        const par = av.periodo_numero === 1 ? [1, 2] : [3, 4];
                        for (const p of par) destino.append(new Option(`${p}ª avaliação`, String(p)));
                        destino.value = String(pendencia?.dados.recupera_periodo ?? nota.recupera_periodo ?? '');
                        const rotulo = elemento('label');
                        rotulo.append(elemento('span', 'Avaliação a recuperar'), destino);
                        form.append(rotulo);
                    }
                    const salvar = elemento('button', 'Salvar no dispositivo');
                    salvar.type = 'submit'; form.append(salvar);
                    form.addEventListener('submit', async ev => {
                        ev.preventDefault();
                        const texto = numero.input.value.trim();
                        const n = texto === '' ? null : Number(texto);
                        if (n !== null && (!Number.isFinite(n) || n < 0 || n > Number(av.nota_maxima))) {
                            window.alert('Nota fora dos limites dessa avaliação.'); return;
                        }
                        salvar.disabled = true;
                        try {
                            const antigos = await listarEdicoesAcademicas(conta);
                            const anterior = antigos.find(item => item.chave === chaveNota(conta,av.id,nota.aluno_id));
                            await salvarEdicaoAcademica({
                                chave: chaveNota(conta,av.id,nota.aluno_id), usuario_id: conta,
                                tipo: 'nota', avaliacao_id: av.id, aluno_id: nota.aluno_id,
                                expected_revision: anterior?.expected_revision ?? nota.revision ?? 0,
                                dados: {valor:n, ...(destino ? {recupera_periodo: destino.value ? Number(destino.value) : null} : {})},
                                edicao_id: idDeEdicao(), alterado_localmente_em: new Date().toISOString(),
                                estado: anterior?.estado === 'conflito' ? 'conflito' : 'pendente'
                            });
                            area.dispatchEvent(new CustomEvent('academico-offline:gravado', {bubbles:true}));
                            await window.ClasseAcademicoOffline.render('notas', {snapshot, conta});
                        } catch (erro) {
                            console.error(erro);
                            window.alert('Falha ao gravar a nota no dispositivo.');
                            salvar.disabled = false;
                        }
                    });
                    editor.append(form); card.append(editor);
                });
                card.append(editar); lista.append(card);
            }
            if (!alunos.length) lista.append(elemento('p', 'Nenhum aluno encontrado nesta avaliação.'));
        };
        select.addEventListener('change', atualizarLista);
        atualizarLista();
    }

    // Criações e exclusões compartilham a mesma chave do diário. Assim,
    // salvar duas vezes o mesmo rascunho não gera dois registros na nuvem.
    async function desenharDiario(snapshot, conta, fila) {
        if (!Array.isArray(snapshot.diario)) {
            area.append(elemento('p', 'Esta cópia não contém o diário. Conecte-se e use Meu Perfil → Baixar da nuvem.', 'warning'));
            return;
        }
        area.append(elemento('h3', 'Diário de Bordo — sem conexão'));
        area.append(elemento('p', 'Crie, edite ou marque anotações para exclusão. As operações só serão realizadas na nuvem após confirmar o envio no Perfil.', 'muted'));

        const criacao = elemento('div', '', 'academico-selecao');
        const novo = elemento('button', 'Nova anotação offline'); novo.type = 'button';
        criacao.append(novo); area.append(criacao);
        novo.addEventListener('click', () => {
            criacao.querySelector('.editor')?.remove();
            const editor = elemento('div', '', 'editor');
            const form = document.createElement('form');
            const titulo = campo('Título', ''); titulo.input.required = true;
            const data = campo('Data de ocorrência', new Date().toISOString().slice(0, 10), 'date');
            data.input.required = true;
            const conteudo = campo('Conteúdo', '', 'textarea');
            const turma = document.createElement('select');
            turma.append(new Option('Sem turma vinculada', ''));
            snapshot.turmas.forEach(t => turma.append(new Option(t.nome, String(t.id))));
            const turmaRotulo = elemento('label'); turmaRotulo.append(elemento('span', 'Turma'), turma);
            const aluno = document.createElement('select');
            aluno.append(new Option('Sem aluno vinculado', ''));
            snapshot.alunos.forEach(a => aluno.append(new Option(a.nome_completo, String(a.id))));
            const alunoRotulo = elemento('label'); alunoRotulo.append(elemento('span', 'Aluno'), aluno);
            const salvar = elemento('button', 'Salvar anotação no dispositivo'); salvar.type = 'submit';
            const cancelar = elemento('button', 'Cancelar'); cancelar.type = 'button';
            cancelar.addEventListener('click', () => editor.remove());
            form.append(titulo.label, data.label, conteudo.label, turmaRotulo, alunoRotulo, salvar, cancelar);
            form.addEventListener('submit', async ev => {
                ev.preventDefault();
                if (typeof crypto.randomUUID !== 'function') {
                    window.alert('Este navegador não oferece identificadores seguros. Atualize-o antes de criar anotações offline.');
                    return;
                }
                salvar.disabled = true;
                try {
                    const id = crypto.randomUUID();
                    await salvarEdicaoAcademica({
                        chave: chaveDiario(conta, id), usuario_id: conta, tipo: 'diario_criar', id,
                        expected_revision: 0,
                        dados: {titulo: titulo.input.value.trim(), conteudo: conteudo.input.value,
                            data_referencia: data.input.value, turma_id: turma.value || null,
                            aluno_id: aluno.value || null},
                        edicao_id: idDeEdicao(), alterado_localmente_em: new Date().toISOString(),
                        estado: 'pendente'
                    });
                    area.dispatchEvent(new CustomEvent('academico-offline:gravado', {bubbles:true}));
                    await window.ClasseAcademicoOffline.render('diario', {snapshot, conta});
                } catch (erro) {
                    console.error(erro);
                    window.alert('Falha ao criar anotação local. Nenhum dado foi enviado à nuvem.');
                    salvar.disabled = false;
                }
            });
            editor.append(form); criacao.append(editor);
        });

        const lista = elemento('div', '', 'items'); area.append(lista);
        const pendentesDiario = fila.filter(item => item.tipo.startsWith('diario'));
        const idsBaixados = new Set(snapshot.diario.map(item => String(item.id)));
        const criados = pendentesDiario.filter(item =>
            (item.tipo === 'diario_criar' || (item.tipo === 'diario_excluir' && item.origem_local)) &&
            !idsBaixados.has(String(item.id)))
            .map(item => ({id: item.id,
                ...(item.tipo === 'diario_criar' ? item.dados : item.restaurar_pendencia?.dados || item.dados),
                revision: 0, _criado: item.tipo === 'diario_criar'}));
        const registros = [...snapshot.diario, ...criados].sort((a,b) =>
            String(b.data_referencia || '').localeCompare(String(a.data_referencia || '')));
        for (const registro of registros) {
            const chave = chaveDiario(conta, registro.id);
            const pendencia = pendentesDiario.find(item => item.chave === chave);
            const atual = pendencia?.tipo === 'diario_criar' || pendencia?.tipo === 'diario' ?
                {...registro, ...pendencia.dados} : registro;
            const card = elemento('article', '', 'item');
            if (pendencia?.tipo === 'diario_excluir') {
                card.append(elemento('h3', registro.titulo));
                card.append(elemento('p', 'Exclusão pendente de confirmação online.', 'pending'));
                const desfazer = elemento('button', 'Desfazer exclusão local'); desfazer.type = 'button';
                desfazer.addEventListener('click', async () => {
                    if (await restaurarEdicaoAcademicaSeIgual(pendencia, pendencia.restaurar_pendencia || null)) {
                        area.dispatchEvent(new CustomEvent('academico-offline:gravado', {bubbles:true}));
                        await window.ClasseAcademicoOffline.render('diario', {snapshot,conta});
                    } else window.alert('A pendência mudou. Atualize os dados locais.');
                });
                card.append(desfazer); lista.append(card); continue;
            }
            card.append(elemento('h3', atual.titulo));
            card.append(elemento('p', `${atual.data_referencia || 'Sem data'} · ${atual.turma_id ? nomeTurma(snapshot, atual.turma_id) : 'Sem turma'}${registro._criado ? ' · Nova anotação' : ''}`, 'meta'));
            card.append(elemento('p', (atual.conteudo || '').slice(0, 180)));
            if (pendencia) card.append(elemento('p', pendencia.estado === 'conflito' ?
                'Conflito: resolver online no Perfil.' : 'Operação ainda não enviada', 'pending'));
            const editar = elemento('button', 'Editar no dispositivo'); editar.type = 'button';
            editar.addEventListener('click', () => {
                card.querySelector('.editor')?.remove();
                const form = document.createElement('form');
                const editor = elemento('div', '', 'editor');
                const titulo = campo('Título', atual.titulo); titulo.input.required = true;
                const data = campo('Data de ocorrência', atual.data_referencia, 'date'); data.input.required = true;
                const conteudo = campo('Conteúdo', atual.conteudo || '', 'textarea');
                form.append(titulo.label, data.label, conteudo.label);
                const salvar = elemento('button', 'Salvar no dispositivo'); salvar.type='submit'; form.append(salvar);
                form.addEventListener('submit', async ev => {
                    ev.preventDefault();
                    if (!titulo.input.value.trim() || !data.input.value) return;
                    if (!registro._criado && (!Number.isInteger(registro.revision) || registro.revision < 1)) {
                        window.alert('Anotação sem revisão válida. Baixe a cópia novamente.'); return;
                    }
                    salvar.disabled = true;
                    try {
                        const anteriores = await listarEdicoesAcademicas(conta);
                        const anterior = anteriores.find(item => item.chave === chave);
                        await salvarEdicaoAcademica({
                            chave, usuario_id:conta,
                            tipo: registro._criado ? 'diario_criar' : 'diario', id:registro.id,
                            expected_revision: registro._criado ? 0 : (anterior?.expected_revision ?? registro.revision),
                            dados: {titulo: titulo.input.value.trim(), conteudo: conteudo.input.value,
                                data_referencia: data.input.value, turma_id: atual.turma_id || null,
                                aluno_id: atual.aluno_id || null},
                            edicao_id: idDeEdicao(), alterado_localmente_em:new Date().toISOString(),
                            estado: anterior?.estado === 'conflito' ? 'conflito' : 'pendente'
                        });
                        area.dispatchEvent(new CustomEvent('academico-offline:gravado', {bubbles:true}));
                        await window.ClasseAcademicoOffline.render('diario', {snapshot,conta});
                    } catch (erro) {
                        console.error(erro); window.alert('Falha ao gravar anotação offline.'); salvar.disabled=false;
                    }
                });
                editor.append(form);card.append(editor);
            });
            card.append(editar);
            const excluir = elemento('button', 'Excluir no dispositivo'); excluir.type = 'button';
            excluir.addEventListener('click', async () => {
                if (!confirm('Marcar esta anotação para exclusão quando sincronizar?')) return;
                excluir.disabled = true;
                try {
                    const anteriores = await listarEdicoesAcademicas(conta);
                    const anterior = anteriores.find(item => item.chave === chave);
                    // Uma anotação criada offline pode ter sido aceita pelo servidor
                    // durante uma tentativa cujo retorno de rede se perdeu.
                    // Conserva uma exclusão pendente para limpar esse possível envio.
                    await salvarEdicaoAcademica({
                        chave, usuario_id: conta, tipo: 'diario_excluir', id:registro.id,
                        expected_revision: registro._criado ? 1 : (anterior?.expected_revision ?? registro.revision),
                        origem_local: Boolean(registro._criado),
                        restaurar_pendencia: anterior || null,
                        dados: {titulo:atual.titulo},
                        edicao_id: idDeEdicao(), alterado_localmente_em:new Date().toISOString(),
                        estado: anterior?.estado === 'conflito' ? 'conflito' : 'pendente'
                    });
                    area.dispatchEvent(new CustomEvent('academico-offline:gravado', {bubbles:true}));
                    await window.ClasseAcademicoOffline.render('diario', {snapshot,conta});
                } catch (erro) {console.error(erro);window.alert('Falha ao marcar exclusão.');excluir.disabled=false;}
            });
            card.append(excluir); lista.append(card);
        }
        if (!registros.length) lista.append(elemento('p', 'Não há anotações nesta cópia. Crie uma acima.'));
    }

    window.ClasseAcademicoOffline = {
        async render(modo, {snapshot, conta}) {
            if (!snapshot || !conta || !['notas','diario'].includes(modo)) return;
            area.replaceChildren(); area.hidden = false;
            try {
                const pendentes = await listarEdicoesAcademicas(conta);
                if (modo === 'notas') await desenharNotas(snapshot,conta,pendentes);
                else await desenharDiario(snapshot,conta,pendentes);
            } catch (erro) {
                console.error(erro);
                area.append(elemento('p', 'Não foi possível abrir os dados acadêmicos locais.'));
            }
        }
    };
})();
