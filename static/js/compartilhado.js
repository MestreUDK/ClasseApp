// static/js/compartilhado.js

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form-abrir-codigo');
    const inputCodigo = document.getElementById('codigo');

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        const codigo = inputCodigo.value.trim().toUpperCase();

        if (!codigo) {
            alert('Digite um código válido.');
            return;
        }

        window.location.href = `/compartilhado/${codigo}`;
    });
});