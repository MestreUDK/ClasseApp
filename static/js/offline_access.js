/* Acesso local protegido por senha. A chave AES permanece em memória e, quando
 * o professor autoriza, seu material derivado é conservado TEMPORARIAMENTE na
 * sessionStorage desta aba (nunca no localStorage/IndexedDB). É um equilíbrio
 * explícito de conveniência: scripts da mesma origem podem ler a sessão.
 * A senha original e tokens do Supabase nunca são armazenados aqui.
 */
(() => {
    'use strict';

    const MARCADOR = 'ClasseApp:acesso-local:v1:';
    const ITERACOES = 310000;
    const SESSAO_CHAVE = 'classeapp:cofre:temporario:v1';
    const PRAZO_CHAVE = 'classeapp:cofre:prazo:v1:';
    const PRAZOS = [0, 5, 15, 30, 60];
    const PRAZO_PADRAO = 30;
    const encoder = new TextEncoder();
    let desbloqueado = null;
    const chaves = new Map(); // Chaves não extraíveis em memória + vencimento
    const desbloqueiosEmCurso = new Map();
    function prazo(usuarioId) {
        try {
            const salvo = localStorage.getItem(PRAZO_CHAVE + usuarioId);
            if (salvo === null) return PRAZO_PADRAO;
            const numero = Number(salvo);
            return PRAZOS.includes(numero) ? numero : PRAZO_PADRAO;
        } catch (_) { return PRAZO_PADRAO; }
    }
    function definirPrazo(usuarioId, minutos) {
        if (!valido(usuarioId) || !PRAZOS.includes(Number(minutos))) {
            throw new Error('Prazo de desbloqueio inválido.');
        }
        localStorage.setItem(PRAZO_CHAVE + usuarioId, String(minutos));
        const sessao = lerSessao();
        if (sessao?.usuario_id === usuarioId) {
            // Alterações de prazo nunca prorrogam um desbloqueio anterior.
            if (!minutos) apagarSessao();
            else {
                sessao.expira_em = Math.min(sessao.expira_em,
                    sessao.criado_em + Number(minutos) * 60000);
                if (sessao.expira_em <= Date.now()) apagarSessao();
                else sessionStorage.setItem(SESSAO_CHAVE, JSON.stringify(sessao));
            }
        }
        const entrada = chaves.get(usuarioId);
        if (entrada && entrada.expira_em !== Infinity) {
            entrada.expira_em = minutos ? Math.min(entrada.expira_em,
                entrada.criado_em + Number(minutos) * 60000) : Date.now();
        }
    }
    function lerSessao() {
        try { return JSON.parse(sessionStorage.getItem(SESSAO_CHAVE) || 'null'); }
        catch (_) { apagarSessao(); return null; }
    }
    function apagarSessao() {
        try { sessionStorage.removeItem(SESSAO_CHAVE); } catch (_) { /* fechado */ }
    }
    function gravarSessao(usuarioId, material, perfil) {
        const minutos = prazo(usuarioId);
        apagarSessao();
        const agora = Date.now();
        const expira = minutos ? agora + minutos * 60000 : Infinity;
        chaves.set(usuarioId, {chave: material.chave, criado_em: agora,
            expira_em: expira});
        if (minutos) {
            try {
                sessionStorage.setItem(SESSAO_CHAVE, JSON.stringify({
                    usuario_id: usuarioId, material: base64(material.bytes),
                    sal: perfil.sal, criado_em: agora, expira_em: expira
                }));
            } catch (_) { /* Mantém somente a chave em memória nesta página. */ }
        }
    }
    async function restaurarSessao(usuarioId) {
        const sessao = lerSessao();
        if (!sessao) return null;
        if (!valido(sessao.usuario_id) || !Number.isFinite(sessao.expira_em) ||
            !Number.isFinite(sessao.criado_em) || sessao.expira_em <= Date.now() ||
            sessao.expira_em - sessao.criado_em > 3600000 ||
            !PRAZOS.includes(prazo(sessao.usuario_id)) || !prazo(sessao.usuario_id)) {
            apagarSessao(); return null;
        }
        if (sessao.usuario_id !== usuarioId) return null;
        try {
            const perfil = await obterAcessoOffline(usuarioId);
            if (!perfil || sessao.sal !== perfil.sal) { apagarSessao(); return null; }
            const bytes = bytes64(sessao.material);
            if (bytes.length !== 32) { apagarSessao(); return null; }
            const chave = await crypto.subtle.importKey('raw', bytes,
                {name:'AES-GCM'}, false, ['encrypt','decrypt']);
            const check = await crypto.subtle.decrypt({name:'AES-GCM',
                iv:bytes64(perfil.iv)}, chave, bytes64(perfil.verificador));
            if (new TextDecoder().decode(check) !== MARCADOR + usuarioId) {
                apagarSessao(); return null;
            }
            chaves.set(usuarioId, {chave, criado_em:sessao.criado_em,
                expira_em:sessao.expira_em});
            return chave;
        } catch (_) { apagarSessao(); return null; }
    }
    function chaveNaMemoria(usuarioId) {
        const entrada = chaves.get(usuarioId);
        if (!entrada) return null;
        if (Date.now() >= entrada.expira_em) {
            chaves.delete(usuarioId);
            if (lerSessao()?.usuario_id === usuarioId) apagarSessao();
            if (desbloqueado === usuarioId) bloquear();
            return null;
        }
        return entrada.chave;
    }
    // A troca de senha invalida a chave antiga nas demais abas abertas.
    const canal = typeof BroadcastChannel === 'function' ?
        new BroadcastChannel('classeapp-cofre-local') : null;
    if (canal) canal.onmessage = event => {
        const dado = event.data || {};
        if (dado.tipo !== 'senha-alterada' || !valido(dado.usuario_id)) return;
        chaves.delete(dado.usuario_id);
        if (lerSessao()?.usuario_id === dado.usuario_id) apagarSessao();
        if (desbloqueado === dado.usuario_id) bloquear();
    };

    function base64(bytes) {
        return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
    }
    function bytes64(value) {
        const raw = atob(value);
        return Uint8Array.from(raw, c => c.charCodeAt(0));
    }
    function valido(usuarioId) {
        return typeof usuarioId === 'string' && usuarioId.length >= 8 && usuarioId.length < 200;
    }
    async function derivar(senha, sal, iteracoes) {
        const material = await crypto.subtle.importKey('raw', encoder.encode(senha),
            'PBKDF2', false, ['deriveBits']);
        const bytes = new Uint8Array(await crypto.subtle.deriveBits(
            {name:'PBKDF2', salt: sal, iterations:iteracoes, hash:'SHA-256'},
            material, 256));
        const chave = await crypto.subtle.importKey('raw', bytes,
            {name:'AES-GCM'}, false, ['encrypt','decrypt']);
        return {chave, bytes};
    }
    function exigirCriptografia() {
        if (!window.isSecureContext || !crypto?.subtle || !crypto.getRandomValues) {
            throw new Error('A configuração exige HTTPS e um navegador com Web Crypto.');
        }
    }
    async function chaveValidada(usuarioId, senha, perfil) {
        if (!perfil || !Number.isInteger(perfil.iteracoes) || perfil.iteracoes < 200000 ||
            perfil.iteracoes > 1000000) return null;
        try {
            const material = await derivar(senha, bytes64(perfil.sal), perfil.iteracoes);
            const decifrado = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes64(perfil.iv)},
                material.chave,bytes64(perfil.verificador));
            return new TextDecoder().decode(decifrado) === MARCADOR + usuarioId ? material : null;
        } catch (_) {return null;}
    }
    async function configurar(usuarioId, identificacao, senha, senhaAntiga = '') {
        exigirCriptografia();
        if (!valido(usuarioId) || typeof senha !== 'string' || senha.length < 10 ||
            senha.length > 128) throw new Error('Use uma senha local entre 10 e 128 caracteres.');
        const anterior = await obterAcessoOffline(usuarioId);
        let chaveAntiga = null;
        if (anterior) {
            const anteriorValidado = await chaveValidada(usuarioId,senhaAntiga,anterior);
            if (!anteriorValidado) throw new Error('Para trocar a senha local, informe a senha anterior correta.');
            chaveAntiga = anteriorValidado.chave;
            await window.ClasseVault.migrarLegado(usuarioId,chaveAntiga);
            chaves.set(usuarioId, {chave:chaveAntiga, criado_em:Date.now(), expira_em:Infinity});
        }
        // Pode ser configurada ANTES do primeiro download, evitando que dados
        // sensíveis novos sejam gravados sem criptografia.
        const sal = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const novoMaterial = await derivar(senha, sal, ITERACOES);
        const novaChave = novoMaterial.chave;
        const check = await crypto.subtle.encrypt({name:'AES-GCM',iv},novaChave,
            encoder.encode(MARCADOR+usuarioId));
        const perfil = {
            usuario_id:usuarioId, identificacao:String(identificacao || 'Conta offline').slice(0,150),
            sal:base64(sal),iv:base64(iv),verificador:base64(new Uint8Array(check)),
            iteracoes:ITERACOES,criado_em:new Date().toISOString()
        };
        // Cifra todas as cópias, versões e operações em uma única transação.
        // Só grava o novo verificador se toda a migração tiver sucesso.
        await window.ClasseVault.trocarSenha(usuarioId,chaveAntiga,novaChave,perfil);
        chaves.clear();
        gravarSessao(usuarioId, novoMaterial, perfil);
        canal?.postMessage({tipo:'senha-alterada',usuario_id:usuarioId});
    }
    async function verificar(usuarioId, senha) {
        exigirCriptografia();
        if (!valido(usuarioId) || typeof senha !== 'string' || senha.length > 128) return false;
        const perfil = await obterAcessoOffline(usuarioId);
        const material = await chaveValidada(usuarioId,senha,perfil);
        if (!material) return false;
        // A migração não apaga os registros caso falhe.
        await window.ClasseVault.migrarLegado(usuarioId,material.chave);
        chaves.clear();
        gravarSessao(usuarioId, material, perfil);
        return true;
    }
    function obterChave(usuarioId) { return chaveNaMemoria(usuarioId); }
    async function solicitarDesbloqueio(usuarioId) {
        const memorizada = obterChave(usuarioId);
        if (memorizada) return memorizada;
        if (desbloqueiosEmCurso.has(usuarioId)) return desbloqueiosEmCurso.get(usuarioId);
        const promessa = (async()=>{
            const restaurada = await restaurarSessao(usuarioId);
            if (restaurada) return restaurada;
            // Não interromper páginas online com prompts ao carregar os painéis.
            // A chave é necessária para ler o cofre: o usuário pode desbloquear
            // explicitamente no Perfil. Já no modo offline, o portão pede a senha.
            if (navigator.onLine) throw new Error(
                'Cofre local bloqueado. Use “Desbloquear dados locais” no Perfil.');
            const senha=window.prompt('Informe a senha LOCAL para acessar os dados offline deste dispositivo:');
            if (!senha) throw new Error('Dados locais bloqueados. Informe sua senha local para continuar.');
            if (!await verificar(usuarioId,senha)) throw new Error('Senha local incorreta. Nenhum dado foi alterado.');
            return obterChave(usuarioId);
        })();
        desbloqueiosEmCurso.set(usuarioId,promessa);
        try {return await promessa;} finally {desbloqueiosEmCurso.delete(usuarioId);}
    }
    function usuarioDesbloqueado(){return desbloqueado && obterChave(desbloqueado) ? desbloqueado : null;}
    function estaDesbloqueado(usuarioId) {
        return Boolean(desbloqueado && desbloqueado === usuarioId && obterChave(usuarioId));
    }
    function bloquear() {
        desbloqueado = null;
        chaves.clear();
        apagarSessao();
        document.dispatchEvent(new Event('classeapp:offline:bloqueado'));
        const gate = document.getElementById('offline-desbloqueio');
        if (gate) {
            gate.hidden = false;
            const senha = document.getElementById('offline-desbloqueio-senha');
            if (senha) senha.value = '';
            document.getElementById('offline-desbloqueio-status').textContent = 'Acesso bloqueado.';
        }
    }
    window.ClasseOfflineAccess = {configurar, verificar, estaDesbloqueado, bloquear,
        obterChave, solicitarDesbloqueio, usuarioDesbloqueado, definirPrazo, prazo};
    // Bloqueio por tempo absoluto, mesmo que o usuário deixe a aba aberta.
    setInterval(() => {
        for (const usuarioId of chaves.keys()) obterChave(usuarioId);
    }, 15000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) for (const usuarioId of chaves.keys()) obterChave(usuarioId);
    });

    function iniciarPerfil() {
        const painel = document.getElementById('offline-acesso');
        if (!painel) return;
        const usuario = painel.dataset.userId;
        const email = painel.dataset.userEmail;
        const form = document.getElementById('offline-acesso-form');
        const senha = document.getElementById('offline-acesso-senha');
        const confirmar = document.getElementById('offline-acesso-confirmar');
        const estado = document.getElementById('offline-acesso-estado');
        const atualSenha = document.getElementById('offline-acesso-atual');
        const atualBox = document.getElementById('offline-acesso-atual-box');
        const botao = document.getElementById('offline-acesso-salvar');
        const botaoDesbloquear = document.getElementById('offline-acesso-desbloquear');
        const botaoBloquear = document.getElementById('offline-acesso-bloquear');
        const prazoSelect = document.getElementById('offline-acesso-prazo');
        const estadoSessao = document.getElementById('offline-acesso-sessao');
        if (prazoSelect) {
            prazoSelect.value = String(prazo(usuario));
            prazoSelect.addEventListener('change', () => {
                try { definirPrazo(usuario, Number(prazoSelect.value)); estadoDaSessao(); }
                catch (erro) { estadoSessao.textContent = erro.message; }
            });
        }
        function estadoDaSessao() {
            const disponivel = Boolean(obterChave(usuario));
            if (estadoSessao) estadoSessao.textContent = disponivel ?
                'Dados locais desbloqueados nesta aba por tempo limitado.' :
                'Dados locais bloqueados. Isso não interfere no seu login online.';
            if (botaoBloquear) botaoBloquear.disabled = !disponivel;
        }
        botaoDesbloquear?.addEventListener('click', async () => {
            const tentativa = window.prompt('Digite sua senha local para desbloquear os dados deste dispositivo:');
            if (!tentativa) return;
            botaoDesbloquear.disabled = true;
            try {
                if (!await verificar(usuario, tentativa)) throw new Error('Senha local incorreta.');
                estadoDaSessao();
                estado.textContent = 'Cofre desbloqueado. Agora pode usar cópias e sincronização sem repetir a senha nesta aba, até vencer o prazo.';
                document.dispatchEvent(new Event('classeapp:cofre:liberado'));
                // Atualiza todos os painéis sem deixar erros antigos de cofre bloqueado.
                window.location.reload();
            } catch (erro) { estado.textContent = erro.message; }
            finally { botaoDesbloquear.disabled = false; }
        });
        botaoBloquear?.addEventListener('click', () => { bloquear(); estadoDaSessao(); });
        async function atualizar() {
            try {
                const perfil = await obterAcessoOffline(usuario);
                if (perfil && !obterChave(usuario)) await restaurarSessao(usuario);
                const fechado = Boolean(perfil && !obterChave(usuario));
                const copia = fechado ? null : await obterSnapshot(usuario);
                botao.disabled = false;
                botao.textContent = perfil ? 'Trocar senha e recriptografar' : 'Ativar proteção e criptografar';
                if (atualBox) { atualBox.hidden = !perfil; atualBox.style.setProperty('display',perfil?'grid':'none','important'); }
                if (atualSenha) atualSenha.required = Boolean(perfil);
                estadoDaSessao();
                estado.textContent = (perfil ? 'Acesso local já configurado para esta conta. ' :
                    'Acesso local ainda não configurado. ') +
                    (fechado ? 'Os dados locais estão criptografados. Clique em “Desbloquear dados locais” somente quando precisar usá-los.' :
                        copia ? 'Sua cópia está pronta para uso neste dispositivo.' :
                            'Após ativar a proteção, baixe seus dados na seção abaixo.');
            } catch (_) {
                estado.textContent = 'Não foi possível consultar o acesso local neste navegador.';
            }
        }
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (botao.disabled) return;
            if (senha.value !== confirmar.value) {
                estado.textContent = 'As senhas locais não coincidem.';
                return;
            }
            botao.disabled = true;
            estado.textContent = 'Configurando acesso local neste dispositivo...';
            try {
                await configurar(usuario, email, senha.value, atualSenha?.value || '');
                senha.value = '';
                confirmar.value = '';
                if (atualSenha) atualSenha.value = '';
                estado.textContent = 'Dados criptografados. O cofre já está desbloqueado temporariamente nesta aba.';
                estadoDaSessao();
                botao.textContent = 'Trocar senha e recriptografar';
            } catch (error) {
                estado.textContent = error?.message || 'Falha ao configurar senha local.';
            } finally { botao.disabled = false; }
        });
        document.addEventListener('classeapp:snapshot:atualizado', atualizar);
        atualizar();
    }
    async function iniciarPorta() {
        const gate = document.getElementById('offline-desbloqueio');
        if (!gate) return;
        const select = document.getElementById('offline-desbloqueio-conta');
        const senha = document.getElementById('offline-desbloqueio-senha');
        const status = document.getElementById('offline-desbloqueio-status');
        const form = document.getElementById('offline-desbloqueio-form');
        const botao = document.getElementById('offline-desbloqueio-botao');
        let falhas = 0;
        let bloqueadoAte = 0;
        async function abrirConta(usuarioId) {
            const copia = await obterSnapshot(usuarioId);
            if (!copia) {
                status.textContent = 'A cópia desta conta não existe. Baixe os dados pelo Perfil quando estiver online.';
                return false;
            }
            desbloqueado = usuarioId;
            gate.hidden = true;
            document.dispatchEvent(new CustomEvent('classeapp:offline:desbloqueado',
                {detail: {usuarioId}}));
            return true;
        }
        try {
            exigirCriptografia();
            const contas = await listarAcessosOffline();
            select.replaceChildren();
            for (const perfil of contas) {
                const option = document.createElement('option');
                option.value = perfil.usuario_id;
                option.textContent = perfil.identificacao || `Conta ${perfil.usuario_id.slice(0, 8)}`;
                select.append(option);
            }
            if (!contas.length) {
                botao.disabled = true;
                status.textContent = 'Nenhuma conta configurada. Conecte-se, faça login, baixe uma cópia e cadastre uma senha local no Perfil.';
            } else {
                status.textContent = 'A senha local não autentica no Supabase nem envia alterações à nuvem.';
                const sessao = lerSessao();
                const correspondente = contas.some(conta => conta.usuario_id === sessao?.usuario_id);
                if (correspondente) {
                    select.value = sessao.usuario_id;
                    if (await restaurarSessao(sessao.usuario_id)) {
                        await abrirConta(sessao.usuario_id);
                    }
                }
            }
        } catch (error) {
            botao.disabled = true;
            status.textContent = error.message || 'Não foi possível consultar as contas deste dispositivo.';
        }
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (botao.disabled) return;
            if (Date.now() < bloqueadoAte) {
                status.textContent = 'Muitas tentativas. Aguarde um pouco e tente novamente.';
                return;
            }
            const usuarioId = select.value;
            const tentativa = senha.value;
            senha.value = '';
            botao.disabled = true;
            status.textContent = 'Verificando a senha local...';
            try {
                const liberado = await verificar(usuarioId, tentativa);
                if (!liberado) {
                    falhas += 1;
                    if (falhas >= 5) bloqueadoAte = Date.now() + 30000;
                    status.textContent = falhas >= 5 ?
                        'Muitas tentativas incorretas. Aguarde 30 segundos.' : 'Senha local incorreta.';
                    return;
                }
                falhas = 0;
                await abrirConta(usuarioId);
            } catch (error) {
                status.textContent = 'Não foi possível desbloquear neste navegador. ' +
                    (error?.message || '');
            } finally { botao.disabled = !select.options.length; }
        });
        // Mudanças de página preservam a sessão somente até o prazo escolhido.
        // Ao retornar do cache do navegador, verificar a validade imediatamente.
        window.addEventListener('pageshow', () => {
            if (desbloqueado && !obterChave(desbloqueado)) bloquear();
        });
    }

    iniciarPerfil();
    iniciarPorta();
})();
