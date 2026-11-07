/* Preferências visuais por conta e dispositivo, sem consultar dados escolares. */
(function () {
    'use strict';

    const root = document.documentElement;
    const account = root.getAttribute('data-appearance-user') || 'visitante';
    const key = `classeapp:appearance:v1:${account}`;
    const allowed = {
        layout: ['classic', 'studio'],
        mode: ['system', 'light', 'dark'],
        accent: ['blue', 'green', 'purple', 'orange', 'teal', 'rose']
    };
    const defaults = {layout: 'classic', mode: 'system', accent: 'blue'};

    function readStorage(storageKey) {
        try { return localStorage.getItem(storageKey); }
        catch (_) { return null; }
    }

    function writeStorage(storageKey, value) {
        try { localStorage.setItem(storageKey, value); return true; }
        catch (_) { return false; }
    }

    function normalize(raw) {
        const input = raw && typeof raw === 'object' ? raw : {};
        const result = {};
        for (const field of Object.keys(defaults)) {
            result[field] = allowed[field].includes(input[field]) ? input[field] : defaults[field];
        }
        return result;
    }

    function readSettings() {
        const stored = readStorage(key);
        if (stored) {
            try { return normalize(JSON.parse(stored)); }
            catch (_) { /* Preferências inválidas não interrompem a página. */ }
        }
        // Mantém a preferência claro/escuro das versões anteriores na primeira utilização.
        const legacy = readStorage('theme');
        return {...defaults, mode: legacy === 'light' || legacy === 'dark' ? legacy : 'system'};
    }

    let settings = readSettings();
    const prefersDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function currentTheme() {
        return settings.mode === 'system' ? (prefersDark && prefersDark.matches ? 'dark' : 'light') : settings.mode;
    }

    function updateThemeIcons() {
        const moon = document.querySelector('#theme-toggle .moon');
        const sun = document.querySelector('#theme-toggle .sun');
        const button = document.getElementById('theme-toggle');
        if (moon) moon.style.display = currentTheme() === 'dark' ? 'none' : 'block';
        if (sun) sun.style.display = currentTheme() === 'dark' ? 'block' : 'none';
        if (button) {
            const next = currentTheme() === 'dark' ? 'claro' : 'escuro';
            button.setAttribute('aria-label', `Ativar tema ${next}`);
            button.title = `Ativar tema ${next}`;
        }
    }

    function reflectControls() {
        for (const field of Object.keys(defaults)) {
            const radio = document.querySelector(`input[name="appearance-${field}"][value="${settings[field]}"]`);
            if (radio) radio.checked = true;
        }
    }

    function apply() {
        root.dataset.theme = currentTheme();
        root.dataset.layout = settings.layout;
        root.dataset.accent = settings.accent;
        updateThemeIcons();
        reflectControls();
    }

    function save(next) {
        settings = normalize(next);
        const persisted = writeStorage(key, JSON.stringify(settings));
        apply();
        const status = document.getElementById('appearance-status');
        if (status) status.textContent = persisted ? 'Aparência salva neste dispositivo.' :
            'A aparência foi aplicada, mas o navegador não permitiu salvá-la.';
    }

    // Aplica antes da folha de estilos para evitar um clarão ao abrir a página.
    apply();

    function setup() {
        apply();
        const toggle = document.getElementById('theme-toggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                save({...settings, mode: currentTheme() === 'dark' ? 'light' : 'dark'});
            });
        }

        for (const field of Object.keys(defaults)) {
            document.querySelectorAll(`input[name="appearance-${field}"]`).forEach(radio => {
                radio.addEventListener('change', () => {
                    if (radio.checked) save({...settings, [field]: radio.value});
                });
            });
        }

        const reset = document.getElementById('appearance-reset');
        if (reset) reset.addEventListener('click', () => save(defaults));

        // Indica o item ativo no menu Estúdio, inclusive nas rotas internas das turmas.
        let section = location.pathname;
        if (section.startsWith('/turma/') || section.startsWith('/avaliacao/')) section = '/';
        else if (section.startsWith('/aluno/')) section = '/alunos';
        else if (section.startsWith('/compartilhado')) section = '/compartilhado';
        document.querySelectorAll('body > nav .links a').forEach(anchor => {
            if (anchor.getAttribute('href') === section) anchor.setAttribute('aria-current', 'page');
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, {once: true});
    else setup();

    if (prefersDark) {
        const onSystemChange = () => {
            if (settings.mode === 'system') apply();
        };
        if (prefersDark.addEventListener) prefersDark.addEventListener('change', onSystemChange);
        else if (prefersDark.addListener) prefersDark.addListener(onSystemChange);
    }

    window.addEventListener('storage', event => {
        if (event.key === key) { settings = readSettings(); apply(); }
    });
})();
