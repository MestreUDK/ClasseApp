/* Testes mínimos do indicador e central de aniversários sem navegador externo. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const BASE = path.resolve(__dirname, '..');

class Elemento {
    constructor(id='') {
        this.id=id;this.children=[];this.listeners={};this.dataset={};this.hidden=false;
        this.textContent='';this.value='7';this.disabled=false;this.title='';this.attributes={};
    }
    append(...itens){this.children.push(...itens);}
    replaceChildren(...itens){this.children=[...itens];}
    addEventListener(tipo,cb){this.listeners[tipo]=cb;}
    setAttribute(chave,valor){this.attributes[chave]=valor;}
    remove(){this.removed=true;}
    change(){this.listeners.change?.();}
    click(){this.listeners.click?.();}
}
const armazenamento=()=>{
    const dados=new Map();
    return {getItem:k=>dados.get(k)||null,setItem:(k,v)=>dados.set(k,String(v)),
        removeItem:k=>dados.delete(k),_dados:dados};
};
function montarContexto({pagina=false, falhar=false}={}) {
    const elementos=Object.fromEntries([
        'notificacoes-sino','notificacoes-sino-contador','notificacoes','notificacoes-lista',
        'notificacoes-estado','notificacoes-contador','notificacoes-atualizar',
        'notificacoes-periodo','notificacoes-fila-estado'
    ].map(id=>[id,new Elemento(id)]));
    if (!pagina) elementos.notificacoes=null;
    else elementos.notificacoes.dataset.userId='prof1';
    const alertas=[
        {id:'aniversario:1:2026',dias:0,nome:'Ana',data_formatada:'11/11',mensagem:'Ana faz aniversário hoje!'},
        {id:'aniversario:2:2026',dias:5,nome:'Bruna',data_formatada:'16/11',mensagem:'Bruna faz aniversário em 5 dias.'},
        {id:'aniversario:3:2026',dias:20,nome:'Carlos',data_formatada:'01/12',mensagem:'Carlos faz aniversário em 20 dias.'},
    ];
    const pedidos=[];
    const context={document:{getElementById:id=>elementos[id]??null,
             documentElement:{dataset:{appearanceUser:'prof1'}},createElement:tag=>new Elemento(tag)},
        window:{listeners:{},addEventListener(t,f){this.listeners[t]=f;}},
        localStorage:armazenamento(),sessionStorage:armazenamento(),Date,console,
        fetch:async url=>{pedidos.push(url);if(falhar) throw new Error('falha');
            return {ok:true,json:async()=>({alertas,total_alunos:5,alunos_com_nascimento:4})};},
        getPendentes:async()=>[{usuario_id:'prof1',id:1},{usuario_id:'prof2',id:2}],
    };
    context.window.ClasseNotificacoes=undefined;
    // O contexto `window` aponta para si; APIs globais ficam nele.
    context.window=context;
    context.addEventListener=()=>{};
    context.window.addEventListener=()=>{};
    return {context,elementos,pedidos};
}
async function flush(){for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));}
(async()=>{
    {
        const {context,elementos,pedidos}=montarContexto();
        vm.runInNewContext(fs.readFileSync(path.join(BASE,'static/js/notificacoes_nav.js'),'utf8'),context);
        await flush();
        assert.equal(pedidos.length,1);
        assert.equal(elementos['notificacoes-sino-contador'].textContent,'2');
        assert.equal(elementos['notificacoes-sino-contador'].hidden,false);
        const cache=context.sessionStorage._dados.get('classeapp:aniversarios:contador:prof1');
        assert.ok(!cache.includes('Ana') && !cache.includes('Bruna'));
    }
    {
        const {context,elementos,pedidos}=montarContexto({pagina:true});
        vm.runInNewContext(fs.readFileSync(path.join(BASE,'static/js/notificacoes_nav.js'),'utf8'),context);
        vm.runInNewContext(fs.readFileSync(path.join(BASE,'static/js/notificacoes.js'),'utf8'),context);
        await flush();
        assert.equal(pedidos.length,1,'A central consulta apenas uma vez (30 dias).');
        assert.ok(pedidos[0].endsWith('?dias=30'));
        assert.equal(elementos['notificacoes-lista'].children.length,2);
        assert.equal(elementos['notificacoes-sino-contador'].textContent,'2');
        assert.ok(elementos['notificacoes-fila-estado'].children[0].textContent.includes('1 registro'));
        elementos['notificacoes-periodo'].value='30';
        elementos['notificacoes-periodo'].change();
        assert.equal(elementos['notificacoes-lista'].children.length,3);
        const primeiro=elementos['notificacoes-lista'].children[0];
        primeiro.children[2].click();
        assert.equal(elementos['notificacoes-sino-contador'].textContent,'1');
        assert.equal(elementos['notificacoes-lista'].children.length,2);
        assert.ok(context.localStorage.getItem('classeapp:notificacoes:dispensados:prof1').includes('aniversario:1:2026'));
    }
    {
        const {context,elementos}=montarContexto({pagina:true,falhar:true});
        vm.runInNewContext(fs.readFileSync(path.join(BASE,'static/js/notificacoes_nav.js'),'utf8'),context);
        vm.runInNewContext(fs.readFileSync(path.join(BASE,'static/js/notificacoes.js'),'utf8'),context);
        await flush();
        assert.ok(elementos['notificacoes-estado'].textContent.includes('Não foi possível'));
    }
    console.log('OK: menu, filtros, dispensa, isolamento de fila, erro remoto');
})().catch(e=>{console.error(e);process.exitCode=1;});
