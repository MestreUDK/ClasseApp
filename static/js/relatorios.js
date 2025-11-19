// static/js/relatorios.js

let els = {};

document.addEventListener('DOMContentLoaded', () => {
    els = {
        selectTurma: document.getElementById('select-turma'),
        dataPicker: document.getElementById('data-relatorio')
    };

    // Define hoje como padrão se o elemento existir
    if (els.dataPicker) {
        els.dataPicker.valueAsDate = new Date();
    }

    carregarTurmas();
});

async function carregarTurmas() {
    try {
        const res = await fetch('/api/turmas');
        const turmas = await res.json();

        els.selectTurma.innerHTML = '';

        if (turmas.length === 0) {
            const opt = document.createElement('option');
            opt.text = "Nenhuma turma cadastrada";
            els.selectTurma.appendChild(opt);
            return;
        }

        turmas.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.nome;
            els.selectTurma.appendChild(opt);
        });

    } catch (error) {
        console.error(error);
        els.selectTurma.innerHTML = '<option>Erro ao carregar</option>';
    }
}

// --- FUNÇÃO GENÉRICA DE DOWNLOAD ---
async function baixarArquivo(url) {
    try {
        // Mostra um aviso no botão que foi clicado
        const btnAntigo = document.activeElement;
        const textoOriginal = btnAntigo ? btnAntigo.innerText : '';
        
        if(btnAntigo && btnAntigo.tagName === 'BUTTON') {
            btnAntigo.innerText = "Gerando...";
            btnAntigo.disabled = true; // Evita múltiplos cliques
        }

        const response = await fetch(url);

        if (response.ok) {
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            
            const contentDisp = response.headers.get('Content-Disposition');
            let fileName = 'relatorio.pdf';
            if (contentDisp && contentDisp.indexOf('filename=') !== -1) {
                fileName = contentDisp.split('filename=')[1].replace(/"/g, '');
            }
            a.download = fileName;
            
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);
        } else {
            const erroJson = await response.json();
            alert(`ERRO: ${erroJson.error}\n${erroJson.details || ''}`);
        }

        // Restaura o botão
        if(btnAntigo && btnAntigo.tagName === 'BUTTON') {
            btnAntigo.innerText = textoOriginal;
            btnAntigo.disabled = false;
        }

    } catch (error) {
        alert("Erro de conexão: " + error.message);
        // Restaura o botão em caso de erro de rede
        const btnAntigo = document.activeElement;
        if(btnAntigo && btnAntigo.tagName === 'BUTTON') {
             btnAntigo.disabled = false;
             btnAntigo.innerText = "Tentar Novamente";
        }
    }
}

// --- AÇÕES DOS BOTÕES ---

window.baixarGeral = function(formato) {
    const turmaId = els.selectTurma.value;
    if (!turmaId) return alert("Selecione uma turma primeiro.");

    let url = `/api/exportar/turma/${turmaId}/geral`;
    if (formato === 'pdf') url += '/pdf';

    if (formato === 'pdf') baixarArquivo(url);
    else window.location.href = url;
};

window.baixarDiario = function(formato) {
    const turmaId = els.selectTurma.value;
    const data = els.dataPicker.value;
    
    if (!turmaId) return alert("Selecione uma turma primeiro.");
    if (!data) return alert("Selecione uma data.");

    let url = `/api/exportar/turma/${turmaId}/frequencia`;
    if (formato === 'pdf') url += '/pdf';
    url += `?data=${data}`;

    if (formato === 'pdf') baixarArquivo(url);
    else window.location.href = url;
};

// --- AQUI ESTÁ A FUNÇÃO QUE FALTAVA PARA AS NOTAS ---
window.baixarNotas = function(formato) {
    const turmaId = els.selectTurma.value;
    if (!turmaId) return alert("Selecione uma turma primeiro.");

    let url = `/api/exportar/turma/${turmaId}/notas`;
    if (formato === 'pdf') url += '/pdf';

    // Usamos baixarArquivo para ambos para ter feedback visual de "Gerando..."
    if (formato === 'pdf') {
        baixarArquivo(url);
    } else {
        baixarArquivo(url); 
    }
};