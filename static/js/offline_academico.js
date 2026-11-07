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

    // Notas e avaliações de uma turma podem ser preparadas inteiramente offline.
    // Avaliações novas e notas ficam em pendências distintas. No envio, as
    // avaliações são criadas antes das notas que dependem de seus UUIDs.
    async function desenharNotas(snapshot, conta, fila) {
        const copias = Array.isArray(snapshot.avaliacoes) ? snapshot.avaliacoes : null;
        if (!copias || !Array.isArray(snapshot.notas) || !Array.isArray(snapshot.vinculos)) {
            area.append(elemento('p', 'Esta cópia não contém os vínculos, avaliações e notas necessários. Conecte-se e use Meu Perfil → Baixar da nuvem.', 'warning'));
            return;
        }
        const criacoes = fila.filter(item => item.tipo === 'avaliacao_criar');
        const exclusoes = fila.filter(item => item.tipo === 'avaliacao_excluir');
        const idsExcluidos = new Set(exclusoes.map(item => String(item.id)));
        const idsOriginais = new Set(copias.map(av => String(av.id)));
        const avaliacoes = [...copias, ...criacoes
            .filter(item => !idsOriginais.has(String(item.id)))
            .map(item => ({...item.dados, id:item.id, revision:0, _local:true}))]
            .filter(av => !idsExcluidos.has(String(av.id)));

        const criacao = elemento('div', '', 'academico-selecao');
        const btnNova = elemento('button', 'Nova avaliação offline');
        btnNova.type = 'button';
        criacao.append(btnNova);
        area.append(criacao);
        btnNova.addEventListener('click', () => {
            criacao.querySelector('.editor')?.remove();
            const editor = elemento('div', '', 'editor');
            const form = document.createElement('form');
            const nome = campo('Nome da avaliação', ''); nome.input.required = true;
            nome.input.maxLength = 200;
            const data = campo('Data da avaliação (opcional)', '', 'date');
            const notaMax = campo('Nota máxima', '10', 'number');
            notaMax.input.required = true; notaMax.input.min = '0.01'; notaMax.input.max = '100'; notaMax.input.step = '0.01';
            const peso = campo('Peso da avaliação', '2', 'number');
            peso.input.required = true; peso.input.min = '0.01'; peso.input.max = '100'; peso.input.step = '0.01';
            const turma = document.createElement('select');
            snapshot.turmas.forEach(t => turma.append(new Option(t.nome, String(t.id))));
            const turmaRotulo = elemento('label'); turmaRotulo.append(elemento('span', 'Turma'), turma);
            const tipo = document.createElement('select');
            [['avaliacao','Avaliação'],['bimestre','Bimestre'],['trimestre','Trimestre'],['semestre','Semestre']]
                .forEach(([k,v])=>tipo.append(new Option(v,k)));
            const tipoRotulo = elemento('label'); tipoRotulo.append(elemento('span','Tipo de período'),tipo);
            const numero = campo('Número do período (1 a 12)', '1', 'number');
            numero.input.min='1';numero.input.max='12';numero.input.step='1';numero.input.required=true;
            const categoria = document.createElement('select');
            [['prova','Prova'],['atividade','Atividade'],['trabalho','Trabalho'],
                ['participacao','Participação'],['recuperacao','Recuperação'],['outro','Outro']]
                .forEach(([k,v])=>categoria.append(new Option(v,k)));
            const catRotulo = elemento('label');catRotulo.append(elemento('span','Categoria'),categoria);
            const modo = document.createElement('select');
            [['automatico','Automático'],['manual','Manual']].forEach(([k,v])=>modo.append(new Option(v,k)));
            const modoRotulo=elemento('label');modoRotulo.append(elemento('span','Modo de recuperação'),modo);
            const aviso = elemento('p','No modo recuperação, use o período 1 para a 1ª recuperação ou 2 para a 2ª; não há peso próprio.','muted');
            const ajustar = () => {
                const recuperacao=categoria.value==='recuperacao';
                modoRotulo.hidden=!recuperacao;aviso.hidden=!recuperacao;
                peso.label.hidden=recuperacao;
                if (recuperacao) {tipo.value='avaliacao';peso.input.value='1';}
            };
            categoria.addEventListener('change',ajustar);
            form.append(nome.label,turmaRotulo,data.label,tipoRotulo,numero.label,
                catRotulo,notaMax.label,peso.label,modoRotulo,aviso);
            ajustar();
            const salvar = elemento('button','Salvar avaliação no dispositivo');salvar.type='submit';
            const cancelar=elemento('button','Cancelar');cancelar.type='button';
            cancelar.addEventListener('click',()=>editor.remove());
            form.append(salvar,cancelar);
            form.addEventListener('submit',async ev=>{
                ev.preventDefault();
                if(typeof crypto.randomUUID!=='function'){
                    alert('Atualize o navegador antes de criar avaliações offline.');return;
                }
                const valorMax=Number(notaMax.input.value);
                const valorPeso=Number(peso.input.value);
                const n=Number(numero.input.value);
                const recuperacao=categoria.value==='recuperacao';
                if(!nome.input.value.trim()||!turma.value||!Number.isInteger(n)||n<1||n>12||
                    !Number.isFinite(valorMax)||valorMax<=0||valorMax>100||
                    (!recuperacao&&(!Number.isFinite(valorPeso)||valorPeso<=0||valorPeso>100))){
                    alert('Revise os campos, períodos, nota máxima e peso.');return;
                }
                if(recuperacao && (tipo.value!=='avaliacao'||![1,2].includes(n))){
                    alert('Recuperações precisam ser do tipo Avaliação e período 1 ou 2.');return;
                }
                if(recuperacao && avaliacoes.some(av=>av.turma_id===turma.value &&
                    av.categoria==='recuperacao'&&av.periodo_tipo==='avaliacao' &&
                    Number(av.periodo_numero)===n)){
                    alert('Já existe uma recuperação desse período na turma.');return;
                }
                salvar.disabled=true;
                try {
                    const id=crypto.randomUUID();
                    const dados={nome:nome.input.value.trim(),turma_id:turma.value,
                        data:data.input.value||null,periodo_tipo:tipo.value,
                        periodo_numero:n,categoria:categoria.value,nota_maxima:valorMax,
                        peso:recuperacao?1:valorPeso,recuperacao_modo:recuperacao?modo.value:'automatico'};
                    await salvarEdicaoAcademica({chave:`${conta}:avaliacao:${id}`,usuario_id:conta,
                        tipo:'avaliacao_criar',id,expected_revision:0,dados,
                        edicao_id:idDeEdicao(),alterado_localmente_em:new Date().toISOString(),estado:'pendente'});
                    escolhaAvaliacao=id;
                    area.dispatchEvent(new CustomEvent('academico-offline:gravado',{bubbles:true}));
                    await window.ClasseAcademicoOffline.render('notas',{snapshot,conta});
                }catch(erro){console.error(erro);alert('Falha ao salvar avaliação offline.');salvar.disabled=false;}
            });
            editor.append(form);criacao.append(editor);
        });

        if (exclusoes.length) {
            const painel = elemento('div', '', 'academico-selecao');
            painel.append(elemento('h3', 'Avaliações com exclusão pendente'));
            for (const pendencia of exclusoes) {
                const card = elemento('article', '', 'item');
                card.append(elemento('strong', pendencia.dados.nome || pendencia.id));
                card.append(elemento('p', pendencia.estado === 'conflito' ?
                    'Conflito: resolva quando estiver online.' :
                    'Aguardando exclusão na nuvem.', 'pending'));
                const desfazer = elemento('button', 'Desfazer exclusão da avaliação');
                desfazer.type = 'button';
                desfazer.addEventListener('click', async () => {
                    desfazer.disabled = true;
                    try {
                        const ok = await restaurarEdicaoAcademicaSeIgual(
                            pendencia, pendencia.restaurar_pendencia || null);
                        if (!ok) throw new Error('A operação foi modificada em outra aba.');
                        area.dispatchEvent(new CustomEvent('academico-offline:gravado', {bubbles:true}));
                        await window.ClasseAcademicoOffline.render('notas', {snapshot, conta});
                    } catch (erro) { alert(erro.message); desfazer.disabled = false; }
                });
                card.append(desfazer); painel.append(card);
            }
            area.append(painel);
        }
        if(!avaliacoes.length){
            area.append(elemento('p','Não há avaliações disponíveis. Você pode criar uma acima, mesmo sem conexão.'));
            return;
        }
        const escolha=elemento('div','','academico-selecao');
        escolha.append(elemento('h3','Lançamento local de notas'));
        const select=document.createElement('select');
        for(const av of avaliacoes){
            select.append(new Option(`${nomeTurma(snapshot,av.turma_id)} — ${av.nome} (${av.categoria||'avaliação'})${av._local?' · nova':''}`,
                String(av.id)));
        }
        if(avaliacoes.some(a=>String(a.id)===String(escolhaAvaliacao)))select.value=escolhaAvaliacao;
        escolhaAvaliacao=select.value;
        escolha.append(select);
        const excluirAvaliacao = elemento('button', 'Marcar avaliação para exclusão');
        excluirAvaliacao.type = 'button';
        escolha.append(excluirAvaliacao);
        excluirAvaliacao.addEventListener('click', async () => {
            const av = avaliacoes.find(item => String(item.id) === String(select.value));
            if (!av) return;
            const novas = await listarEdicoesAcademicas(conta);
            const vinculadas = novas.filter(item =>
                ['nota', 'nota_excluir'].includes(item.tipo) &&
                String(item.avaliacao_id) === String(av.id));
            // Uma cópia pode trazer alunos sem lançamento (revision=0).
            // Só existem notas remotas quando a revisão é positiva ou há valor.
            const notasExistentes = snapshot.notas.filter(n =>
                String(n.avaliacao_id) === String(av.id) &&
                (Number(n.revision) > 0 || n.valor !== null && n.valor !== undefined));
            if (vinculadas.length || notasExistentes.length) {
                alert('Esta avaliação possui notas lançadas ou pendentes. Para proteger os dados, ' +
                    'exclua e sincronize os lançamentos primeiro; depois baixe a cópia atualizada.');
                return;
            }
            const anterior = novas.find(item =>
                item.tipo === 'avaliacao_criar' && String(item.id) === String(av.id));
            const local = Boolean(av._local);
            if (!local && (!Number.isInteger(av.revision) || av.revision < 1)) {
                alert('Avaliação sem revisão válida. Baixe uma cópia atualizada.'); return;
            }
            if (!confirm(`Excluir a avaliação "${av.nome}" quando sincronizar?`)) return;
            excluirAvaliacao.disabled = true;
            try {
                await salvarEdicaoAcademica({
                    chave: `${conta}:avaliacao:${av.id}`, usuario_id: conta,
                    tipo: 'avaliacao_excluir', id: av.id,
                    expected_revision: local ? 1 : av.revision,
                    origem_local: local,
                    restaurar_pendencia: anterior || null,
                    dados: {nome: av.nome, turma_id: av.turma_id},
                    edicao_id: idDeEdicao(), alterado_localmente_em: new Date().toISOString(),
                    estado: anterior?.estado === 'conflito' ? 'conflito' : 'pendente'
                });
                area.dispatchEvent(new CustomEvent('academico-offline:gravado', {bubbles:true}));
                await window.ClasseAcademicoOffline.render('notas', {snapshot, conta});
            } catch (erro) { console.error(erro); alert('Falha ao marcar exclusão local.');
                excluirAvaliacao.disabled = false; }
        });
        area.append(escolha);
        const lista=elemento('div','','items');area.append(lista);
        const atualizarLista=()=>{
            escolhaAvaliacao=select.value;lista.replaceChildren();
            const av=avaliacoes.find(item=>String(item.id)===String(select.value));
            if(!av)return;
            const criacaoPendente=criacoes.find(item=>String(item.id)===String(av.id));
            if(criacaoPendente){
                lista.append(elemento('p',criacaoPendente.estado==='conflito'?
                    'A criação desta avaliação apresenta conflito. Resolva no Perfil antes de enviar suas notas.':
                    'Avaliação ainda não enviada. Suas notas serão enviadas somente depois dela.','pending'));
            }
            const idsVinculados=snapshot.vinculos.filter(v=>String(v.turma_id)===String(av.turma_id))
                .map(v=>String(v.aluno_id));
            const idsUnicos=[...new Set(idsVinculados)];
            const notasBaixadas=new Map(snapshot.notas.filter(n=>String(n.avaliacao_id)===String(av.id))
                .map(n=>[String(n.aluno_id),n]));
            const alunos=idsUnicos.map(alunoId=>notasBaixadas.get(alunoId)||{
                aluno_id:alunoId,avaliacao_id:av.id,valor:null,revision:0,recupera_periodo:null
            }).sort((a,b)=>nomeAluno(snapshot,a.aluno_id).localeCompare(nomeAluno(snapshot,b.aluno_id),'pt-BR'));
            for(const nota of alunos){
                const pendencia=fila.find(item=>item.chave===chaveNota(conta,av.id,nota.aluno_id));
                const valor=pendencia && pendencia.tipo === 'nota' ?
                    pendencia.dados.valor : nota.valor;
                const card=elemento('article','','item');
                card.append(elemento('h3',nomeAluno(snapshot,nota.aluno_id)));
                if (pendencia?.tipo === 'nota_excluir') {
                    card.append(elemento('p', pendencia.estado === 'conflito' ?
                        'Exclusão com conflito: resolver no Perfil.' :
                        'Exclusão da nota pendente de sincronização.', 'pending'));
                    const desfazer = elemento('button', 'Desfazer exclusão da nota');
                    desfazer.type = 'button';
                    desfazer.addEventListener('click', async () => {
                        desfazer.disabled = true;
                        try {
                            const ok = await restaurarEdicaoAcademicaSeIgual(
                                pendencia, pendencia.restaurar_pendencia || null);
                            if (!ok) throw new Error('Esta operação mudou em outra aba.');
                            area.dispatchEvent(new CustomEvent('academico-offline:gravado', {bubbles:true}));
                            await window.ClasseAcademicoOffline.render('notas', {snapshot, conta});
                        } catch (erro) { alert(erro.message); desfazer.disabled = false; }
                    });
                    card.append(desfazer); lista.append(card); continue;
                }
                card.append(elemento('p',`Nota: ${valor==null?'Não lançada':valor} / ${av.nota_maxima} · Revisão base: ${nota.revision??0}`,'meta'));
                if(pendencia)card.append(elemento('p',pendencia.estado==='conflito'?
                    'Conflito: resolver online no Perfil.':'Alteração ainda não enviada','pending'));
                const editar=elemento('button',valor==null?'Lançar nota no dispositivo':'Editar nota no dispositivo');
                editar.type='button';
                editar.addEventListener('click',()=>{
                    card.querySelector('.editor')?.remove();
                    const editor=elemento('div','','editor');const form=document.createElement('form');
                    const numero=campo('Nota (vazio = sem lançamento)',valor,'number');
                    numero.input.min='0';numero.input.max=String(av.nota_maxima);numero.input.step='0.01';
                    form.append(numero.label);
                    let destino=null;
                    if(av.categoria==='recuperacao'&&av.recuperacao_modo==='manual'){
                        destino=document.createElement('select');
                        destino.append(new Option('Sem destino selecionado',''));
                        const par=Number(av.periodo_numero)===1?[1,2]:[3,4];
                        for(const p of par)destino.append(new Option(`${p}ª avaliação`,String(p)));
                        destino.value=String(pendencia?.dados.recupera_periodo??nota.recupera_periodo??'');
                        const rotulo=elemento('label');rotulo.append(elemento('span','Avaliação a recuperar'),destino);form.append(rotulo);
                        form.append(elemento('p','O destino será validado na nuvem: somente avaliações com nota abaixo de 5,0 são elegíveis.','muted'));
                    }
                    const salvar=elemento('button','Salvar no dispositivo');salvar.type='submit';form.append(salvar);
                    form.addEventListener('submit',async ev=>{
                        ev.preventDefault();
                        const valorDigitado=numero.input.value.trim();
                        const n=valorDigitado===''?null:Number(valorDigitado);
                        if(n!==null&&(!Number.isFinite(n)||n<0||n>Number(av.nota_maxima))){
                            alert('Nota fora dos limites dessa avaliação.');return;
                        }
                        salvar.disabled=true;
                        try{
                            const antigos=await listarEdicoesAcademicas(conta);
                            const anterior=antigos.find(item=>item.chave===chaveNota(conta,av.id,nota.aluno_id));
                            await salvarEdicaoAcademica({
                                chave:chaveNota(conta,av.id,nota.aluno_id),usuario_id:conta,
                                tipo:'nota',avaliacao_id:av.id,aluno_id:nota.aluno_id,
                                expected_revision:anterior?.expected_revision??nota.revision??0,
                                dados:{valor:n,...(destino?{recupera_periodo:destino.value?Number(destino.value):null}:{})},
                                edicao_id:idDeEdicao(),alterado_localmente_em:new Date().toISOString(),
                                estado:anterior?.estado==='conflito'?'conflito':'pendente'
                            });
                            area.dispatchEvent(new CustomEvent('academico-offline:gravado',{bubbles:true}));
                            await window.ClasseAcademicoOffline.render('notas',{snapshot,conta});
                        }catch(erro){console.error(erro);alert('Falha ao gravar nota offline.');salvar.disabled=false;}
                    });
                    editor.append(form);card.append(editor);
                });
                card.append(editar);
                if (Number(nota.revision) >= 1 || pendencia?.tipo === 'nota') {
                    const excluir = elemento('button', 'Marcar nota para exclusão');
                    excluir.type = 'button';
                    excluir.addEventListener('click', async () => {
                        if (!confirm(`Marcar a nota de ${nomeAluno(snapshot, nota.aluno_id)} ` +
                            'para exclusão quando sincronizar?')) return;
                        excluir.disabled = true;
                        try {
                            const anteriores = await listarEdicoesAcademicas(conta);
                            const anterior = anteriores.find(item => item.chave ===
                                chaveNota(conta, av.id, nota.aluno_id));
                            const origemLocal = Number(nota.revision || 0) === 0;
                            await salvarEdicaoAcademica({
                                chave: chaveNota(conta, av.id, nota.aluno_id), usuario_id: conta,
                                tipo: 'nota_excluir', avaliacao_id: av.id, aluno_id: nota.aluno_id,
                                nota_id: nota.nota_id || null,
                                expected_revision: origemLocal ? 1 :
                                    (anterior?.expected_revision ?? nota.revision),
                                origem_local: origemLocal,
                                restaurar_pendencia: anterior || null,
                                dados: {valor: valor},
                                edicao_id: idDeEdicao(),
                                alterado_localmente_em: new Date().toISOString(),
                                estado: anterior?.estado === 'conflito' ? 'conflito' : 'pendente'
                            });
                            area.dispatchEvent(new CustomEvent('academico-offline:gravado', {bubbles:true}));
                            await window.ClasseAcademicoOffline.render('notas', {snapshot, conta});
                        } catch (erro) { console.error(erro);
                            alert('Falha ao marcar exclusão da nota.'); excluir.disabled = false; }
                    });
                    card.append(excluir);
                }
                lista.append(card);
            }
            if(!alunos.length)lista.append(elemento('p','Nenhum aluno vinculado a esta turma na cópia local. Baixe uma cópia nova quando estiver online.'));
        };
        select.addEventListener('change',atualizarLista);atualizarLista();
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
