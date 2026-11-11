/* ClasseApp - cofre local. Cifra snapshots, histórico e filas por conta com AES-GCM.
 * A chave deriva da senha da conta configurada localmente (PBKDF2). A janela pode conservar seu material
 * derivado por prazo limitado na sessionStorage para não exigir nova senha a
 * cada navegação. Nunca usa tokens do Supabase para desbloquear dados.
 */
(() => {
    'use strict';
    const S = {
        frequencia: 'frequencia_pendente', copia: 'snapshots_consulta',
        historico: 'snapshots_historico', edicoes: 'edicoes_offline',
        academico: 'edicoes_academicas', acessos: 'acessos_offline',
        pacotes: 'pacotes_alteracoes'
    };
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const b64 = bytes => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
    const un64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
    const encarte = (usuario, loja, chave, item, iv, cifrado, hash) => ({
        usuario_id: usuario, ...(chave === undefined ? {} : {[loja === S.frequencia ? 'id' :
            [S.copia,S.historico,S.acessos,S.pacotes].includes(loja) ? 'usuario_id' : 'chave']: chave}),
        cofre_v1: true, iv: b64(iv), dados_cifrados: b64(new Uint8Array(cifrado)),
        impressao: hash
    });
    const chaveLogica = (loja, item) => loja === S.frequencia ? item.id :
        [S.copia, S.historico, S.acessos, S.pacotes].includes(loja) ? item.usuario_id : item.chave;
    const aad = (u, loja, k) => encoder.encode(`ClasseApp:cofre:v1:${u}:${loja}:${loja === S.frequencia ? 'lancamento' : k ?? 'novo'}`);
    async function assinar(obj) {
        const dig = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(obj)));
        return b64(new Uint8Array(dig));
    }
    async function cifrar(loja, item, chave) {
        const k = chaveLogica(loja, item);
        const usuario = item.usuario_id;
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const hash = await assinar(item);
        const bytes = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:aad(usuario,loja,k)},
            chave, encoder.encode(JSON.stringify(item)));
        return encarte(usuario, loja, k, item, iv, bytes, hash);
    }
    async function decifrar(loja, item, chave) {
        if (!item?.cofre_v1) return item;
        if (!chave) throw new Error('Desbloqueie os dados locais com sua senha antes de continuar.');
        const k = chaveLogica(loja, item);
        const texto = await crypto.subtle.decrypt({name:'AES-GCM', iv:un64(item.iv),
            additionalData:aad(item.usuario_id,loja,k)}, chave, un64(item.dados_cifrados));
        const valor = JSON.parse(decoder.decode(texto));
        if (valor.usuario_id !== item.usuario_id ||
            (loja !== S.frequencia && String(chaveLogica(loja,valor)) !== String(k))) {
            throw new Error('Integridade do cofre local inválida.');
        }
        if (loja === S.frequencia) valor.id = item.id;
        return valor;
    }
    async function transacao(lojas, modo, preparar) {
        const db = await openDB();
        return new Promise((resolve,reject) => {
            const tx = db.transaction(lojas,modo);
            let saida;
            try { preparar(tx, result => {saida=result;}); }
            catch(error) {tx.abort();db.close();reject(error);return;}
            tx.oncomplete=()=>{db.close();resolve(saida);};
            tx.onabort=()=>{db.close();reject(tx.error||new Error('Transação local cancelada.'));};
            tx.onerror=()=>{};
        });
    }
    function lerLoja(loja, op = 'getAll', arg) {
        return transacao([loja], 'readonly', (tx,set) => {
            const req=tx.objectStore(loja)[op](...(op==='getAll'?[]:[arg]));
            req.onsuccess=()=>set(req.result);
        });
    }
    function escrever(loja, op, value) {
        return transacao([loja], 'readwrite', (tx,set)=>{
            const req=tx.objectStore(loja)[op](value);
            req.onsuccess=()=>set(req.result);
        });
    }
    function contaVisivel() {
        return window.CLASSE_USUARIO_ID ||
            document.querySelector('[data-user-id]')?.dataset.userId ||
            window.ClasseOfflineAccess?.usuarioDesbloqueado?.() || null;
    }
    async function chaveDaConta(usuario) {
        const perfil=await obterAcessoOffline(usuario);
        if (!perfil) return null; // cópias antigas sem senha ainda não estão protegidas
        const acesso=window.ClasseOfflineAccess;
        if (!acesso) throw new Error('Módulo de proteção local indisponível. Recarregue a página.');
        return acesso.obterChave(usuario) || await acesso.solicitarDesbloqueio(usuario);
    }
    async function guardar(loja,item) {
        if (!item?.usuario_id) throw new Error('Operação local sem identificação da conta.');
        const key=await chaveDaConta(item.usuario_id);
        if (!key) throw new Error('Ative o cofre nas Configurações com sua senha de login para armazenar dados protegidos.');
        return escrever(loja,'put',await cifrar(loja,item,key));
    }
    async function carregar(loja,item) {
        if (!item) return item;
        if (item.cofre_v1) return decifrar(loja,item,await chaveDaConta(item.usuario_id));
        if (item.usuario_id && await obterAcessoOffline(item.usuario_id)) {
            // Registro legado: migrar automaticamente após desbloqueio.
            await chaveDaConta(item.usuario_id);
        }
        return item;
    }
    // A migração é atômica. Em caso de erro, os registros originais permanecem.
    async function migrar(usuario,chaveAnterior,chaveNova=chaveAnterior,novoPerfil=null) {
        const lojas=[S.copia,S.historico,S.frequencia,S.edicoes,S.academico,S.pacotes];
        const originais=await Promise.all(lojas.map(loj=>lerLoja(loj)));
        const blocos=[];
        for (let i=0;i<lojas.length;i++) {
            const loja=lojas[i];
            for (const origem of originais[i]) {
                if (origem.usuario_id!==usuario) continue;
                // Em desbloqueios normais, registros já protegidos não são
                // regravados; uma troca de senha recriptografa todos.
                if (!novoPerfil && chaveAnterior === chaveNova && origem.cofre_v1) continue;
                const valor=await decifrar(loja,origem,chaveAnterior);
                const substituto=await cifrar(loja,valor,chaveNova);
                blocos.push({loja,origem,substituto});
            }
        }
        if (!blocos.length && !novoPerfil) return;
        await transacao([...lojas,S.acessos],'readwrite',tx=>{
            for (const {loja,origem,substituto} of blocos) {
                const store=tx.objectStore(loja);
                const req=store.get(chaveLogica(loja,origem));
                req.onsuccess=()=>{
                    // Não pisar em edições feitas por outra aba durante a migração.
                    if (JSON.stringify(req.result)!==JSON.stringify(origem)) {tx.abort();return;}
                    store.put(substituto);
                };
            }
            if (novoPerfil) tx.objectStore(S.acessos).put({...novoPerfil,cofre_ativo:true});
        });
    }
    async function migrarLegado(usuario,chave) {
        await migrar(usuario,chave);
    }
    async function trocarSenha(usuario,chaveAntiga,chaveNova,perfil) {
        await migrar(usuario,chaveAntiga,chaveNova,perfil);
    }
    window.ClasseVault={migrarLegado,trocarSenha,contaVisivel};

    // Snapshot e histórico versionado com cifragem de cada versão e histórico.
    salvarSnapshot=async function(snapshot) {return guardar(S.copia,snapshot);};
    obterSnapshot=async function(usuario) {return carregar(S.copia,await lerLoja(S.copia,'get',usuario));};
    apagarSnapshot=async function(usuario) {return escrever(S.copia,'delete',usuario);};
    salvarSnapshotVersionado=async function(snapshot) {
        if (!snapshot?.usuario_id || !Array.isArray(snapshot.turmas) || !Array.isArray(snapshot.alunos)) {
            throw new Error('Cópia inválida.');
        }
        const usuario=snapshot.usuario_id;
        const [atual,versoes]=await Promise.all([obterSnapshot(usuario),listarVersoesSnapshot(usuario)]);
        const lista=atual?[atual,...versoes].slice(0,limiteHistorico(usuario)):versoes.slice(0,limiteHistorico(usuario));
        const key=await chaveDaConta(usuario);
        if(!key) throw new Error('Ative o cofre local nas Configurações antes de baixar os dados escolares.');
        const nova={...snapshot,formato_versao:1};
        const historico={usuario_id:usuario,versoes:lista};
        const [a,b]=await Promise.all([key?cifrar(S.copia,nova,key):nova,
            key?cifrar(S.historico,historico,key):historico]);
        await transacao([S.copia,S.historico],'readwrite',tx=>{
            tx.objectStore(S.copia).put(a);tx.objectStore(S.historico).put(b);
        });
        document.dispatchEvent(new Event('classeapp:snapshot:atualizado'));
    };
    listarVersoesSnapshot=async function(usuario) {
        const item=await carregar(S.historico,await lerLoja(S.historico,'get',usuario));
        return item?.versoes||[];
    };
    restaurarVersaoSnapshot=async function(usuario,indice) {
        const [atual,lista]=await Promise.all([obterSnapshot(usuario),listarVersoesSnapshot(usuario)]);
        if (!Number.isInteger(indice)||indice<0||indice>=lista.length) throw new Error('Versão não encontrada.');
        const selecionada={...lista[indice],usuario_id:usuario};
        const resto=lista.filter((_,i)=>i!==indice);
        if (atual) resto.unshift(atual);
        const historico={usuario_id:usuario,versoes:resto.slice(0,limiteHistorico(usuario))};
        const key=await chaveDaConta(usuario);
        const [a,b]=await Promise.all([key?cifrar(S.copia,selecionada,key):selecionada,
            key?cifrar(S.historico,historico,key):historico]);
        await transacao([S.copia,S.historico],'readwrite',tx=>{
            tx.objectStore(S.copia).put(a);tx.objectStore(S.historico).put(b);
        });
    };
    apagarSnapshotComHistorico=async function(usuario){
        return transacao([S.copia,S.historico],'readwrite',tx=>{
            tx.objectStore(S.copia).delete(usuario);tx.objectStore(S.historico).delete(usuario);
        });
    };
    // Pacotes versionados: guardam SÓ as mudanças locais, para evitar duplicar
    // a cópia inteira de notas/frequências e causar consumo excessivo de memória.
    const lojasDeEdicao=[S.frequencia,S.edicoes,S.academico];
    async function lerPacotes(usuario,key) {
        const raw=await lerLoja(S.pacotes,'get',usuario);
        const valor=raw?await decifrar(S.pacotes,raw,key):null;
        return valor?.versoes || [];
    }
    async function capturarFilas(usuario,key) {
        const raws=await Promise.all(lojasDeEdicao.map(loja=>lerLoja(loja)));
        const payload={};
        for (let i=0;i<lojasDeEdicao.length;i++) {
            const loja=lojasDeEdicao[i];
            payload[loja]=[];
            for (const raw of raws[i]) {
                if (raw.usuario_id!==usuario) continue;
                const registro=await decifrar(loja,raw,key);
                payload[loja].push({...registro,...(loja===S.frequencia?{id:raw.id}:{})});
            }
        }
        return {raws,payload};
    }
    function criacaoPacote(nome,payload) {
        return {id:crypto.randomUUID(),nome:String(nome||'Ponto de controle').trim().slice(0,80),
            criado_em:new Date().toISOString(),filas:payload};
    }
    async function criarPacoteAlteracoes(usuario,nome) {
        const key=await chaveDaConta(usuario);
        if(!key) throw new Error('Desbloqueie o cofre antes de salvar pacotes.');
        const [atual,pacotes]=await Promise.all([capturarFilas(usuario,key),lerPacotes(usuario,key)]);
        const pacote=criacaoPacote(nome,atual.payload);
        const novo={usuario_id:usuario,versoes:[pacote,...pacotes].slice(0,limiteHistorico(usuario))};
        await escrever(S.pacotes,'put',await cifrar(S.pacotes,novo,key));
        document.dispatchEvent(new Event('classeapp:pacotes-atualizados'));
        return pacote;
    }
    async function listarPacotesAlteracoes(usuario) {
        const key=await chaveDaConta(usuario);
        const versoes=await lerPacotes(usuario,key);
        return versoes.map(p=>({id:p.id,nome:p.nome,criado_em:p.criado_em,
            totais:Object.fromEntries(lojasDeEdicao.map(loja=>[loja,p.filas[loja]?.length||0]))}));
    }
    async function compararPacoteAlteracoes(usuario,id) {
        const key=await chaveDaConta(usuario);
        const [pacotes,atual]=await Promise.all([lerPacotes(usuario,key),capturarFilas(usuario,key)]);
        const pacote=pacotes.find(x=>x.id===id);
        if(!pacote) throw new Error('Pacote não encontrado.');
        return lojasDeEdicao.map(loja=>{
            const indice=reg=>String(loja===S.frequencia?reg.id:reg.chave);
            const base=new Map((pacote.filas[loja]||[]).map(reg=>[indice(reg),reg]));
            const recente=new Map((atual.payload[loja]||[]).map(reg=>[indice(reg),reg]));
            let adicionados=0,retirados=0,modificados=0;
            for(const [id,r] of recente){
                if(!base.has(id))adicionados++;
                else if(JSON.stringify(base.get(id))!==JSON.stringify(r))modificados++;
            }
            for(const id of base.keys())if(!recente.has(id))retirados++;
            return {tipo:loja,adicionados,retirados,modificados,
                pacote:base.size,atuais:recente.size};
        });
    }
    async function restaurarPacoteAlteracoes(usuario,id) {
        const key=await chaveDaConta(usuario);
        if(!key) throw new Error('Desbloqueie o cofre.');
        const [pacotes,atual,rawPacotes]=await Promise.all([
            lerPacotes(usuario,key),capturarFilas(usuario,key),lerLoja(S.pacotes,'get',usuario)]);
        const alvo=pacotes.find(v=>v.id===id);
        if(!alvo) throw new Error('Versão não encontrada.');
        // Sempre criamos uma versão de segurança das pendências anteriores.
        const backup=criacaoPacote('Backup antes de restaurar '+alvo.nome,atual.payload);
        const novoPacotes={usuario_id:usuario,
            versoes:[backup,...pacotes].slice(0,limiteHistorico(usuario))};
        const pacotesCifrados=await cifrar(S.pacotes,novoPacotes,key);
        const cifrados={};
        for(const loja of lojasDeEdicao){
            cifrados[loja]=[];
            for(const reg of alvo.filas[loja]||[]){
                if(reg.usuario_id!==usuario || (loja===S.frequencia&&!Number.isInteger(reg.id)) ||
                    (loja!==S.frequencia&&!reg.chave)) throw new Error('Pacote inválido para esta conta.');
                cifrados[loja].push(await cifrar(loja,reg,key));
            }
        }
        // A comparação do conteúdo lido e a substituição acontecem na mesma
        // transação, sem apagar registros pertencentes a outras contas.
        await transacao([...lojasDeEdicao,S.pacotes],'readwrite',tx=>{
            const carregados={};
            let pronto=0;
            const conferir=()=>{
                if(++pronto!==lojasDeEdicao.length+1)return;
                if(JSON.stringify(carregados[S.pacotes])!==JSON.stringify(rawPacotes)){
                    tx.abort();return;
                }
                for(let i=0;i<lojasDeEdicao.length;i++){
                    const loja=lojasDeEdicao[i];
                    if(JSON.stringify(carregados[loja])!==JSON.stringify(atual.raws[i])){
                        tx.abort();return;
                    }
                }
                for(const loja of lojasDeEdicao){
                    const store=tx.objectStore(loja);
                    for(const registro of carregados[loja])if(registro.usuario_id===usuario){
                        store.delete(chaveLogica(loja,registro));
                    }
                    for(const registro of cifrados[loja])store.put(registro);
                }
                tx.objectStore(S.pacotes).put(pacotesCifrados);
            };
            for(const loja of lojasDeEdicao){
                const req=tx.objectStore(loja).getAll();
                req.onsuccess=()=>{carregados[loja]=req.result;conferir();};
            }
            const req=tx.objectStore(S.pacotes).get(usuario);
            req.onsuccess=()=>{carregados[S.pacotes]=req.result;conferir();};
        });
        document.dispatchEvent(new Event('classeapp:edicoes-atualizadas'));
        document.dispatchEvent(new Event('classeapp:pacotes-atualizados'));
        return backup;
    }
    window.ClassePacotes={criar:criarPacoteAlteracoes,listar:listarPacotesAlteracoes,
        comparar:compararPacoteAlteracoes,restaurar:restaurarPacoteAlteracoes,
        limite:limiteHistorico};

    // Fila de frequência. O id local não é conteúdo acadêmico; payload é cifrado.
    salvarOffline=async function(item) {
        if(!item?.usuario_id) throw new Error('Identificação da conta necessária para salvar frequência.');
        const novo={...item,criado_em:new Date().toISOString()};
        const key=await chaveDaConta(item.usuario_id);
        if(!key) throw new Error('Ative o cofre nas Configurações antes de salvar frequências offline.');
        const envelope=await cifrar(S.frequencia,novo,key);
        return escrever(S.frequencia,'add',envelope);
    };
    getPendentes=async function() {
        const raw=await lerLoja(S.frequencia);
        const usuario=contaVisivel();
        const resultado=[];
        for (const item of raw) {
            if (!item.usuario_id) {resultado.push(item);continue;}
            if (usuario && item.usuario_id!==usuario) continue;
            if (item.cofre_v1) {
                if (!usuario) continue;
                const decoded=await carregar(S.frequencia,item);
                resultado.push({...decoded,id:item.id});
            } else resultado.push(item);
        }
        return resultado;
    };
    atualizarPendente=async function(item) {
        if(!Number.isInteger(item?.id)) throw new Error('Pendência inválida.');
        return guardar(S.frequencia,item);
    };
    limparPendentes=async function(id){return escrever(S.frequencia,'delete',id);};

    // Comparação atômica para impedir que um envio antigo apague a chamada mais
    // recente. O envelope AES guarda a impressão SHA-256 do registro cifrado.
    modificarPendenteSeIgual=async function(esperado,novo=null) {
        if (!esperado?.usuario_id || !Number.isInteger(esperado.id) ||
            (novo && (novo.id!==esperado.id || novo.usuario_id!==esperado.usuario_id))) {
            throw new Error('Pendência de frequência inválida.');
        }
        const chave=await chaveDaConta(esperado.usuario_id);
        if (!chave) throw new Error('Desbloqueie a conta antes da sincronização.');
        // Os primeiros registros cifrados tinham id autoincremental atribuído
        // somente DEPOIS da cifragem. Aceitar as duas assinaturas antigas.
        const semId={...esperado};
        delete semId.id;
        const assinaturas=[await assinar(esperado),await assinar(semId)];
        const substituto=novo?await cifrar(S.frequencia,novo,chave):null;
        return transacao([S.frequencia],'readwrite',(tx,set)=>{
            const store=tx.objectStore(S.frequencia);
            const req=store.get(esperado.id);
            req.onsuccess=()=>{
                const atual=req.result;
                const igual=atual && atual.usuario_id===esperado.usuario_id &&
                    (atual.cofre_v1 ? assinaturas.includes(atual.impressao) :
                        JSON.stringify(atual)===JSON.stringify(esperado));
                if (!igual) {set(false);return;}
                if (substituto) store.put(substituto);
                else store.delete(esperado.id);
                set(true);
            };
        });
    };
    // Atualiza a última marcação do mesmo aluno/dia, preservando revisão base.
    window.salvarFrequenciaUnica=async function(item) {
        for (let tentativa=0; tentativa<4; tentativa++) {
            const antigos=(await getPendentes()).filter(x=>x.usuario_id===item.usuario_id &&
                x.dados?.aluno_id===item.dados?.aluno_id && x.dados?.turma_id===item.dados?.turma_id &&
                x.dados?.data===item.dados?.data);
            if (!antigos.length) return salvarOffline(item);
            const anterior=antigos[0];
            const novo={...anterior,dados:{...item.dados,
                revision:anterior.dados.revision},conflito:false,erro_conflito:null,
                criado_em:new Date().toISOString()};
            if (await modificarPendenteSeIgual(anterior,novo)) return anterior.id;
        }
        throw new Error('A chamada foi alterada em outra aba. Atualize e tente novamente.');
        // Duplicados legados permanecem para revisão: não os apagamos aqui.
    };
    // Edições de turmas/alunos.
    listarEdicoesOffline=async function(usuario){
        const itens=(await lerLoja(S.edicoes)).filter(v=>v.usuario_id===usuario);
        return Promise.all(itens.map(v=>carregar(S.edicoes,v)));
    };
    salvarEdicaoOffline=async function(item){return guardar(S.edicoes,item);};
    removerEdicaoOffline=async function(chave){return escrever(S.edicoes,'delete',chave);};
    modificarEdicaoOfflineSeIgual=async function(esperado,estado=null){
        if(!esperado?.chave) throw new Error('Edição inválida.');
        const key=await chaveDaConta(esperado.usuario_id);
        const antesHash=await assinar(esperado);
        const atualizado={...esperado,estado};
        const novo=estado===null?null:key?await cifrar(S.edicoes,atualizado,key):atualizado;
        return transacao([S.edicoes],'readwrite',(tx,set)=>{
            const store=tx.objectStore(S.edicoes),req=store.get(esperado.chave);
            req.onsuccess=()=>{
                const atual=req.result;
                if(!atual || (atual.cofre_v1?atual.impressao!==antesHash:
                    !mesmaEdicaoOffline(atual,esperado))) {set(false);return;}
                if(novo) store.put(novo);else store.delete(esperado.chave);
                set(true);
            };
        });
    };
    // Edições acadêmicas, com a mesma proteção de concorrência do original.
    listarEdicoesAcademicas=async function(usuario){
        const itens=(await lerLoja(S.academico)).filter(v=>v.usuario_id===usuario);
        return Promise.all(itens.map(v=>carregar(S.academico,v)));
    };
    salvarEdicaoAcademica=async function(item){
        if(!['nota','nota_excluir','avaliacao_criar','avaliacao_excluir','diario',
            'diario_criar','diario_excluir'].includes(item?.tipo)) throw new Error('Edição acadêmica inválida.');
        return guardar(S.academico,item);
    };
    alterarEdicaoAcademicaSeIgual=async function(esperado,estado=null){
        const key=await chaveDaConta(esperado.usuario_id);
        const hash=await assinar(esperado);
        const novo=estado===null?null:key?await cifrar(S.academico,{...esperado,estado},key):{...esperado,estado};
        return transacao([S.academico],'readwrite',(tx,set)=>{
            const store=tx.objectStore(S.academico),req=store.get(esperado.chave);
            req.onsuccess=()=>{
                const atual=req.result;
                if(!atual || (atual.cofre_v1?atual.impressao!==hash:
                    !mesmaEdicaoAcademica(atual,esperado))) {set(false);return;}
                if(novo)store.put(novo);else store.delete(esperado.chave);
                set(true);
            };
        });
    };
    restaurarEdicaoAcademicaSeIgual=async function(esperada,anterior){
        if(anterior && (anterior.chave!==esperada.chave || anterior.usuario_id!==esperada.usuario_id)){
            throw new Error('Pendência de outra conta.');
        }
        const key=await chaveDaConta(esperada.usuario_id);
        const hash=await assinar(esperada);
        const novo=anterior?(key?await cifrar(S.academico,anterior,key):anterior):null;
        return transacao([S.academico],'readwrite',(tx,set)=>{
            const store=tx.objectStore(S.academico),req=store.get(esperada.chave);
            req.onsuccess=()=>{
                const atual=req.result;
                if(!atual || (atual.cofre_v1?atual.impressao!==hash:
                    !mesmaEdicaoAcademica(atual,esperada))) {set(false);return;}
                if(novo)store.put(novo);else store.delete(esperada.chave);
                set(true);
            };
        });
    };
})();
