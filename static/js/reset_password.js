/* Recuperação do ClasseApp: token_hash (fluxo recomendado) e tokens legados. */
(() => {
    'use strict';

    const form = document.getElementById('reset-form');
    const message = document.getElementById('reset-message');
    if (!form || !message) return;

    // Supabase pode entregar uma sessão em #... (fluxo implícito) ou um
    // token_hash em ?... (template customizado, verificado no servidor).
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    let accessToken = fragment.get('access_token');
    let tokenHash = query.get('token_hash') || fragment.get('token_hash');
    const recoveryType = query.get('type') || fragment.get('type');
    const errorCode = query.get('error_code') || fragment.get('error_code');
    const linkError = query.get('error') || fragment.get('error');
    const hasCode = query.has('code') || fragment.has('code');

    // Limpar tokens da barra de endereços imediatamente; não os armazenar.
    // O token_hash na URL inicial pode aparecer nos logs do proxy; não o
    // incluir em URLs de outros serviços, analytics, nem em mensagens.
    if (window.location.search || window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
    }

    function notify(text, category) {
        message.textContent = text;
        message.className = `auth-alert ${category}`;
    }

    if (linkError) {
        const expired = errorCode === 'otp_expired' ||
            errorCode === 'otp_disabled' || linkError === 'access_denied';
        notify(expired ?
            'Este link expirou, já foi utilizado ou não pôde ser confirmado. Solicite outro.' :
            'Não foi possível validar o link de recuperação. Solicite outro.', 'error');
        return;
    }

    // Um auth code PKCE sem o code_verifier não pode ser convertido com
    // segurança: nunca tentar trocá-lo sem verificador.
    if (hasCode) {
        notify('Este link utiliza um formato incompatível com a recuperação atual. Solicite outro link.', 'error');
        return;
    }

    if (recoveryType !== 'recovery' || (!accessToken && !tokenHash)) {
        notify('Link inválido ou expirado. Abra um link recente enviado para seu e-mail ou solicite outro.', 'error');
        return;
    }

    // Exatamente uma credencial por solicitação: prefere token_hash quando
    // presente, para não confundir formatos de autenticação diferentes.
    if (tokenHash) accessToken = null;

    form.hidden = false;
    notify('Link de recuperação recebido. Escolha uma nova senha.', 'info');

    const submitButton = document.getElementById('save-password');
    let submitting = false;
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (submitting) return;

        const password = document.getElementById('new-password').value;
        const confirmation = document.getElementById('confirm-password').value;
        if (password !== confirmation) {
            notify('As senhas não coincidem.', 'error');
            return;
        }
        if (password.length < 8 || password.length > 256) {
            notify('A senha deve ter entre 8 e 256 caracteres.', 'error');
            return;
        }

        submitting = true;
        submitButton.disabled = true;
        try {
            const credentials = tokenHash ? {token_hash: tokenHash} : {access_token: accessToken};
            const response = await fetch(form.dataset.submitUrl, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'same-origin',
                cache: 'no-store',
                body: JSON.stringify({...credentials, password}),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Não foi possível atualizar a senha.');
            }
            form.reset();
            form.hidden = true;
            accessToken = null;
            tokenHash = null;
            notify(result.message || 'Senha atualizada! Faça login com a nova senha.', 'success');
        } catch (error) {
            notify(error.message || 'Falha de conexão. Tente novamente.', 'error');
        } finally {
            submitting = false;
            submitButton.disabled = false;
        }
    });
})();
