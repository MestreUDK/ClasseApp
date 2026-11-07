/* Frequência no Espaço offline. Não acessa APIs nem assume ausência como falta.
 * Cada marcação utiliza a revisão da cópia original; conflitos vão para o Perfil.
 */
(() => {
    'use strict';
    const get = id => document.getElementById(id);
    const root = get('offline-frequencia');
    if (!root) return;
    let snapshot = null;
    let usuario = null;
    let turma = '';
    let data = '';
    let busca = '';
    let seq = 0;
    const criar = (tag, txt, classe) => {
        const el = document.createElement(tag);
        el.textContent = txt || '';
        if (classe) el.className=classe;
        return el;
    };
    const registroId = v => String(v ?? '');
    const hoje = () => {
        const atual=new Date();
        const f=n=>String(n).padStart(2,'0');
        return `${atual.getFullYear()}-${f(atual.getMonth()+1)}-${f(atual.getDate())}`;
    };
    const validDate = valor => /^\d{4}-\d{2}-\d{2}$/.test(valor) &&
        !Number.isNaN(Date.parse(valor+'T12:00:00'));
    const chave = (turmaId, alunoId, dia) => `${registroId(turmaId)}:${registroId(alunoId)}:${dia}`;
    function baseFrequencia(turmaId, alunoId, dia) {
        const encontrados=(snapshot.frequencias||[]).filter(x=>
            registroId(x.turma_id)===registroId(turmaId) &&
            registroId(x.aluno_id)===registroId(alunoId) && x.data===dia &&
            typeof x.presente==='boolean');
        encontrados.sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
        return encontrados[0]||null;
    }
    let fila=[];
    function obterPendencias(turmaId,alunoId,dia) {
        return fila.filter(x=>x.usuario_id===usuario && x.dados &&
            chave(x.dados.turma_id,x.dados.aluno_id,x.dados.data)===chave(turmaId,alunoId,dia))
            .sort((a,b)=>(a.id||0)-(b.id||0));
    }
    async function desenhar() {
        const rodada=++seq;
        root.replaceChildren();
        if (!snapshot || !usuario) return;
        const titulo=criar('h3','Frequência offline');root.append(titulo);
        const aviso=criar('p','Marque P ou F apenas para alunos cuja chamada deseja registrar. '
            +'Uma chamada sem marcação não significa falta. As alterações são salvas no dispositivo e não são enviadas sem sua confirmação.','muted');
        root.append(aviso);
        if (!Array.isArray(snapshot.vinculos) || !Array.isArray(snapshot.frequencias)) {
            root.append(criar('p','Baixe novamente a cópia no Perfil para incluir alunos vinculados e histórico anual.','warning'));
            return;
        }
        const controles=criar('div','','chamada-controles');
        const seletorTurma=document.createElement('select');
        seletorTurma.setAttribute('aria-label','Selecionar turma');
        for (const item of snapshot.turmas) {
            const option=document.createElement('option');option.value=item.id;option.textContent=item.nome;
            seletorTurma.append(option);
        }
        if (!snapshot.turmas.length) {
            root.append(criar('p','Nenhuma turma disponível na cópia.','muted'));return;
        }
        if (!snapshot.turmas.some(x=>registroId(x.id)===registroId(turma))) turma=snapshot.turmas[0].id;
        seletorTurma.value=turma;
        seletorTurma.addEventListener('change',()=>{turma=seletorTurma.value;desenhar();});
        const inputData=document.createElement('input');inputData.type='date';
        inputData.setAttribute('aria-label','Data da frequência');
        if (!validDate(data)) data=hoje();
        inputData.value=data;
        inputData.addEventListener('change',()=>{data=inputData.value;desenhar();});
        const inputBusca=document.createElement('input');inputBusca.type='search';
        inputBusca.placeholder='Filtrar alunos por nome';inputBusca.setAttribute('aria-label','Buscar aluno');
        inputBusca.value=busca;
        inputBusca.addEventListener('input',()=>{
            busca=inputBusca.value;
            const termo=busca.trim().toLocaleLowerCase('pt-BR');
            let visiveis=0;
            root.querySelectorAll('.chamada-aluno').forEach(linha=>{
                linha.hidden=!linha.dataset.nome.includes(termo);
                if (!linha.hidden) visiveis++;
            });
            const resumo=root.querySelector('.chamada-resumo');
            if(resumo) resumo.textContent=`${visiveis} aluno(s) exibido(s) · ${marcados} chamada(s) registrada(s) · ${pendentes} pendente(s).`;
        });
        controles.append(seletorTurma,inputData,inputBusca);root.append(controles);
        const status=criar('p','','muted');root.append(status);
        if (!validDate(data) || Number(data.slice(0,4)) !== snapshot.ano_letivo) {
            status.textContent=`Escolha uma data do ano ${snapshot.ano_letivo} para usar a cópia baixada. `+
                'Para outro ano, conecte-se e atualize a cópia no Perfil.';
            return;
        }
        const ids=new Set(snapshot.vinculos.filter(x=>registroId(x.turma_id)===registroId(turma))
            .map(x=>registroId(x.aluno_id)));
        const alunos=snapshot.alunos.filter(x=>ids.has(registroId(x.id)))
            .sort((a,b)=>String(a.nome_completo||'').localeCompare(String(b.nome_completo||''),'pt-BR'));
        try {fila=(await getPendentes()).filter(x=>x.usuario_id===usuario);} catch(e) {
            status.textContent='Não foi possível desbloquear as pendências locais: '+(e.message||'');return;
        }
        if(rodada!==seq || !window.ClasseOfflineAccess?.estaDesbloqueado(usuario)) return;
        const lista=criar('div','','chamada-lista');
        let marcados=0,pendentes=0;
        for(const aluno of alunos){
            const regs=obterPendencias(turma,aluno.id,data);
            const ultimo=regs[regs.length-1] || null;
            const base=baseFrequencia(turma,aluno.id,data);
            const atual=ultimo?ultimo.dados.presente:base?.presente;
            if(typeof atual==='boolean') marcados++;
            if(ultimo) pendentes++;
            const linha=criar('article','','chamada-aluno');
            linha.dataset.nome=String(aluno.nome_completo||'').toLocaleLowerCase('pt-BR');
            linha.hidden=!linha.dataset.nome.includes(busca.trim().toLocaleLowerCase('pt-BR'));
            const nome=criar('div','','chamada-nome');
            nome.append(criar('strong',aluno.nome_completo||'Aluno sem nome'));
            nome.append(criar('small',ultimo?(ultimo.conflito?'Conflito: resolver no Perfil':'Pendente no dispositivo'):
                (base?'Salva na última cópia':'Ainda não marcada'),ultimo?'pending':'muted'));
            const botoes=criar('div','','chamada-opcoes');
            for(const [valor,rotulo] of [[true,'Presente'],[false,'Falta']]){
                const botao=criar('button',rotulo,'chamada-botao');botao.type='button';
                botao.setAttribute('aria-pressed',String(atual===valor));
                botao.classList.add(valor?'chamada-presente':'chamada-falta');
                botao.addEventListener('click',async()=>{
                    if(!window.ClasseOfflineAccess?.estaDesbloqueado(usuario)) return;
                    botoes.querySelectorAll('button').forEach(b=>b.disabled=true);
                    status.textContent='Salvando frequência neste dispositivo...';
                    try{
                        const revision=ultimo?.dados?.revision ?? base?.revision ?? 0;
                        await salvarFrequenciaUnica({usuario_id:usuario,dados:{
                            turma_id:turma,aluno_id:aluno.id,data,presente:valor,revision}});
                        document.dispatchEvent(new Event('classeapp:frequencia:gravada'));
                        status.textContent='Frequência armazenada no dispositivo. Envie pelo Perfil quando houver internet.';
                        await desenhar();
                    }catch(e){status.textContent='Não foi possível salvar a marcação: '+(e.message||'erro local');
                        botoes.querySelectorAll('button').forEach(b=>b.disabled=false);}
                });
                botoes.append(botao);
            }
            linha.append(nome,botoes);lista.append(linha);
        }
        status.classList.add('chamada-resumo');
        status.textContent=`${alunos.filter(x=>String(x.nome_completo||'').toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR'))).length} aluno(s) exibido(s), ${marcados} com chamada registrada para esta data, `+
            `${pendentes} com alteração pendente. Sem internet, a marcação NÃO é enviada automaticamente.`;
        root.append(lista);
        if (!alunos.length) root.append(criar('p','Nenhum aluno vinculado encontrado nesta turma.','muted'));
    }
    window.ClasseFrequenciaOffline={
        render:async({snapshot:novos,conta,turmaId}={})=>{
            snapshot=novos;usuario=conta;
            if(turmaId)turma=turmaId;
            if (!data) data=hoje();
            await desenhar();
        },limpar:()=>{snapshot=null;usuario=null;fila=[];root.replaceChildren();}
    };
})();
