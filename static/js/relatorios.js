// static/js/relatorios.js

let els = {};

document.addEventListener('DOMContentLoaded', () => {
    els = {
        selectTurma: document.getElementById('select-turma'),
        dataPicker: document.getElementById('data-relatorio')
    };

    // Define hoje como padrão
    els.dataPicker.valueAsDate = new Date();
    
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

// --- AÇÕES DE DOWNLOAD INTELIGENTES ---

// Função genérica para baixar e tratar erros
async function baixarArquivo(url) {
    try {
        // Mostra um aviso que está processando
        const btnAntigo = document.activeElement;
        const textoOriginal = btnAntigo.innerText;
        if(btnAntigo) btnAntigo.innerText = "Gerando...";

        const response = await fetch(url);

        if (response.ok) {
            // Se deu certo, converte em Blob e força o download
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            
            // Tenta pegar o nome do arquivo do cabeçalho (opcional, senão usa padrão)
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
            // SE DEU ERRO: Tenta ler o JSON de erro
            const erroJson = await response.json();
            alert(`ERRO AO GERAR ARQUIVO:\n\n${erroJson.error}\n\nDetalhes: ${erroJson.details || ''}`);
            console.error("Detalhes do erro:", erroJson);
        }

        if(btnAntigo) btnAntigo.innerText = textoOriginal;

    } catch (error) {
        alert("Erro de conexão ou rede: " + error.message);
    }
}

window.baixarGeral = function(formato) {
    const turmaId = els.selectTurma.value;
    if (!turmaId) return alert("Selecione uma turma primeiro.");

    let url = `/api/exportar/turma/${turmaId}/geral`;
    if (formato === 'pdf') url += '/pdf';

    // Usa a nova função segura
    if (formato === 'pdf') {
        baixarArquivo(url);
    } else {
        window.location.href = url; // Excel raramente falha, mantemos o método simples
    }
};

window.baixarDiario = function(formato) {
    const turmaId = els.selectTurma.value;
    const data = els.dataPicker.value;
    
    if (!turmaId) return alert("Selecione uma turma primeiro.");
    if (!data) return alert("Selecione uma data.");

    let url = `/api/exportar/turma/${turmaId}/frequencia`;
    if (formato === 'pdf') url += '/pdf';
    
    url += `?data=${data}`;

    if (formato === 'pdf') {
        baixarArquivo(url);
    } else {
        window.location.href = url;
    }
};