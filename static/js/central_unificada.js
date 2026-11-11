/* Central integrada: comparação de todas as áreas e checkpoints locais.
 * Consultas explícitas, limitadas a 2 requisições paralelas, sem envio automático.
 */
(() => {
    'use strict';
    const painel = document.getElementById('comparador-geral');
    if (!painel) return;
    const conta = painel.dataset.userId;
    const $ = id => document.getElementById(id);
    const botao = $('comparador-executar');
    const status = $('comparador-status');
    const resultados = $('comparador-resultados');
    const pacoteLista = $('pacote-lista');
    const pacoteStatus = $('pacote-status');
    const pacoteCriar = $('pacote-criar');
    const pacoteAtualizar = $('pacote-atualizar');
    const limiteSelect = $('pacote-limite');
    let comparando = false;
    let manipulando = false;
    const texto = (tag, content, className = '') => {
        const el = document.createElement(tag);
        el.textContent = content;
        if (className) el.className = className;
        return el;
    };
    function nomeRegistro(tipo,item) {
        if (!item) return '(sem identificação)';
        if (tipo === 'frequencias') return `${item.data} — aluno ${item.aluno_id}`;
        if (tipo === 'notas') return `Avaliação ${item.avaliacao_id} / aluno ${item.aluno_id}`;
        if (tipo === 'vinculos') return `Turma ${item.turma_id} / aluno ${item.aluno_id}`;
        return String(item.nome_completo || item.nome || item.titulo || item.id || 'Registro');
    }
    const chaves={
        turmas:x=>String(x.id), alunos:x=>String(x.id),
        vinculos:x=>`${x.turma_id}:${x.aluno_id}`,
        avaliacoes:x=>String(x.id),
        notas:x=>`${x.avaliacao_id}:${x.aluno_id}`,
        diario:x=>String(x.id),
        frequencias:x=>`${x.turma_id}:${x.aluno_id}:${x.data}`
    };
    const campos={
        turmas:['nome','ano','ano_letivo','disciplina_id','descricao'],
        alunos:['nome_completo','matricula','data_nascimento','aniversario_dia_mes','telefone','email','observacoes'],
        vinculos:[],
        avaliacoes:['nome','data','nota_maxima','periodo_tipo','periodo_numero','categoria','peso','turma_id','recuperacao_modo'],
        notas:['valor','recupera_periodo','nota_id'],
        diario:['titulo','conteudo','descricao','data','turma_id','texto','observacoes'],
        frequencias:['presente']
    };
    function alterado(tipo,a,b) {
        return campos[tipo].some(campo=>Object.hasOwn(a,campo)&&Object.hasOwn(b,campo)&&
            JSON.stringify(a[campo]??null)!==JSON.stringify(b[campo]??null));
    }
    function compararColecao(tipo,locais,remotos) {
        const indexar=arr=>new Map(arr.filter(x=>x&&chaves[tipo](x)!=='undefined')
            .map(x=>[chaves[tipo](x),x]));
        const local=indexar(locais), remoto=indexar(remotos);
        const somenteLocal=[],somenteNuvem=[],diferentes=[];
        for(const [id,item] of local) {
            if(!remoto.has(id))somenteLocal.push(item);
            else if(alterado(tipo,item,remoto.get(id)))diferentes.push(item);
        }
        for(const [id,item] of remoto)if(!local.has(id))somenteNuvem.push(item);
        return {somenteLocal,somenteNuvem,diferentes};
    }
    async function consultar(url) {
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),25000);
        try {
            const resp=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
            if(!resp.ok) throw new Error(`${url.split('?')[0]} retornou HTTP ${resp.status}`);
            return resp.json();
        } finally {clearTimeout(timer);}
    }
    // Máximo de duas consultas simultâneas ao Flask/Supabase.
    async function coletarEmLotes(registros,fn) {
        const saida=[];
        for(let i=0;i<registros.length;i+=2){
            const lote=await Promise.all(registros.slice(i,i+2).map(fn));
            lote.forEach(x=>saida.push(x));
        }
        return saida;
    }
    async function nuvem(copia) {
        const [turmas,alunos]=await Promise.all([
            consultar('/api/turmas'),consultar('/api/alunos')]);
        const diario=await consultar('/api/diario');
        if(![turmas,alunos,diario].every(Array.isArray))throw new Error('A API retornou dados inválidos.');
        if(turmas.length > 150 || alunos.length > 2000 || diario.length > 2000)
            throw new Error('Volume acima do limite de comparação segura.');
        const grupos=await coletarEmLotes(turmas,async t=>{
            const av=await consultar(`/api/turma/${encodeURIComponent(t.id)}/avaliacoes`);
            if(!Array.isArray(av)) throw new Error('Avaliações incompletas.');
            return av;
        });
        const avaliacoes=grupos.flat();
        const notasBrutas=await coletarEmLotes(avaliacoes,async av=>{
            const d=await consultar(`/api/avaliacao/${encodeURIComponent(av.id)}/diario`);
            if(!Array.isArray(d.alunos)||!d.avaliacao)throw new Error('Notas incompletas.');
            return d.alunos.map(a=>({avaliacao_id:av.id,aluno_id:a.id,
                nota_id:a.nota_id||null,valor:a.nota,recupera_periodo:a.recupera_periodo??null}));
        });
        const vinculosBrutos=await coletarEmLotes(turmas,async t=>{
            const d=await consultar(`/api/turmas/${encodeURIComponent(t.id)}/alunos_vinculados`);
            if(!Array.isArray(d))throw new Error('Vínculos incompletos.');
            return d.filter(x=>x.alunos?.id).map(x=>({turma_id:t.id,aluno_id:x.alunos.id}));
        });
        const ano=Number(copia.ano_letivo);
        if(!Number.isInteger(ano)||ano<2000||ano>2100)
            throw new Error('A cópia local não tem ano letivo válido. Baixe novamente.');
        const frequenciaBruta=await coletarEmLotes(turmas,async t=>{
            const d=await consultar(`/api/turma/${encodeURIComponent(t.id)}/frequencias_ano?ano=${ano}`);
            if(!Array.isArray(d))throw new Error('Frequências incompletas.');
            return d;
        });
        return {turmas,alunos,diario,avaliacoes,notas:notasBrutas.flat(),
            vinculos:vinculosBrutos.flat(),frequencias:frequenciaBruta.flat()};
    }
    const categorias=[['turmas','Turmas'],['alunos','Alunos'],['vinculos','Vínculos de alunos'],
        ['avaliacoes','Avaliações'],['notas','Notas'],['diario','Diário'],['frequencias','Frequências']];
    function desenhar(tipo,titulo,diferenca) {
        const article=texto('article','', 'central-comparacao-item');
        const cab=texto('h3',titulo);
        const total=diferenca.somenteLocal.length+diferenca.somenteNuvem.length+diferenca.diferentes.length;
        cab.append(texto('small',` — ${total} diferença(s)`));
        article.append(cab);
        for(const [rotulo,lista] of [
            ['Somente na cópia',diferenca.somenteLocal],
            ['Somente na nuvem',diferenca.somenteNuvem],
            ['Alterados desde o download',diferenca.diferentes]]){
            const details=document.createElement('details');
            details.append(texto('summary',`${rotulo}: ${lista.length}`));
            if(lista.length) {
                const ul=document.createElement('ul');
                lista.slice(0,30).forEach(item=>ul.append(texto('li',nomeRegistro(tipo,item))));
                if(lista.length>30)ul.append(texto('li',`... mais ${lista.length-30} registro(s)`));
                details.append(ul);
            }
            article.append(details);
        }
        return article;
    }
    botao.addEventListener('click',async()=>{
        if(comparando)return;
        if(!navigator.onLine){status.textContent='Conecte-se para comparar com a nuvem.';return;}
        comparando=true;botao.disabled=true;
        resultados.replaceChildren();
        status.textContent='Comparando as sete áreas. Pode levar algum tempo; nenhuma alteração será enviada.';
        try {
            const copia=await obterSnapshot(conta);
            if(!copia)throw new Error('Baixe uma cópia local antes de comparar.');
            const remoto=await nuvem(copia);
            const [freq,edicoes,academico]=await Promise.all([
                getPendentes(),listarEdicoesOffline(conta),listarEdicoesAcademicas(conta)]);
            const sum=texto('p',`Alterações ainda não enviadas: ${freq.filter(x=>x.usuario_id===conta).length} chamada(s), `+
                `${edicoes.length} edição(ões) de turmas/alunos e ${academico.length} edição(ões) acadêmica(s).`);
            resultados.append(sum);
            let total=0;
            for(const [tipo,titulo] of categorias){
                const diferenca=compararColecao(tipo,copia[tipo]||[],remoto[tipo]||[]);
                total+=diferenca.somenteLocal.length+diferenca.somenteNuvem.length+diferenca.diferentes.length;
                resultados.append(desenhar(tipo,titulo,diferenca));
            }
            const p=texto('p','Para resolver conflitos, utilize os painéis de frequência, turmas/alunos e notas/diário nesta mesma página. Não há envio automático.');
            resultados.prepend(p);
            status.textContent=`Comparação concluída: ${total} diferença(s) entre cópia e nuvem em sete áreas. Mudanças pendentes são listadas separadamente.`;
        }catch(error){status.textContent='Comparação interrompida sem modificar dados: '+(error?.message||'Erro inesperado');}
        finally{comparando=false;botao.disabled=false;}
    });
    const nomesPacote={frequencia_pendente:'Frequência',edicoes_offline:'Turmas/alunos',edicoes_academicas:'Notas/Diário'};
    const resumoPacote=p=>Object.entries(p.totais).map(([k,v])=>`${nomesPacote[k]}: ${v}`).join(' · ');
    async function carregarPacotes(){
        if(manipulando)return;
        try {
            const lista=await window.ClassePacotes.listar(conta);
            pacoteLista.replaceChildren();
            if(!lista.length)pacoteLista.append(texto('p','Nenhum pacote salvo neste dispositivo.'));
            for(const item of lista){
                const card=texto('article','', 'central-pacote-item');
                const d=new Date(item.criado_em);
                card.append(texto('strong',item.nome||'Pacote de alterações'));
                card.append(texto('p',`${d.toLocaleString('pt-BR')} · ${resumoPacote(item)}`));
                const barra=texto('div','', 'central-toolbar');
                const btnComparar=texto('button','Comparar com minhas pendências atuais','notificacoes-atualizar');
                const btnRestaurar=texto('button','Restaurar este pacote','notificacoes-atualizar');
                const diferencas=texto('p','');
                btnComparar.addEventListener('click',async()=>{
                    try{
                        const dif=await window.ClassePacotes.comparar(conta,item.id);
                        diferencas.textContent=dif.map(x=>`${nomesPacote[x.tipo]}: ${x.adicionados} novo(s), `+
                            `${x.retirados} retirado(s), ${x.modificados} alterado(s)`).join(' · ');
                    }catch(erro){diferencas.textContent=erro.message;}
                });
                btnRestaurar.addEventListener('click',async()=>{
                    if(manipulando)return;
                    if(!confirm('ATENÇÃO: as edições e chamadas pendentes atuais serão substituídas neste dispositivo. Uma cópia de segurança será criada. Não envia nada à nuvem. Feche outras abas antes de continuar. Restaurar?'))return;
                    manipulando=true;btnRestaurar.disabled=true;
                    pacoteStatus.textContent='Restaurando alterações locais de forma atômica...';
                    try{
                        await window.ClassePacotes.restaurar(conta,item.id);
                        document.dispatchEvent(new Event('classeapp:pacotes-restaurado'));
                        pacoteStatus.textContent='Pacote restaurado. A versão anterior foi salva como backup. Recarregue os painéis de pendências.';
                    }catch(erro){pacoteStatus.textContent='Restauração cancelada, nada alterado: '+erro.message;}
                    finally{manipulando=false;btnRestaurar.disabled=false;await carregarPacotes();}
                });
                barra.append(btnComparar,btnRestaurar);
                card.append(barra,diferencas);pacoteLista.append(card);
            }
            pacoteStatus.textContent=lista.length+' pacote(s) guardado(s) localmente.';
        }catch(erro){pacoteStatus.textContent=erro?.message||'Desbloqueie o cofre nas Configurações para abrir os pacotes.';}
    }
    pacoteCriar.addEventListener('click',async()=>{
        if(manipulando)return;
        manipulando=true;pacoteCriar.disabled=true;
        try{
            const nome=$('pacote-nome').value.trim();
            await window.ClassePacotes.criar(conta,nome||'Alterações locais');
            $('pacote-nome').value='';
            pacoteStatus.textContent='Novo pacote de alterações salvo no cofre local.';
        }catch(error){pacoteStatus.textContent=error.message||'Não foi possível salvar o pacote.';}
        finally{manipulando=false;pacoteCriar.disabled=false;await carregarPacotes();}
    });
    pacoteAtualizar.addEventListener('click',carregarPacotes);
    limiteSelect.value=String(window.ClassePacotes?.limite(conta)||3);
    limiteSelect.addEventListener('change',()=>{
        const n=Number(limiteSelect.value);
        if(![3,5,7,10].includes(n))return;
        try{
            localStorage.setItem('classeapp:pacotes:limite:'+conta,String(n));
            pacoteStatus.textContent=`Novo limite de ${n} versões aplicado às próximas gravações. Versões antigas além do limite serão removidas no próximo salvamento.`;
        }catch(erro){pacoteStatus.textContent='Não foi possível salvar a preferência neste navegador.';}
    });
    document.addEventListener('classeapp:cofre:liberado',carregarPacotes);
    carregarPacotes();
})();
