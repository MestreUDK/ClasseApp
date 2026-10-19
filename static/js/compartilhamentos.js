// static/js/compartilhamentos.js

const TURMA_ID = window.location.pathname.split('/')[2];

let els = {};
let ultimoCodigoGerado = '';
let ultimoLinkGerado = '';

let modoEdicao = false;
let compartilhamentoEditandoId = null;

document.addEventListener('DOMContentLoaded', () => {
    els = {
        form: document.getElementById('form-compartilhar'),

        tituloForm: document.getElementById('titulo-form-compartilhar'),
        avisoEdicao: document.getElementById('aviso-edicao'),
        btnSubmit: document.getElementById('btn-submit-compartilhar'),
        btnCancelarEdicao: document.getElementById('btn-cancelar-edicao'),

        compartilharAlunos: document.getElementById('compartilhar-alunos'),
        compartilharFrequencia: document.getElementById('compartilhar-frequencia'),
        compartilharNotas: document.getElementById('compartilhar-notas'),
        compartilharDiario: document.getElementById('compartilhar-diario'),

        permiteCopia: document.getElementById('permite-copia'),
        expiraEm: document.getElementById('expira-em'),

        resultado: document.getElementById('resultado-compartilhamento'),
        codigoGerado: document.getElementById('codigo-gerado'),
        linkGerado: document.getElementById('link-gerado'),

        btnCopiar: document.getElementById('btn-copiar'),
        btnCopiarLink: document.getElementById('btn-copiar-link'),
        btnWhatsapp: document.getElementById('btn-whatsapp'),

        lista: document.getElementById('lista-compartilhamentos'),
        listaExpirados: document.getElementById('lista-compartilhamentos-expirados'),
        listaDesativados: document.getElementById('lista-compartilhamentos-desativados'),

        boxHistorico: document.getElementById('box-historico-copias'),
        listaHistorico: document.getElementById('lista-historico-copias'),
        historicoSubtitulo: document.getElementById('historico-subtitulo'),
        btnFecharHistorico: document.getElementById('btn-fechar-historico')
    };

    els.form.addEventListener('submit', handleSubmitCompartilhamento);
    els.btnCancelarEdicao.addEventListener('click', cancelarEdicao);

    els.btnCopiar.addEventListener('click', copiarCodigo);
    els.btnCopiarLink.addEventListener('click', copiarLinkGerado);
    els.btnWhatsapp.addEventListener('click', compartilharWhatsapp);

    if (els.btnFecharHistorico) {
        els.btnFecharHistorico.addEventListener('click', fecharHistoricoCopias);
    }

    carregarCompartilhamentos();
});

function montarLinkCompartilhamento(codigo) {
    return `${window.location.origin}/compartilhado/${codigo}`;
}

function formatarDataHora(dataISO) {
    if (!dataISO) return 'Não expira';

    try {
        const data = new Date(dataISO);
        return Number.isNaN(data.getTime()) ? 'Data inválida' : data.toLocaleString('pt-BR');
    } catch {
        return dataISO;
    }
}

function formatarTotalCopias(total) {
    const quantidade = Number(total || 0);

    if (quantidade === 0) {
        return '0 cópias';
    }

    if (quantidade === 1) {
        return '1 cópia';
    }

    return `${quantidade} cópias`;
}

function converterParaInputDatetimeLocal(dataISO) {
    if (!dataISO) return '';

    try {
        const data = new Date(dataISO);
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        const hora = String(data.getHours()).padStart(2, '0');
        const minuto = String(data.getMinutes()).padStart(2, '0');

        return `${ano}-${mes}-${dia}T${hora}:${minuto}`;

    } catch {
        return '';
    }
}

function montarPayloadCompartilhamento() {
    return {
        permissao: 'visualizar',
        permite_copia: els.permiteCopia.checked,
        compartilhar_alunos: els.compartilharAlunos.checked,
        compartilhar_frequencia: els.compartilharFrequencia.checked,
        compartilhar_notas: els.compartilharNotas.checked,
        compartilhar_diario: els.compartilharDiario.checked,
        expira_em: els.expiraEm.value || null
    };
}

async function handleSubmitCompartilhamento(e) {
    e.preventDefault();

    if (modoEdicao && compartilhamentoEditandoId) {
        await salvarEdicaoCompartilhamento();
        return;
    }

    await criarCompartilhamento();
}

async function criarCompartilhamento() {
    try {
        const response = await fetch(
            `/api/compartilhamentos/turma/${TURMA_ID}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(montarPayloadCompartilhamento())
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

        limparFormulario();
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

async function salvarEdicaoCompartilhamento() {
    try {
        const response = await fetch(
            `/api/compartilhamentos/${compartilhamentoEditandoId}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(montarPayloadCompartilhamento())
            }
        );

        const dados = await response.json();

        if (!response.ok) {
            throw new Error(
                dados.error || 'Erro ao atualizar compartilhamento.'
            );
        }

        alert('Compartilhamento atualizado com sucesso!');

        cancelarEdicao();
        await carregarCompartilhamentos();

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

        if (els.listaExpirados) els.listaExpirados.textContent = 'Não foi possível carregar os expirados.';
        if (els.listaDesativados) els.listaDesativados.textContent = 'Não foi possível carregar os desativados.';
        els.lista.innerHTML = `
            <p style="color:red;">
                ${escapeHTML(error.message)}
            </p>
        `;
    }
}

function renderizarCompartilhamentos(lista) {
    els.lista.innerHTML = '';
    if (els.listaExpirados) els.listaExpirados.innerHTML = '';
    if (els.listaDesativados) els.listaDesativados.innerHTML = '';

    if (!Array.isArray(lista)) {
        els.lista.textContent = 'Resposta inválida do servidor.';
        return;
    }

    const ativos = lista.filter(comp => comp.ativo && !comp.expirado);
    const expirados = lista.filter(comp => comp.ativo && comp.expirado);
    const desativados = lista.filter(comp => !comp.ativo);

    if (!ativos.length) els.lista.textContent = 'Nenhum compartilhamento ativo.';
    if (els.listaExpirados && !expirados.length) {
        els.listaExpirados.textContent = 'Nenhum compartilhamento expirado.';
    }

    if (els.listaDesativados && !desativados.length) {
        els.listaDesativados.textContent = 'Nenhum compartilhamento desativado.';
    }

    ativos.forEach(comp => montarCardCompartilhamento(comp, els.lista, false));
    if (els.listaExpirados) {
        expirados.forEach(comp => montarCardCompartilhamento(comp, els.listaExpirados, true));
    }
    if (els.listaDesativados) {
        desativados.forEach(comp => montarCardCompartilhamento(comp, els.listaDesativados, !!comp.expirado));
    }
}

function montarCardCompartilhamento(comp, destino, expirado) {
    const card = document.createElement('div');
    const link = montarLinkCompartilhamento(comp.codigo);
    const total = formatarTotalCopias(comp.total_copias);
    const desativado = !comp.ativo;
    card.className = `dash-card comp-card${desativado ? ' comp-desativado' : (expirado ? ' comp-expirado' : '')}`;

    const tags = [
        [comp.compartilhar_alunos, 'Alunos'],
        [comp.compartilhar_frequencia, 'Frequência'],
        [comp.compartilhar_notas, 'Notas'],
        [comp.compartilhar_diario, 'Diário'],
        [comp.permite_copia, 'Permite cópia']
    ].filter(([habilitado]) => habilitado)
     .map(([, nome]) => `<span class="tag-comp">${nome}</span>`).join('');

    card.innerHTML = `
        <div class="comp-top"><div>
            <div class="comp-codigo">${escapeHTML(comp.codigo)}</div>
            <div class="comp-link">${escapeHTML(link)}</div>
            ${desativado ? '<div class="comp-link"><strong>Desativado</strong></div>' : ''}
            <div class="comp-link">${expirado ? 'Expirou em' : 'Expira em'}: ${escapeHTML(formatarDataHora(comp.expira_em))}</div>
            <div class="comp-link">📊 ${escapeHTML(total)}</div>
            <div class="comp-link">🕒 Última cópia: ${escapeHTML(comp.ultima_copia_em ? formatarDataHora(comp.ultima_copia_em) : 'Nenhuma')}</div>
        </div></div>
        <div class="comp-tags">${tags}</div>
        <div class="comp-acoes"></div>
    `;

    const acoes = card.querySelector('.comp-acoes');
    function adicionarBotao(texto, acao, classe = '') {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.textContent = texto;
        if (classe) botao.className = classe;
        botao.addEventListener('click', () => acao(botao));
        acoes.appendChild(botao);
    }

    if (!expirado && !desativado) {
        adicionarBotao('Copiar Código', () => copiarTexto(comp.codigo, 'Código copiado!'));
        adicionarBotao('Copiar Link', () => copiarTexto(link, 'Link copiado!'));
        adicionarBotao('Compartilhar', () => compartilharLinkWhatsapp(comp.codigo));
    }
    if (!desativado) adicionarBotao('Editar', () => iniciarEdicaoCompartilhamento(comp), 'btn-edit');
    adicionarBotao(`Ver cópias (${Number(comp.total_copias) || 0})`, () => verCopiasCompartilhamento(comp.id, comp.codigo));
    if (expirado && !desativado) {
        adicionarBotao('Reativar', botao => reativarCompartilhamento(comp, botao));
    }
    if (!desativado) adicionarBotao('Desativar', botao => desativarCompartilhamento(comp.id, botao), 'btn-danger');
    adicionarBotao('Excluir definitivamente', botao => excluirCompartilhamento(comp, botao), 'btn-danger');
    destino.appendChild(card);
}

async function excluirCompartilhamento(comp, botao) {
    const quantidade = Number(comp.total_copias) || 0;
    const mensagem = `Excluir DEFINITIVAMENTE o compartilhamento ${comp.codigo}?\n\n` +
        `O código deixará de existir e seu histórico (${formatarTotalCopias(quantidade)}) será apagado.\n` +
        'As turmas já copiadas por outros professores NÃO serão excluídas.\n\n' +
        'Esta ação não pode ser desfeita.';
    if (!confirm(mensagem)) return;

    const confirmacao = prompt(`Para confirmar, digite exatamente o código ${comp.codigo}:`);
    if (confirmacao !== comp.codigo) {
        if (confirmacao !== null) alert('Código diferente. Exclusão cancelada.');
        return;
    }

    botao.disabled = true;
    const textoOriginal = botao.textContent;
    botao.textContent = 'Excluindo...';
    try {
        const response = await fetch(`/api/compartilhamentos/${comp.id}`, { method: 'DELETE' });
        const dados = await response.json();
        if (!response.ok) throw new Error(dados.error || 'Não foi possível excluir.');
        if (compartilhamentoEditandoId === comp.id) cancelarEdicao();
        fecharHistoricoCopias();
        await carregarCompartilhamentos();
        alert('Compartilhamento excluído definitivamente.');
    } catch (error) {
        console.error(error);
        alert(error.message);
    } finally {
        botao.disabled = false;
        botao.textContent = textoOriginal;
    }
}

async function reativarCompartilhamento(comp, botao) {
    const sugestao = converterParaInputDatetimeLocal(comp.expira_em);
    const valor = prompt(
        'Informe a nova validade (AAAA-MM-DDTHH:MM). Deixe vazio para não expirar.\nO código original será mantido.',
        sugestao
    );
    if (valor === null) return;
    const expiraEm = valor.trim();
    if (expiraEm && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(expiraEm)) {
        alert('Formato inválido. Use AAAA-MM-DDTHH:MM.');
        return;
    }
    const original = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Reativando...';
    try {
        const response = await fetch(`/api/compartilhamentos/${comp.id}/reativar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expira_em: expiraEm || null })
        });
        const dados = await response.json();
        if (!response.ok) throw new Error(dados.error || 'Erro ao reativar compartilhamento.');
        alert('Compartilhamento reativado! O código foi mantido.');
        await carregarCompartilhamentos();
    } catch (error) {
        console.error(error);
        alert(error.message);
    } finally {
        botao.disabled = false;
        botao.textContent = original;
    }
}

window.iniciarEdicaoCompartilhamento = function(comp) {
    modoEdicao = true;
    compartilhamentoEditandoId = comp.id;

    els.tituloForm.textContent = 'Editar Compartilhamento';
    els.avisoEdicao.style.display = 'block';
    els.btnSubmit.textContent = 'Salvar Alterações';
    els.btnCancelarEdicao.style.display = 'inline-block';

    els.compartilharAlunos.checked = !!comp.compartilhar_alunos;
    els.compartilharFrequencia.checked = !!comp.compartilhar_frequencia;
    els.compartilharNotas.checked = !!comp.compartilhar_notas;
    els.compartilharDiario.checked = !!comp.compartilhar_diario;
    els.permiteCopia.checked = !!comp.permite_copia;
    els.expiraEm.value = converterParaInputDatetimeLocal(comp.expira_em);

    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
};

function cancelarEdicao() {
    modoEdicao = false;
    compartilhamentoEditandoId = null;

    els.tituloForm.textContent = 'Configurações do Compartilhamento';
    els.avisoEdicao.style.display = 'none';
    els.btnSubmit.textContent = 'Gerar Código';
    els.btnCancelarEdicao.style.display = 'none';

    limparFormulario();
}

function limparFormulario() {
    els.compartilharAlunos.checked = true;
    els.compartilharFrequencia.checked = false;
    els.compartilharNotas.checked = false;
    els.compartilharDiario.checked = false;
    els.permiteCopia.checked = false;
    els.expiraEm.value = '';
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

        if (compartilhamentoEditandoId === id) {
            cancelarEdicao();
        }

        fecharHistoricoCopias();

    } catch (error) {
        console.error(error);
        alert(error.message);

        if (botao) {
            botao.disabled = false;
            botao.textContent = textoOriginal || 'Desativar';
        }
    }
};

window.verCopiasCompartilhamento = async function(compId, codigo = '') {
    try {
        if (!els.boxHistorico || !els.listaHistorico) {
            alert('Área de histórico não encontrada no HTML.');
            return;
        }

        els.boxHistorico.style.display = 'block';
        els.listaHistorico.innerHTML = '<p>Carregando histórico...</p>';

        if (els.historicoSubtitulo) {
            els.historicoSubtitulo.textContent = codigo
                ? `Cópias realizadas pelo código ${codigo}.`
                : 'Cópias realizadas a partir deste compartilhamento.';
        }

        const response = await fetch(`/api/compartilhamentos/${compId}/copias`);
        const copias = await response.json();

        if (!response.ok) {
            throw new Error(copias.error || 'Erro ao buscar histórico.');
        }

        renderizarHistoricoCopias(copias);

        els.boxHistorico.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });

    } catch (error) {
        console.error(error);

        els.listaHistorico.innerHTML = `
            <p style="color:red;">
                ${escapeHTML(error.message)}
            </p>
        `;
    }
};

function renderizarHistoricoCopias(copias) {
    if (!Array.isArray(copias) || copias.length === 0) {
        els.listaHistorico.innerHTML = `
            <p style="color:#777;">
                Nenhuma cópia registrada para este compartilhamento.
            </p>
        `;
        return;
    }

    els.listaHistorico.innerHTML = '';

    copias.forEach((copia, index) => {
        const card = document.createElement('div');

        card.className = 'copia-card';

        const turmaNome = copia.nova_turma_nome || 'Turma copiada';
        const turmaDescricao = copia.nova_turma_descricao || '-';
        const copiadoPor = copia.copiado_por_email || copia.copiado_por || '-';

        card.innerHTML = `
            <strong>${index + 1}. ${escapeHTML(turmaNome)}</strong>

            <div class="copia-grid">
                <div class="copia-info">
                    <span>Copiado em</span>
                    ${escapeHTML(formatarDataHora(copia.created_at))}
                </div>

                <div class="copia-info">
                    <span>Copiado por</span>
                    ${escapeHTML(copiadoPor)}
                </div>

                <div class="copia-info">
                    <span>Nova turma</span>
                    ${escapeHTML(turmaNome)}
                </div>

                <div class="copia-info">
                    <span>Descrição</span>
                    ${escapeHTML(turmaDescricao)}
                </div>

                <div class="copia-info">
                    <span>ID da nova turma</span>
                    ${escapeHTML(copia.nova_turma_id || '-')}
                </div>
            </div>
        `;

        els.listaHistorico.appendChild(card);
    });
}

function fecharHistoricoCopias() {
    if (!els.boxHistorico || !els.listaHistorico) {
        return;
    }

    els.boxHistorico.style.display = 'none';
    els.listaHistorico.innerHTML = '<p>Carregando histórico...</p>';

    if (els.historicoSubtitulo) {
        els.historicoSubtitulo.textContent = 'Cópias realizadas a partir deste compartilhamento.';
    }
}

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