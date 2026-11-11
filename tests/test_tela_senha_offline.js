/* Regressão de interface: campo da senha antiga só na migração ou na troca da senha da conta.
 * Execute: node tests/test_tela_senha_offline.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
function elemento(extra={}) {
    const handlers = {};
    return {dataset:{}, value:'', disabled:false, required:false, hidden:false,
        textContent:'', options:[], style:{map:{},setProperty(k,v){this.map[k]=v;}},
        addEventListener(type,fn){handlers[type]=fn;},
        setAttribute(name,value){this[name]=value;},
        focus(){this.focado=true;},
        async trigger(type, event={preventDefault(){}}){return handlers[type]?.(event);},
        ...extra};
}
async function testar(perfil) {
    const ids = ['offline-acesso','offline-acesso-form','offline-acesso-senha',
        'offline-acesso-confirmar','offline-acesso-estado','offline-acesso-atual',
        'offline-acesso-atual-box','offline-acesso-atual-titulo','offline-acesso-atual-ajuda',
        'offline-acesso-troca-senha','offline-acesso-salvar',
        'offline-acesso-desbloquear','offline-acesso-desbloqueio-senha',
        'offline-acesso-bloquear','offline-acesso-prazo','offline-acesso-sessao'];
    const elementos=Object.fromEntries(ids.map(id=>[id,elemento()]));
    elementos['offline-acesso'].dataset={userId:'usuario-12345',userEmail:'teste@exemplo.org',csrfToken:'x'};
    const storage=()=>({getItem:()=>null,setItem:()=>{},removeItem:()=>{}});
    const ctx={window:null,document:{getElementById:id=>elementos[id]||null,
        addEventListener(){},dispatchEvent(){}},isSecureContext:true,
        navigator:{onLine:true}, crypto:webcrypto, TextEncoder,TextDecoder, Uint8Array,
        Map, Promise,Number,Date,JSON,localStorage:storage(),sessionStorage:storage(),
        setInterval:()=>0,BroadcastChannel:undefined,Event:class Event{},
        obterAcessoOffline:async()=>perfil,
        obterSnapshot:async()=>null};
    ctx.window=ctx;vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('static/js/offline_access.js','utf8'),ctx);
    await new Promise(resolve=>setImmediate(resolve));
    return elementos;
}
(async()=>{
    const novo=await testar(null);
    assert.equal(novo['offline-acesso-atual-box'].hidden,true);
    assert.equal(novo['offline-acesso-troca-senha'].hidden,true);
    const antigo=await testar({sal:'sal',verificador:'cifra'});
    assert.equal(antigo['offline-acesso-atual-box'].hidden,false);
    assert.equal(antigo['offline-acesso-troca-senha'].hidden,true);
    assert.match(antigo['offline-acesso-atual-titulo'].textContent,/senha local antiga/i);
    const migrado=await testar({sal:'sal',verificador:'cifra',modo_senha:'login'});
    assert.equal(migrado['offline-acesso-atual-box'].hidden,true);
    assert.equal(migrado['offline-acesso-troca-senha'].hidden,false);
    await migrado['offline-acesso-troca-senha'].trigger('click');
    assert.equal(migrado['offline-acesso-atual-box'].hidden,false);
    assert.equal(migrado['offline-acesso-atual'].required,true);
    assert.match(migrado['offline-acesso-atual-titulo'].textContent,/senha de login anterior/i);
    await migrado['offline-acesso-troca-senha'].trigger('click');
    assert.equal(migrado['offline-acesso-atual-box'].hidden,true);
    assert.equal(migrado['offline-acesso-atual'].required,false);
    console.log('OK: novo, legado, migrado e troca de senha da conta.');
})().catch(err=>{console.error(err);process.exitCode=1;});
