/* Integração real dos módulos IndexedDB+AES com IndexedDB simulado em memória.
 * Execute: node tests/test_pacotes_offline.js
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const clone=x=>x===undefined?undefined:structuredClone(x);
class Tx {
    constructor(db,nomes,mode){
        this.db=db;this.mode=mode;this.names=nomes;
        this.maps=Object.fromEntries(nomes.map(n=>[n,new Map(db.maps[n])]));
        this.pending=0;this.aborted=false;this.done=false;this.nexts=Object.fromEntries(nomes.map(n=>[n,db.nexts[n]]));
    }
    abort(){if(this.done||this.aborted)return;this.aborted=true;setTimeout(()=>this.onabort?.(),0);}
    checkDone(){setTimeout(()=>{
        if(this.pending||this.aborted||this.done)return;
        this.done=true;
        if(this.mode==='readwrite')for(const n of this.names){this.db.maps[n]=this.maps[n];this.db.nexts[n]=this.nexts[n];}
        this.oncomplete?.();
    },0);}
    objectStore(n){
        if(!this.maps[n])throw new Error('Loja não aberta: '+n);
        const tx=this;
        function action(fn){
            const req={result:undefined};tx.pending++;
            setTimeout(()=>{
                if(tx.aborted)return;
                try{req.result=fn();req.onsuccess?.();}
                catch(e){tx.error=e;tx.abort();req.onerror?.();}
                tx.pending--;tx.checkDone();
            },0);
            return req;
        }
        return {
            get:k=>action(()=>clone(tx.maps[n].get(k))),
            getAll:()=>action(()=>[...tx.maps[n].entries()].sort(([a],[b])=>a<b?-1:1).map(([,v])=>clone(v))),
            put:v=>action(()=>{
                const pk=tx.db.keys[n];const item=clone(v);
                let key=item[pk];
                if(key===undefined&&pk==='id')key=tx.nexts[n]++;
                if(key===undefined)throw new Error('No key');
                item[pk]=key;tx.maps[n].set(key,item);return key;
            }),
            add:v=>action(()=>{
                const pk=tx.db.keys[n];const item=clone(v);
                let key=item[pk];
                if(key===undefined&&pk==='id')key=tx.nexts[n]++;
                if(tx.maps[n].has(key))throw new Error('Duplicate key');
                item[pk]=key;tx.maps[n].set(key,item);return key;
            }),
            delete:k=>action(()=>{tx.maps[n].delete(k);}),
        };
    }
}
const DB={maps:{},nexts:{},keys:{},version:0,
    objectStoreNames:{contains(n){return n in DB.maps;}},
    createObjectStore(n,opts){DB.maps[n]=new Map();DB.keys[n]=opts.keyPath;DB.nexts[n]=1;return{};},
    transaction(names,mode){return new Tx(DB,Array.isArray(names)?names:[names],mode);},
    close(){}
};
const indexedDB={open(_name,version){
    const req={result:DB};setTimeout(()=>{
        if(version>DB.version){DB.version=version;req.onupgradeneeded?.();}
        req.onsuccess?.();
    },0);return req;
}};
const mapStorage=()=>{
    const map=new Map();return {getItem:k=>map.has(k)?map.get(k):null,
        setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
};
const uid='usuario-123456';
const context={indexedDB,crypto:webcrypto,TextEncoder,TextDecoder,Date,JSON,
    Uint8Array,ArrayBuffer,Promise,Map,Set,Number,String,Object,Math,Buffer,
    btoa,atob,localStorage:mapStorage(),sessionStorage:mapStorage(),
    setInterval:()=>0,setTimeout,clearTimeout,console,
    Event:class Event{constructor(type){this.type=type;}},
    document:{getElementById:()=>null,querySelector:()=>null,dispatchEvent:()=>{},addEventListener:()=>{}},
    navigator:{onLine:true},isSecureContext:true,CLASSE_USUARIO_ID:uid};
context.window=context;vm.createContext(context);
for(const path of ['static/js/db.js','static/js/vault.js','static/js/offline_access.js']){
    vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});
}
const run=(fn,...args)=>vm.runInContext(`(${fn})`,context)(...args);
async function main(){
    const acesso=context.ClasseOfflineAccess;

    await acesso.configurar(uid,'teste@example.org','senha-antiga-123456');
    assert.equal(await acesso.verificar(uid,'senha-antiga-123456'),true);

    await run('salvarSnapshotVersionado',{usuario_id:uid,salvo_em:'2026-11-10T00:00:00Z',
        turmas:[{id:'a',nome:'A'}],alunos:[{id:'b',nome_completo:'Aluno'}],frequencias:[]});

    const id=await run('salvarOffline',{usuario_id:uid,dados:{turma_id:'a',aluno_id:'b',data:'2026-11-10',presente:true,revision:0}});
    await run('salvarEdicaoOffline',{usuario_id:uid,chave:uid+':turmas:a',tipo:'turmas',id:'a',dados:{nome:'Atualização'},estado:'pendente'});
    await run('salvarEdicaoAcademica',{usuario_id:uid,chave:uid+':nota:a',tipo:'nota',dados:{valor:7},estado:'pendente'});

    let a=await context.ClassePacotes.criar(uid,'Antes das mudanças');
    let lista=await context.ClassePacotes.listar(uid);
    assert.equal(lista.length,1);
    assert.equal(lista[0].totais.frequencia_pendente,1);
    assert.equal(lista[0].totais.edicoes_academicas,1);
    await run('salvarEdicaoAcademica',{usuario_id:uid,chave:uid+':nota:a',tipo:'nota',dados:{valor:9},estado:'pendente'});
    const diff=await context.ClassePacotes.comparar(uid,a.id);
    assert.equal(diff.find(x=>x.tipo==='edicoes_academicas').modificados,1);

    const backup=await context.ClassePacotes.restaurar(uid,a.id);
    assert.ok(backup.id);
    assert.equal((await run('listarEdicoesAcademicas',uid))[0].dados.valor,7);
    assert.equal((await context.ClassePacotes.listar(uid)).length,2);
    // Migração de senha antiga -> senha de login de 8 caracteres (antigo mínimo era 10).

    await acesso.configurar(uid,'teste@example.org','Abc12345','senha-antiga-123456');
    assert.equal(await acesso.verificar(uid,'Abc12345'),true);
    assert.equal(await acesso.verificar(uid,'senha-antiga-123456'),false);
    assert.equal((await run('getPendentes')).find(x=>x.id===id)?.dados.presente,true);
    assert.equal((await context.ClassePacotes.listar(uid)).length,2);
    assert.equal((await run('obterSnapshot',uid)).turmas[0].nome,'A');
    context.localStorage.setItem('classeapp:pacotes:limite:'+uid,'5');
    for(let i=0;i<6;i++)await run('salvarSnapshotVersionado',{usuario_id:uid,
        salvo_em:'2026-11-11T00:00:0'+i+'Z',turmas:[{id:'a',nome:'T'+i}],alunos:[]});
    assert.equal((await run('listarVersoesSnapshot',uid)).length,5);
    for(let i=0;i<7;i++)await context.ClassePacotes.criar(uid,'Pacote '+i);
    assert.equal((await context.ClassePacotes.listar(uid)).length,5);
    // Outra conta mantém sua própria fila, inclusive quando a primeira restaura pacotes.
    const outro='usuario-987654';
    await acesso.configurar(outro,'outra@example.org','SenhaTeste999');
    await run('salvarOffline',{usuario_id:outro,dados:{turma_id:'c',aluno_id:'d',data:'2026-11-11',presente:false,revision:0}});
    await acesso.verificar(uid,'Abc12345');
    await context.ClassePacotes.restaurar(uid,(await context.ClassePacotes.listar(uid))[1].id);
    await acesso.verificar(outro,'SenhaTeste999');
    context.CLASSE_USUARIO_ID=outro;
    assert.equal((await run('getPendentes')).filter(x=>x.usuario_id===outro).length,1);
    console.log('OK: criptografia, migração, limites, restauração e isolamento entre contas.');
}
main().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
