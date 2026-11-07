/* Recuperação de senha via link temporário Supabase Auth (implicit flow). */
(() => {
    'use strict';
    const form = document.getElementById('reset-form');
    const message = document.getElementById('reset-message');
    if (!form || !message) return;

    const fragment = new URLSearchParams(window.location.hash.slice(1));
    let accessToken = fragment.get('access_token');
    const isRecovery = fragment.get('type') === 'recovery';
    const error = fragment.get('error_description') || fragment.get('error');

    // Nunca deixar tokens visíveis na URL nem guardá-los em localStorage.
    if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
    }

    function notify(text, category) {
        message.textContent = text;
        message.className = `auth-alert ${category}`;
    }

    if (error) {
        notify('O link não pôde ser validado. Solicite uma nova recuperação.', 'error');
        return;
    }
    if (!accessToken || !isRecovery) {
        notify('Link inválido ou expirado. Abra o link enviado para seu e-mail ou solicite outro.', 'error');
        return;
    }

    form.hidden = false;
    notify('Link recebido. Defina uma nova senha para sua conta.', 'info');
    const submitButton = document.getElementById('save-password');
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const password = document.getElementById('new-password').value;
        const confirmation = document.getElementById('confirm-password').value;
        if (password !== confirmation) {
            notify('As senhas não coincidem.', 'error');
            return;
        }
        if (password.length < 8) {
            notify('Use pelo menos 8 caracteres.', 'error');
            return;
        }
        submitButton.disabled = true;
        try {
            const response = await fetch(form.dataset.submitUrl, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'same-origin',
                cache: 'no-store',
                body: JSON.stringify({access_token: accessToken, password}),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar a senha.');
            form.reset();
            form.hidden = true;
            accessToken = null;
            notify(result.message || 'Senha atualizada. Faça login novamente.', 'success');
        } catch (error) {
            notify(error.message || 'Falha de conexão. Tente novamente.', 'error');
        } finally {
            submitButton.disabled = false;
        }
    });
})();
