/* Navegação offline somente para a conta previamente identificada nesta aba.
 * O marcador da sessão não é autenticação: nunca acessar APIs nem armazenar tokens.
 * Os dados são lidos exclusivamente do IndexedDB do navegador.
 */
(() => {
    'use strict';

    const get = id => document.getElementById(id);
    const errorBox = get('offline-erro');
    const root = get('offline-app');
    const list = get('offline-items');
    const search = get('offline-filter');
    const title = get('offline-title');
    const info = get('offline-info');
    const academic = get('offline-academico');
    const forms = {
        turmas: [['nome', 'Nome'], ['descricao', 'Descrição']],
        alunos: [['nome_completo', 'Nome completo'], ['matricula', 'Matrícula'],
            ['telefone', 'Telefone'], ['email', 'E-mail'],
            ['data_nascimento', 'Nascimento (AAAA-MM-DD)'], ['detalhes', 'Detalhes']]
    };
    let account = null;
    let snapshot = null;
    let drafts = [];
    let academicDrafts = [];
    let view = 'turmas';
    let classFilter = null;

    function showError(message) {
        root.hidden = true;
        errorBox.textContent = message;
        errorBox.hidden = false;
    }
    function text(tag, value, className) {
        const element = document.createElement(tag);
        element.textContent = value;
        if (className) element.className = className;
        return element;
    }
    function getDraft(tipo, id) {
        return drafts.find(item => item.tipo === tipo && String(item.id) === String(id));
    }
    function effective(tipo, record) {
        const draft = getDraft(tipo, record.id);
        return draft ? {...record, ...draft.dados} : record;
    }
    function classNamesOfStudent(alunoId) {
        if (!Array.isArray(snapshot.vinculos)) return 'Vínculos não disponíveis; baixe uma cópia nova';
        const ids = snapshot.vinculos.filter(item => String(item.aluno_id) === String(alunoId))
            .map(item => String(item.turma_id));
        const names = snapshot.turmas.filter(item => ids.includes(String(item.id)))
            .map(item => effective('turmas', item).nome);
        return names.join(', ') || 'Sem turma vinculada';
    }
    function classNameById(id) {
        const turma = snapshot.turmas.find(item => String(item.id) === String(id));
        return turma ? effective('turmas', turma).nome : 'Turma não encontrada';
    }
    function enterView(next, turmaId = null) {
        view = next;
        classFilter = turmaId;
        search.value = '';
        document.querySelectorAll('[data-view]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.view === view));
        });
        draw();
    }
    function makeEditor(tipo, record) {
        const box = text('div', '', 'editor');
        const form = document.createElement('form');
        const draft = getDraft(tipo, record.id);
        const current = draft ? {...record, ...draft.dados} : record;
        const inputs = new Map();
        for (const [field, label] of forms[tipo]) {
            const container = document.createElement('label');
            container.append(text('span', label));
            const input = document.createElement('input');
            input.name = field;
            input.value = String(current[field] ?? '');
            if (field === 'nome' || field === 'nome_completo') input.required = true;
            container.append(input);
            form.append(container);
            inputs.set(field, input);
        }
        const controls = text('div', '', 'actions');
        const save = text('button', 'Salvar neste dispositivo');
        save.type = 'submit';
        const cancel = text('button', 'Cancelar');
        cancel.type = 'button';
        cancel.addEventListener('click', () => box.remove());
        controls.append(save, cancel);
        form.append(controls);
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (!Number.isInteger(record.revision) || record.revision < 1) {
                info.textContent = 'Este registro não possui revisão válida. Baixe uma cópia atualizada enquanto estiver online.';
                return;
            }
            const values = Object.fromEntries([...inputs].map(([key, input]) => [key, input.value.trim() || null]));
            if (!(values.nome || values.nome_completo)) return;
            if (tipo === 'turmas') values.disciplina_id = record.disciplina_id || null;
            save.disabled = true;
            try {
                const previous = getDraft(tipo, record.id);
                await salvarEdicaoOffline({
                    chave: `${account}:${tipo}:${record.id}`,
                    usuario_id: account,
                    tipo,
                    id: record.id,
                    expected_revision: previous?.expected_revision ?? record.revision,
                    base_dados: previous?.base_dados || Object.fromEntries(forms[tipo].map(([field]) =>
                        [field, record[field] ?? null])),
                    dados: values,
                    alterado_localmente_em: new Date().toISOString(),
                    estado: previous?.estado === 'conflito' ? 'conflito' : 'pendente'
                });
                drafts = await listarEdicoesOffline(account);
                info.textContent = 'Edição salva somente neste dispositivo. Para enviar, reconecte-se e abra Meu Perfil.';
                draw();
            } catch (error) {
                console.error(error);
                info.textContent = 'Não foi possível salvar no armazenamento local.';
                save.disabled = false;
            }
        });
        box.append(form);
        return box;
    }
    function card(tipo, record) {
        const value = effective(tipo, record);
        const pending = getDraft(tipo, record.id);
        const element = text('article', '', 'item');
        element.append(text('h3', value.nome_completo || value.nome || '(Sem nome)'));
        if (tipo === 'turmas') {
            const hasLinks = Array.isArray(snapshot.vinculos);
            const pupils = hasLinks ? snapshot.vinculos.filter(link =>
                String(link.turma_id) === String(record.id)).length : null;
            element.append(text('p', `${hasLinks ? pupils + ' aluno(s) na cópia' : 'Vínculos não disponíveis nesta cópia'} • ${value.descricao || 'Sem descrição'}`, 'meta'));
            const open = text('button', hasLinks ? 'Ver alunos da turma' : 'Ver todos os alunos');
            open.type = 'button';
            open.addEventListener('click', () => enterView('alunos', hasLinks ? record.id : null));
            element.append(open);
        } else {
            element.append(text('p', `Turmas: ${classNamesOfStudent(record.id)}`, 'meta'));
            if (value.matricula) element.append(text('p', `Matrícula: ${value.matricula}`, 'meta'));
        }
        if (pending) element.append(text('p', pending.estado === 'conflito' ?
            '⚠️ Edição com conflito — resolver online' : '● Edição local ainda não enviada', 'pending'));
        const edit = text('button', 'Editar no dispositivo');
        edit.type = 'button';
        edit.addEventListener('click', () => {
            const existing = element.querySelector('.editor');
            if (existing) existing.remove();
            else element.append(makeEditor(tipo, record));
        });
        element.append(edit);
        return element;
    }
    function draw() {
        list.replaceChildren();
        academic.hidden = true;
        get('stat-turmas').textContent = String(snapshot.turmas.length);
        get('stat-alunos').textContent = String(snapshot.alunos.length);
        get('stat-edicoes').textContent = String(drafts.length + academicDrafts.length);
        title.textContent = view === 'turmas' ? 'Turmas' : view === 'alunos' ?
            (classFilter ? `Alunos — ${classNameById(classFilter)}` : 'Alunos') :
            view === 'notas' ? 'Avaliações e notas' : view === 'diario' ? 'Diário de Bordo' : 'Alterações pendentes';
        search.closest('.filters').querySelector('input').hidden = (view === 'notas' || view === 'diario');
        if (view === 'notas' || view === 'diario') {
            window.ClasseAcademicoOffline?.render(view, {snapshot, conta: account});
            return;
        }
        const term = search.value.trim().toLocaleLowerCase('pt-BR');
        if (view === 'pendencias') {
            const visible = drafts.filter(item => {
                const value = item.dados?.nome_completo || item.dados?.nome || '';
                return String(value).toLocaleLowerCase('pt-BR').includes(term);
            });
            for (const item of visible) {
                const element = text('article', '', 'item');
                element.append(text('h3', item.dados?.nome_completo || item.dados?.nome || String(item.id)));
                element.append(text('p', `${item.tipo === 'turmas' ? 'Turma' : 'Aluno'} • revisão base ${item.expected_revision}`, 'meta'));
                element.append(text('p', item.estado === 'conflito' ? 'Conflito: resolver online' : 'Aguardando envio', 'pending'));
                list.append(element);
            }
            for (const item of academicDrafts) {
                const descricao = item.tipo === 'avaliacao_criar' ?
                    `Nova avaliação · ${item.dados.nome}` : item.tipo === 'avaliacao_excluir' ?
                    `Excluir avaliação · ${item.dados.nome}` : item.tipo === 'nota' ?
                    `Nota · aluno ${item.aluno_id}` : item.tipo === 'nota_excluir' ?
                    `Excluir nota · aluno ${item.aluno_id}` :
                    `${item.tipo === 'diario_criar' ? 'Criar' : item.tipo === 'diario_excluir' ? 'Excluir' : 'Editar'} diário · ${item.dados.titulo}`;
                if (!descricao.toLocaleLowerCase('pt-BR').includes(term)) continue;
                const element = text('article', '', 'item');
                element.append(text('h3', descricao));
                element.append(text('p', `Revisão base ${item.expected_revision}`, 'meta'));
                element.append(text('p', item.estado === 'conflito' ?
                    'Conflito: resolver no Perfil quando houver conexão' : 'Aguardando envio pelo Perfil', 'pending'));
                list.append(element);
            }
        } else {
            const values = snapshot[view].filter(record =>
                (!classFilter || view !== 'alunos' ||
                    (Array.isArray(snapshot.vinculos) && snapshot.vinculos.some(link =>
                        String(link.turma_id) === String(classFilter) &&
                        String(link.aluno_id) === String(record.id)))) &&
                (effective(view, record).nome_completo || effective(view, record).nome || '')
                    .toLocaleLowerCase('pt-BR').includes(term));
            for (const item of values) list.append(card(view, item));
        }
        if (!list.children.length) list.append(text('p', 'Nenhum registro encontrado nesta seção.', 'empty'));
    }
    async function reload() {
        snapshot = await obterSnapshot(account);
        drafts = await listarEdicoesOffline(account);
        academicDrafts = await listarEdicoesAcademicas(account);
        if (!snapshot || !Array.isArray(snapshot.turmas) || !Array.isArray(snapshot.alunos)) {
            showError('Não existe uma cópia local desta conta. Conecte-se, faça login e use Meu Perfil → Baixar da nuvem antes de utilizar o espaço offline.');
            return;
        }
        root.hidden = false;
        errorBox.hidden = true;
        const date = new Date(snapshot.salvo_em);
        info.textContent = `Cópia baixada em ${Number.isNaN(date.getTime()) ? 'data desconhecida' : date.toLocaleString('pt-BR')}. ` +
            'Edições locais não são enviadas automaticamente.';
        draw();
    }
    async function init() {
        try { account = sessionStorage.getItem('classeapp:offline:conta-aba'); }
        catch (_) { /* Nada */ }
        if (!account) {
            showError('Não há uma conta identificada nesta aba. Abra o ClasseApp com internet, faça login e baixe uma cópia no Perfil. Depois utilize o espaço offline na mesma aba do navegador.');
            return;
        }
        try { await reload(); }
        catch (error) {
            console.error(error);
            showError('Não foi possível abrir o banco local neste navegador. Nenhum dado foi alterado.');
        }
    }
    document.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', () => enterView(button.dataset.view));
    });
    search.addEventListener('input', draw);
    document.addEventListener('academico-offline:gravado', async () => {
        try {
            academicDrafts = await listarEdicoesAcademicas(account);
            get('stat-edicoes').textContent = String(drafts.length + academicDrafts.length);
            if (view === 'pendencias') draw();
        } catch (_) { info.textContent = 'Edição salva, mas não foi possível atualizar a contagem.'; }
    });
    get('offline-refresh').addEventListener('click', async () => {
        try { await reload(); } catch (_) { info.textContent = 'Falha ao atualizar a visualização local.'; }
    });
    init();
})();
