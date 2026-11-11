/* Avisos de aniversário no sino do menu.
 * Não grava nomes/datas de alunos em storage. Cache de contagem (10 min).
 */
(() => {
    'use strict';
    const sino = document.getElementById('notificacoes-sino');
    const badge = document.getElementById('notificacoes-sino-contador');
    const conta = document.documentElement.dataset.appearanceUser;
    if (!sino || !badge || !conta || conta === 'visitante') return;
    const cacheKey = `classeapp:aniversarios:contador:${conta}`;
    const ttlMs = 10 * 60 * 1000;
    function ocultos() {
        try { return JSON.parse(localStorage.getItem(`classeapp:notificacoes:dispensados:${conta}`) || '{}'); }
        catch (_) { return {}; }
    }
    function mostrar(contagem) {
        const n = Number.isInteger(contagem) ? Math.max(0, contagem) : 0;
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.hidden = n === 0;
        sino.title = n ? `${n} aniversário(s) próximo(s) — abrir notificações` : 'Notificações';
        sino.setAttribute('aria-label', sino.title);
    }
    function registrar(alertas) {
        const dispensados = ocultos();
        const hojeOuProximos = (Array.isArray(alertas) ? alertas : []).filter(a =>
            a && Number(a.dias) >= 0 && Number(a.dias) <= 7 && !dispensados[a.id]);
        const total = hojeOuProximos.length;
        mostrar(total);
        // Somente número e data local do cache; sem identificação de alunos.
        try { sessionStorage.setItem(cacheKey, JSON.stringify({total, ate: Date.now() + ttlMs,
            dia: new Date().toLocaleDateString('en-CA')})); } catch (_) {}
    }
    async function consultar() {
        // A página central faz a consulta completa e atualiza este indicador.
        if (document.getElementById('notificacoes')) return;
        try {
            const salvo = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
            if (salvo && salvo.ate > Date.now() &&
                salvo.dia === new Date().toLocaleDateString('en-CA')) {
                mostrar(salvo.total);
                return;
            }
        } catch (_) {}
        try {
            const r = await fetch('/api/notificacoes/resumo?dias=7', {
                cache: 'no-store', credentials: 'same-origin'
            });
            if (!r.ok) return;
            const dados = await r.json();
            registrar(dados.alertas);
        } catch (_) { /* Sem internet: não exibir contagem desconhecida. */ }
    }
    window.ClasseNotificacoes = {registrar, mostrar, consultar};
    window.addEventListener('storage', evento => {
        if (evento.key === `classeapp:notificacoes:dispensados:${conta}`) {
            try { sessionStorage.removeItem(cacheKey); } catch (_) {}
            consultar();
        }
    });
    consultar();
})();
