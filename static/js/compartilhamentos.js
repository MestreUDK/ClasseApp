// static/js/compartilhamentos.js

const TURMA_ID = window.location.pathname.split('/')[2];

let els = {};

document.addEventListener('DOMContentLoaded', () => {
    els = {
        form: document.getElementById('form-compartilhar'),

        compartilharAlunos: document.getElementById('compartilhar-alunos'),
        compartilharFrequencia: document.getElementById('compartilhar-frequencia'),
        compartilharNotas: document.getElementById('compartilhar-notas'),
        compartilharDiario: document.getElementById('compartilhar-diario'),

        permiteCopia: document.getElementById('permite-copia'),

        resultado: document.getElementById('resultado-compartilhamento'),
        codigoGerado: document.getElementById('codigo-gerado'),

        btnCopiar: document.getElementById('btn-copiar'),
        btnWhatsapp: document.getElementById('btn-whatsapp'),

        lista: document.getElementById('lista-compartilhamentos')
    };

    els.form.addEventListener('submit', criarCompartilhamento);
    els.btnCopiar.addEventListener('click', copiarCodigo);
    els.btnWhatsapp.addEventListener('click', compartilharWhatsapp);

    carregarCompartilhamentos();
});

async function criarCompartilhamento(e) {
    e.preventDefault();

    try {
        const response = await fetch(
            `/api/compartilhamentos/turma/${TURMA_ID}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    permissao: 'visualizar',

                    permite_copia: els.permiteCopia.checked,

                    compartilhar_alunos:
                        els.compartilharAlunos.checked,

                    compartilhar_frequencia:
                        els.compartilharFrequencia.checked,

                    compartilhar_notas:
                        els.compartilharNotas.checked,

                    compartilhar_diario:
                        els.compartilharDiario.checked
                })
            }
        );

        const dados = await response.json();

        if (!response.ok) {
            throw new Error(
                dados.error || 'Erro ao gerar compartilhamento.'
            );
        }

        els.resultado.style.display = 'block';
        els.codigoGerado.textContent = dados.codigo;

        carregarCompartilhamentos();

        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });

    } catch (error) {
        console.error(error);
        alert(error.message);
    }
}

async function carregarCompartilhamentos() {
    try {
        const response = await fetch('/api/compartilhamentos');

        const lista = await response.json();

        if (!response.ok) {
            throw new Error(
                lista.error || 'Erro ao carregar compartilhamentos.'
            );
        }

        renderizarCompartilhamentos(lista);

    } catch (error) {
        console.error(error);

        els.lista.innerHTML = `
            <p style="color:red;">
                ${escapeHTML(error.message)}
            </p>
        `;
    }
}

function renderizarCompartilhamentos(lista) {
    els.lista.innerHTML = '';

    if (!Array.isArray(lista) || lista.length === 0) {
        els.lista.innerHTML = `
            <p style="color:#777;">
                Nenhum compartilhamento criado.
            </p>
        `;
        return;
    }

    lista.forEach(comp => {
        const card = document.createElement('div');

        card.className = 'dash-card comp-card';

        card.innerHTML = `
            <div class="comp-codigo">
                ${escapeHTML(comp.codigo)}
            </div>

            <div class="comp-tags">
                ${comp.compartilhar_alunos
                    ? '<span class="tag-comp">Alunos</span>'
                    : ''}

                ${comp.compartilhar_frequencia
                    ? '<span class="tag-comp">Frequência</span>'
                    : ''}

                ${comp.compartilhar_notas
                    ? '<span class="tag-comp">Notas</span>'
                    : ''}

                ${comp.compartilhar_diario
                    ? '<span class="tag-comp">Diário</span>'
                    : ''}

                ${comp.permite_copia
                    ? '<span class="tag-comp">Permite cópia</span>'
                    : ''}
            </div>

            <button
                class="btn-danger"
                onclick="desativarCompartilhamento('${comp.id}')"
            >
                Desativar
            </button>
        `;

        els.lista.appendChild(card);
    });
}

window.desativarCompartilhamento = async function(id) {
    if (!confirm('Deseja desativar este compartilhamento?')) {
        return;
    }

    try {
        const response = await fetch(
            `/api/compartilhamentos/${id}/desativar`,
            {
                method: 'POST'
            }
        );

        const dados = await response.json();

        if (!response.ok) {
            throw new Error(
                dados.error || 'Erro ao desativar.'
            );
        }

        carregarCompartilhamentos();

    } catch (error) {
        console.error(error);
        alert(error.message);
    }
};

async function copiarCodigo() {
    try {
        await navigator.clipboard.writeText(
            els.codigoGerado.textContent
        );

        alert('Código copiado!');

    } catch {
        alert('Não foi possível copiar.');
    }
}

function compartilharWhatsapp() {
    const codigo = els.codigoGerado.textContent;

    const texto = encodeURIComponent(
        `Código de compartilhamento da turma:\n\n${codigo}`
    );

    window.open(
        `https://wa.me/?text=${texto}`,
        '_blank'
    );
}

function escapeHTML(valor) {
    if (valor === null || valor === undefined) {
        return '';
    }

    return String(valor)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}