/* Acesso local por senha, sem credenciais Supabase.
 * O verificador é protegido por PBKDF2 + AES-GCM, mas os dados acadêmicos
 * existentes no IndexedDB NÃO são criptografados nesta versão.
 */
(() => {
    'use strict';

    const MARCADOR = 'ClasseApp:acesso-local:v1:';
    const ITERACOES = 310000;
    const encoder = new TextEncoder();
    let desbloqueado = null; // somente memória da aba; nunca persistir autorização

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
        const material = await crypto.subtle.importKey('raw', encoder.encode(senha), 'PBKDF2', false,
            ['deriveKey']);
        return crypto.subtle.deriveKey(
            {name: 'PBKDF2', salt: sal, iterations: iteracoes, hash: 'SHA-256'},
            material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
    }
    function exigirCriptografia() {
        if (!window.isSecureContext || !crypto?.subtle || !crypto.getRandomValues) {
            throw new Error('A configuração exige HTTPS e um navegador com Web Crypto.');
        }
    }
    async function configurar(usuarioId, identificacao, senha) {
        exigirCriptografia();
        if (!valido(usuarioId) || typeof senha !== 'string' || senha.length < 10 ||
            senha.length > 128) throw new Error('Use uma senha local entre 10 e 128 caracteres.');
        // A rota do Perfil é autenticada; só permitir configurar uma conta que
        // já possua cópia baixada neste dispositivo.
        const copia = await obterSnapshot(usuarioId);
        if (!copia || !Array.isArray(copia.turmas) || !Array.isArray(copia.alunos)) {
            throw new Error('Baixe primeiro uma cópia de seus dados em “Baixar da nuvem”.');
        }
        const sal = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const chave = await derivar(senha, sal, ITERACOES);
        const check = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, chave,
            encoder.encode(MARCADOR + usuarioId));
        await salvarAcessoOffline({
            usuario_id: usuarioId,
            identificacao: String(identificacao || 'Conta offline').slice(0, 150),
            sal: base64(sal),
            iv: base64(iv),
            verificador: base64(new Uint8Array(check)),
            iteracoes: ITERACOES,
            criado_em: new Date().toISOString()
        });
    }
    async function verificar(usuarioId, senha) {
        exigirCriptografia();
        if (!valido(usuarioId) || typeof senha !== 'string' || senha.length > 128) return false;
        const perfil = await obterAcessoOffline(usuarioId);
        if (!perfil || !Number.isInteger(perfil.iteracoes) || perfil.iteracoes < 200000 ||
            perfil.iteracoes > 1000000) return false;
        try {
            const chave = await derivar(senha, bytes64(perfil.sal), perfil.iteracoes);
            const valor = await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes64(perfil.iv)},
                chave, bytes64(perfil.verificador));
            return new TextDecoder().decode(valor) === MARCADOR + usuarioId;
        } catch (_) { return false; }
    }
    function estaDesbloqueado(usuarioId) {
        return Boolean(desbloqueado && desbloqueado === usuarioId);
    }
    function bloquear() {
        desbloqueado = null;
        document.dispatchEvent(new Event('classeapp:offline:bloqueado'));
        const gate = document.getElementById('offline-desbloqueio');
        if (gate) {
            gate.hidden = false;
            const senha = document.getElementById('offline-desbloqueio-senha');
            if (senha) senha.value = '';
            document.getElementById('offline-desbloqueio-status').textContent = 'Acesso bloqueado.';
        }
    }
    window.ClasseOfflineAccess = {configurar, verificar, estaDesbloqueado, bloquear};

    function iniciarPerfil() {
        const painel = document.getElementById('offline-acesso');
        if (!painel) return;
        const usuario = painel.dataset.userId;
        const email = painel.dataset.userEmail;
        const form = document.getElementById('offline-acesso-form');
        const senha = document.getElementById('offline-acesso-senha');
        const confirmar = document.getElementById('offline-acesso-confirmar');
        const estado = document.getElementById('offline-acesso-estado');
        const botao = document.getElementById('offline-acesso-salvar');
        async function atualizar() {
            try {
                const [copia, perfil] = await Promise.all([
                    obterSnapshot(usuario), obterAcessoOffline(usuario)
                ]);
                botao.disabled = !copia;
                botao.textContent = perfil ? 'Substituir senha local' : 'Ativar acesso offline';
                estado.textContent = (perfil ? 'Acesso local já configurado para esta conta. ' :
                    'Acesso local ainda não configurado. ') +
                    (copia ? 'Sua cópia está pronta para uso neste dispositivo.' :
                        'Baixe primeiro seus dados na seção abaixo.');
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
                await configurar(usuario, email, senha.value);
                senha.value = '';
                confirmar.value = '';
                estado.textContent = 'Senha local configurada. Feche o aplicativo e abra /offline para testar.';
                botao.textContent = 'Substituir senha local';
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
                const copia = await obterSnapshot(usuarioId);
                if (!copia) {
                    status.textContent = 'A cópia desta conta foi apagada. Conecte-se e baixe os dados novamente.';
                    return;
                }
                falhas = 0;
                desbloqueado = usuarioId;
                gate.hidden = true;
                document.dispatchEvent(new CustomEvent('classeapp:offline:desbloqueado',
                    {detail: {usuarioId}}));
            } catch (error) {
                status.textContent = 'Não foi possível desbloquear neste navegador. ' +
                    (error?.message || '');
            } finally { botao.disabled = !select.options.length; }
        });
        // Uma nova abertura do aplicativo exige a senha novamente.
        window.addEventListener('pagehide', bloquear);
        window.addEventListener('pageshow', event => { if (event.persisted) bloquear(); });
    }

    iniciarPerfil();
    iniciarPorta();
})();
