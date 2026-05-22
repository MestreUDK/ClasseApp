// static/js/compartilhamentos.js

const TURMA_ID = window.location.pathname.split('/')[2];

let els = {};
let ultimoCodigoGerado = '';
let ultimoLinkGerado = '';

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
        linkGerado: document.getElementById('link-gerado'),

        btnCopiar: document.getElementById('btn-copiar'),
        btnCopiarLink: document.getElementById('btn-copiar-link'),
        btnWhatsapp: document.getElementById('btn-whatsapp'),

        lista: document.getElementById('lista-compartilhamentos')
    };

    els.form.addEventListener('submit', criarCompartilhamento);
    els.btnCopiar.addEventListener('click', copiarCodigo);
    els.btnCopiarLink.addEventListener('click', copiarLinkGerado);
    els.btnWhatsapp.addEventListener('click', compartilharWhatsapp);

    carregarCompartilhamentos();
});

function montarLinkCompartilhamento(codigo) {
    return `${window.location.origin}/compartilhado/${codigo}`;
}

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
                    compartilhar_alunos: els.compartilharAlunos.checked,
                    compartilhar_frequencia: els.compartilharFrequencia.checked,
                    compartilhar_notas: els.compartilharNotas.checked,
                    compartilhar_diario: els.compartilharDiario.checked
                })
            }
        );

        const dados = await response.json();

        if (!response.ok) {
            throw new Error(
                dados.error || 'Erro ao gerar compartilhamento.'
            );
        }

        ultimoCodigoGerado = dados.codigo;
        ultimoLinkGerado = montarLinkCompartilhamento(dados.codigo);

        els.resultado.style.display = 'block';
        els.codigoGerado.textContent = ultimoCodigoGerado;
        els.linkGerado.value = ultimoLinkGerado;

        await carregarCompartilhamentos();

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
                Nenhum compartilhamento ativo.
            </p>
        `;
        return;
    }

    lista.forEach(comp => {
        const card = document.createElement('div');
        const link = montarLinkCompartilhamento(comp.codigo);

        card.className = 'dash-card comp-card';

        card.innerHTML = `
            <div class="comp-top">
                <div>
                    <div class="comp-codigo">
                        ${escapeHTML(comp.codigo)}
                    </div>

                    <div class="comp-link">
                        ${escapeHTML(link)}
                    </div>
                </div>
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

            <div class="comp-acoes">
                <button
                    type="button"
                    onclick="copiarTexto('${escapeHTML(comp.codigo)}', 'Código copiado!')"
                >
                    Copiar Código
                </button>

                <button
                    type="button"
                    onclick="copiarTexto('${escapeHTML(link)}', 'Link copiado!')"
                >
                    Copiar Link
                </button>

                <button
                    type="button"
                    onclick="compartilharLinkWhatsapp('${escapeHTML(comp.codigo)}')"
                >
                    Compartilhar
                </button>

                <button
                    type="button"
                    onclick="verCopiasCompartilhamento('${comp.id}')"
                >
                    Ver cópias
                </button>

                <button
                    type="button"
                    class="btn-danger"
                    onclick="desativarCompartilhamento('${comp.id}', this)"
                >
                    Desativar
                </button>
            </div>
        `;

        els.lista.appendChild(card);
    });
}

window.desativarCompartilhamento = async function(id, botao = null) {
    if (!confirm('Deseja desativar este compartilhamento?')) {
        return;
    }

    const textoOriginal = botao ? botao.textContent : '';

    try {
        if (botao) {
            botao.disabled = true;
            botao.textContent = 'Desativando...';
        }

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

        alert('Compartilhamento desativado com sucesso!');
        await carregarCompartilhamentos();

    } catch (error) {
        console.error(error);
        alert(error.message);

        if (botao) {
            botao.disabled = false;
            botao.textContent = textoOriginal || 'Desativar';
        }
    }
};

window.verCopiasCompartilhamento = async function(compId) {
    try {
        const response = await fetch(`/api/compartilhamentos/${compId}/copias`);
        const copias = await response.json();

        if (!response.ok) {
            throw new Error(copias.error || 'Erro ao buscar histórico.');
        }

        if (!Array.isArray(copias) || copias.length === 0) {
            alert('Nenhuma cópia registrada para este compartilhamento.');
            return;
        }

        const texto = copias.map((copia, index) => {
            const data = new Date(copia.created_at).toLocaleString('pt-BR');

            return `${index + 1}. Copiado em: ${data}`;
        }).join('\n');

        alert(`Histórico de cópias:\n\n${texto}`);

    } catch (error) {
        console.error(error);
        alert(error.message);
    }
};

async function copiarCodigo() {
    if (!ultimoCodigoGerado) {
        alert('Nenhum código gerado ainda.');
        return;
    }

    await copiarTexto(ultimoCodigoGerado, 'Código copiado!');
}

async function copiarLinkGerado() {
    if (!ultimoLinkGerado) {
        alert('Nenhum link gerado ainda.');
        return;
    }

    await copiarTexto(ultimoLinkGerado, 'Link copiado!');
}

window.copiarTexto = async function(texto, mensagem = 'Copiado!') {
    try {
        await navigator.clipboard.writeText(texto);
        alert(mensagem);

    } catch {
        alert('Não foi possível copiar.');
    }
};

function compartilharWhatsapp() {
    if (!ultimoCodigoGerado) {
        alert('Nenhum código gerado ainda.');
        return;
    }

    compartilharLinkWhatsapp(ultimoCodigoGerado);
}

window.compartilharLinkWhatsapp = function(codigo) {
    const link = montarLinkCompartilhamento(codigo);

    const texto = encodeURIComponent(
        `Código de compartilhamento da turma:\n\n${codigo}\n\nLink direto:\n${link}`
    );

    window.open(
        `https://wa.me/?text=${texto}`,
        '_blank'
    );
};

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