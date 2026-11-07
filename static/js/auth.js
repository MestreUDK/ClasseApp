/* Controles de senha das telas públicas do ClasseApp. */
(() => {
    'use strict';
    try { sessionStorage.removeItem('classeapp:offline:conta-aba'); } catch (_) {}

    document.querySelectorAll('[data-toggle-password]').forEach((button) => {
        const field = document.getElementById(button.dataset.togglePassword);
        if (!field) return;

        button.addEventListener('click', () => {
            const show = field.type === 'password';
            field.type = show ? 'text' : 'password';
            button.setAttribute('aria-pressed', String(show));
            button.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
            button.title = show ? 'Ocultar senha' : 'Mostrar senha';
            button.classList.toggle('is-visible', show);
        });
    });
})();
