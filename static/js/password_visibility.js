/**
 * Controles de visibilidade de senha para as telas internas do ClasseApp.
 * Nunca lê, transmite, persiste nem registra o valor dos campos.
 */
(() => {
    'use strict';

    const ICONE = `
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none"
             stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/>
            <circle cx="12" cy="12" r="2.7"/>
            <path class="password-visibility-slash" d="M3 21 21 3"/>
        </svg>`;

    function ativar(root = document) {
        // O login/cadastro já possuem o próprio botão de olho em auth.js.
        root.querySelectorAll('input[type="password"]:not([data-visibility-ready])')
            .forEach(input => {
                if (input.closest('.auth-password-wrap')) return;
                input.dataset.visibilityReady = 'true';

                const envoltorio = document.createElement('span');
                envoltorio.className = 'password-visibility-wrap';
                // Respeita o campo de desbloqueio do Perfil, que possui largura limitada.
                if (input.style.maxWidth) envoltorio.style.maxWidth = input.style.maxWidth;

                input.parentNode.insertBefore(envoltorio, input);
                envoltorio.append(input);

                const botao = document.createElement('button');
                botao.type = 'button';
                botao.className = 'password-visibility-button';
                botao.setAttribute('aria-label', 'Mostrar senha');
                botao.setAttribute('aria-pressed', 'false');
                botao.title = 'Mostrar senha';
                if (input.id) botao.setAttribute('aria-controls', input.id);
                botao.innerHTML = ICONE;

                botao.addEventListener('click', () => {
                    const visivel = input.type === 'password';
                    input.type = visivel ? 'text' : 'password';
                    botao.classList.toggle('is-visible', visivel);
                    botao.setAttribute('aria-label', visivel ? 'Ocultar senha' : 'Mostrar senha');
                    botao.setAttribute('aria-pressed', String(visivel));
                    botao.title = visivel ? 'Ocultar senha' : 'Mostrar senha';
                    // Devolve o foco ao campo sem selecionar ou alterar seu valor.
                    input.focus({preventScroll: true});
                });
                envoltorio.append(botao);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ativar(), {once: true});
    } else {
        ativar();
    }
    window.ClassePasswordVisibility = {ativar};
})();
