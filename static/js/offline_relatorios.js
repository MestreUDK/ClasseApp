/* Relatórios gerados inteiramente a partir do IndexedDB (sem chamadas de rede).
 * Os cálculos espelham modules/rendimento.py e modules/mapa_final.py.
 * A exportação XLSX usa ZIP sem compressão, sem CDN ou bibliotecas remotas.
 */
(() => {
    'use strict';

    const PESOS = {1: 2, 2: 3, 3: 2, 4: 3};
    const NOTA_MINIMA = 5;
    const FREQUENCIA_MINIMA = 75;
    const id = valor => String(valor ?? '');
    const numero = valor => valor === null || valor === undefined || valor === '' ||
        typeof valor === 'boolean' || !Number.isFinite(Number(valor)) ? null : Number(valor);
    const arredondar = valor => valor === null ? null : Math.round((valor + Number.EPSILON) * 100) / 100;
    const normalizar = (valor, avaliacao) => {
        const nota = numero(valor);
        const maxima = numero(avaliacao.nota_maxima ?? 10);
        return nota === null || maxima === null || maxima <= 0 ? null : nota * 10 / maxima;
    };
    const isDateInYear = (date, year) => !date || String(date).startsWith(`${year}-`);

    function montarDados(snapshot, pendentes = [], frequenciasPendentes = [], turmasPendentes = []) {
        if (!snapshot || !Array.isArray(snapshot.vinculos) || !Array.isArray(snapshot.avaliacoes) ||
            !Array.isArray(snapshot.notas) || !Array.isArray(snapshot.frequencias) ||
            !Number.isInteger(snapshot.ano_letivo)) {
            throw new Error('Esta cópia não contém o histórico de frequência anual. Baixe uma cópia atualizada no Perfil.');
        }
        const ano = snapshot.ano_letivo;
        const porTipo = tipo => pendentes.filter(p => p.tipo === tipo);
        const avExcluidas = new Set(porTipo('avaliacao_excluir').map(p => id(p.id)));
        const avaliacoes = new Map(snapshot.avaliacoes.map(av => [id(av.id), {...av}]));
        for (const op of porTipo('avaliacao_criar')) {
            if (!avExcluidas.has(id(op.id))) avaliacoes.set(id(op.id), {...op.dados, id: op.id, _pendente: true});
        }
        for (const excluida of avExcluidas) avaliacoes.delete(excluida);
        const notas = new Map();
        for (const item of snapshot.notas) {
            notas.set(`${id(item.avaliacao_id)}:${id(item.aluno_id)}`, {...item});
        }
        for (const op of pendentes) {
            if (!['nota', 'nota_excluir'].includes(op.tipo)) continue;
            const key = `${id(op.avaliacao_id)}:${id(op.aluno_id)}`;
            const anterior = notas.get(key) || {avaliacao_id:op.avaliacao_id, aluno_id:op.aluno_id};
            if (op.tipo === 'nota_excluir') {
                notas.set(key, {...anterior, valor: null, recupera_periodo: null, _pendente: true});
            } else {
                notas.set(key, {...anterior, ...op.dados, _pendente: true});
            }
        }
        const turmas = snapshot.turmas.map(t => {
            const pendente = turmasPendentes.find(p => p.tipo === 'turmas' && id(p.id) === id(t.id));
            return pendente ? {...t, ...pendente.dados} : t;
        });
        const alunos = snapshot.alunos.map(a => {
            const pendente = turmasPendentes.find(p => p.tipo === 'alunos' && id(p.id) === id(a.id));
            return pendente ? {...a, ...pendente.dados} : a;
        });
        const frequencias = new Map();
        // Registros mais recentes da cópia prevalecem para mesmo aluno/data.
        for (const chamada of [...snapshot.frequencias].sort((a,b) =>
            String(a.updated_at || '').localeCompare(String(b.updated_at || '')))) {
            if (!isDateInYear(chamada.data, ano) || !chamada.data ||
                typeof chamada.presente !== 'boolean') continue;
            frequencias.set(`${id(chamada.turma_id)}:${id(chamada.aluno_id)}:${chamada.data}`, chamada);
        }
        let frequenciasLocais = 0;
        for (const op of [...frequenciasPendentes].sort((a,b) =>
            String(a.criado_em || '').localeCompare(String(b.criado_em || '')))) {
            const chamada = op.dados;
            if (!chamada || !String(chamada.data || '').startsWith(`${ano}-`) ||
                typeof chamada.presente !== 'boolean') continue;
            frequencias.set(`${id(chamada.turma_id)}:${id(chamada.aluno_id)}:${chamada.data}`,
                {...chamada, _pendente: true});
            frequenciasLocais++;
        }
        const diario = new Map((snapshot.diario || []).map(item => [id(item.id), {...item}]));
        for (const op of pendentes) {
            if (op.tipo === 'diario_excluir') diario.delete(id(op.id));
            else if (['diario', 'diario_criar'].includes(op.tipo)) {
                diario.set(id(op.id), {...(diario.get(id(op.id)) || {}), ...op.dados,
                    id:op.id, _pendente:true});
            }
        }
        return {ano, turmas, alunos, avaliacoes:[...avaliacoes.values()], notas,
            frequencias:[...frequencias.values()], diario:[...diario.values()],
            vinculos:snapshot.vinculos, salvamento:snapshot.salvo_em, alteracoesLocais:pendentes.length + turmasPendentes.length + frequenciasPendentes.length,
            chamadasLocais:frequenciasLocais, possuiConflitos:[...pendentes, ...turmasPendentes, ...frequenciasPendentes]
                .some(p => p.estado === 'conflito' || p.conflito)};
    }

    function calcularRendimento(alunoId, avaliacoes, notas) {
        const periodos = {};
        for (const n of [1,2,3,4]) {
            const atividades = avaliacoes.filter(a => a.periodo_tipo === 'avaliacao' &&
                a.categoria !== 'recuperacao' && Number(a.periodo_numero) === n);
            let soma = 0, pesoTotal = 0, lancadas = 0;
            for (const av of atividades) {
                const nota = notas.get(`${id(av.id)}:${id(alunoId)}`)?.valor;
                const valor = normalizar(nota, av);
                const peso = numero(av.peso ?? 1);
                if (valor === null || peso === null || peso <= 0) continue;
                soma += valor * peso; pesoTotal += peso; lancadas++;
            }
            const original = pesoTotal ? soma / pesoTotal : null;
            periodos[n] = {original:arredondar(original), efetiva:arredondar(original),
                valor:original, completo:atividades.length > 0 && lancadas === atividades.length,
                atividades:atividades.length, lancadas};
        }
        const recuperacoes = {};
        let ambiguas = false;
        for (const [n, primeiro, segundo] of [[1,1,2],[2,3,4]]) {
            const recs = avaliacoes.filter(a => a.categoria === 'recuperacao' &&
                a.periodo_tipo === 'avaliacao' && Number(a.periodo_numero) === n);
            const rec = recs.length === 1 ? recs[0] : null;
            ambiguas ||= recs.length > 1;
            const notaRec = rec ? normalizar(notas.get(`${id(rec.id)}:${id(alunoId)}`)?.valor, rec) : null;
            const vermelhas = [primeiro,segundo].filter(p => periodos[p].valor !== null &&
                periodos[p].valor < NOTA_MINIMA);
            const manual = rec?.recuperacao_modo === 'manual';
            const destinoSalvo = rec ? numero(notas.get(`${id(rec.id)}:${id(alunoId)}`)?.recupera_periodo) : null;
            const alvo = manual ? (vermelhas.includes(destinoSalvo) ? destinoSalvo : null) :
                vermelhas.length === 2 ? segundo : (vermelhas[0] || null);
            const aplicada = notaRec !== null && alvo !== null && notaRec > periodos[alvo].valor;
            if (aplicada) {periodos[alvo].valor = notaRec; periodos[alvo].efetiva = arredondar(notaRec);}
            recuperacoes[n] = {nota:arredondar(notaRec), alvo, aplicada,
                pendente:manual && notaRec !== null && alvo === null, ambigua:recs.length > 1};
        }
        const somaPontos = Object.values(periodos).reduce((a,p,n) =>
            a + (p.valor === null ? 0 : p.valor * PESOS[n+1]), 0);
        const somaPesos = Object.values(periodos).reduce((a,p,n) =>
            a + (p.valor === null ? 0 : PESOS[n+1]), 0);
        const completo = Object.values(periodos).every(p => p.completo);
        return {periodos, recuperacoes, completo, ambiguas,
            total: somaPesos ? arredondar(somaPontos) : null,
            media: completo ? arredondar(somaPontos / 10) : null,
            mediaParcial: somaPesos ? arredondar(somaPontos / somaPesos) : null};
    }

    function montarRelatorio(dados, turmaId) {
        const turma = dados.turmas.find(t => id(t.id) === id(turmaId));
        if (!turma) throw new Error('Turma indisponível na cópia local.');
        const alunosIds = new Set((dados.vinculos || []).filter(v => id(v.turma_id) === id(turmaId))
            .map(v => id(v.aluno_id)));
        const alunos = dados.alunos.filter(a => alunosIds.has(id(a.id)))
            .sort((a,b) => String(a.nome_completo || '').localeCompare(String(b.nome_completo || ''), 'pt-BR'));
        const avaliacoes = dados.avaliacoes.filter(av => id(av.turma_id) === id(turmaId) &&
            isDateInYear(av.data, dados.ano));
        const presencas = new Map();
        for (const f of dados.frequencias) {
            if (id(f.turma_id) !== id(turmaId) || !alunosIds.has(id(f.aluno_id))) continue;
            if (!presencas.has(id(f.aluno_id))) presencas.set(id(f.aluno_id), [0,0]);
            presencas.get(id(f.aluno_id))[f.presente ? 0 : 1]++;
        }
        const linhas = alunos.map((aluno, index) => {
            const rendimento = calcularRendimento(aluno.id, avaliacoes, dados.notas);
            const [p, f] = presencas.get(id(aluno.id)) || [0,0];
            const percentual = p + f ? arredondar(100 * p / (p + f)) : null;
            const situacao = rendimento.media === null ? 'EM ANDAMENTO' : percentual === null ?
                'SEM FREQUÊNCIA' : rendimento.media >= NOTA_MINIMA && percentual >= FREQUENCIA_MINIMA ?
                'APROVADO' : 'REPROVADO';
            return {numero:index+1, nome:aluno.nome_completo || '', alunoId:id(aluno.id),
                rendimento, presencas:p, faltas:f, percentual, situacao};
        });
        const diario = dados.diario.filter(d => id(d.turma_id) === id(turmaId) &&
            isDateInYear(d.data_referencia, dados.ano))
            .sort((a,b) => String(a.data_referencia || '').localeCompare(String(b.data_referencia || '')));
        const disciplina = Array.isArray(turma.disciplinas) ? turma.disciplinas[0] : turma.disciplinas;
        return {turma:turma.nome || 'Turma', componente:disciplina?.nome || 'Não informado',
            ano:dados.ano, linhas, diario, alunos, avaliacoes, alteracoesLocais:dados.alteracoesLocais,
            possuiConflitos:dados.possuiConflitos, salvamento:dados.salvamento};
    }

    function xmlEscape(value) {
        return String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
    }
    const col = i => {let s=''; for(let n=i;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
    const celula = (value,r,c,style=0) => {
        if(value === null || value === undefined || value === '') return '';
        const ref=`${col(c)}${r}`; const estilo=style?` s="${style}"`:'';
        if(typeof value === 'number') return Number.isFinite(value) ? `<c r="${ref}"${estilo}><v>${value}</v></c>` : '';
        // Texto é inlineStr, nunca tratado como fórmula (protege nomes digitados).
        return `<c r="${ref}" t="inlineStr"${estilo}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    };
    function sheet(rows, {merges=[],colWidths={},freeze='B8',headers=new Set(),titleRows=new Set(),print=false}={}) {
        const corpo=rows.map((linha, index) => {
            const r=index+1;
            let cells='';
            linha.forEach((valor,c) => {
                const style=titleRows.has(r)?1:headers.has(r)?2:(typeof valor==='number'&&c>1?3:0);
                cells+=celula(valor,r,c+1,style);
            });
            return `<row r="${r}"${headers.has(r)?' ht="29" customHeight="1"':''}>${cells}</row>`;
        }).join('');
        const cols=Object.entries(colWidths).map(([key,w]) => {
            const i=key.split('').reduce((v,c)=>v*26+c.charCodeAt(0)-64,0);
            return `<col min="${i}" max="${i}" width="${w}" customWidth="1"/>`;
        }).join('');
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
            `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`+
            `<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${freeze==='B8'?7:1}" topLeftCell="${freeze}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`+
            (cols?`<cols>${cols}</cols>`:'')+`<sheetData>${corpo}</sheetData>`+
            (merges.length?`<mergeCells count="${merges.length}">${merges.map(m=>`<mergeCell ref="${m}"/>`).join('')}</mergeCells>`:'')+
            (print?'<pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>'+
                '<pageSetup orientation="landscape" paperSize="8" fitToWidth="1"/>':'')+
            '</worksheet>';
    }
    function bookSheets(relatorio) {
        const main=Array.from({length:7},()=>Array(18).fill(null));
        main[0][0]='MAPA FINAL DO RENDIMENTO ESCOLAR — CÓPIA OFFLINE';
        main[1][0]=`COMPONENTE: ${relatorio.componente}`; main[1][11]=`ANO LETIVO: ${relatorio.ano}`;
        main[2][0]=`TURMA: ${relatorio.turma}`;
        main[3][0]='Prévia local, não oficial. Média mínima 5,0; frequência mínima 75%. Confira as regras da escola.';
        main[4][0]='Nº';main[4][1]='ALUNO(A)';main[4][2]='AVALIAÇÕES BIMESTRAIS';
        main[4][8]='PROCESSO PONDERADO';main[4][14]='APROVEITAMENTO ESCOLAR';main[4][17]='RESULTADO';
        ['1ª','2ª','REC','3ª','4ª','REC'].forEach((s,i)=>main[5][i+2]=s);
        [1,2,3,4].forEach((n,i)=>{main[5][i+8]=`${n}ª AV.`;main[6][i+8]=`× ${PESOS[n]}`;});
        main[5][12]='TOTAL DE PONTOS';main[5][13]='MÉDIA ANUAL';main[5][14]='TOTAL';
        ['PRESENÇA','FALTA','% FREQ.'].forEach((s,i)=>main[6][i+14]=s);
        const memoria=[['Nº','Aluno(a)','1ª efetiva','2ª efetiva','3ª efetiva','4ª efetiva',
            '4 períodos completos?','Destino REC 1','REC 1 aplicada?','Destino REC 2','REC 2 aplicada?']];
        for(const row of relatorio.linhas) {
            const r=row.rendimento,p=r.periodos,rec=r.recuperacoes;
            main.push([row.numero,row.nome,p[1].original,p[2].original,rec[1].nota,
                p[3].original,p[4].original,rec[2].nota,
                ...[1,2,3,4].map(n=>p[n].valor===null?null:arredondar(p[n].valor*PESOS[n])),
                r.total,r.media,row.presencas,row.faltas,row.percentual,row.situacao]);
            memoria.push([row.numero,row.nome,...[1,2,3,4].map(n=>p[n].efetiva),
                r.completo?'SIM':'NÃO',rec[1].alvo,rec[1].aplicada?'SIM':'NÃO',
                rec[2].alvo,rec[2].aplicada?'SIM':'NÃO']);
        }
        main.push([]);main.push(['REC 1: 1ª/2ª AV. · REC 2: 3ª/4ª AV. · Sem peso próprio. Apenas notas maiores substituem a original.']);
        main.push(['Relatório calculado neste dispositivo. Edições pendentes podem não constar no Supabase. Não usar como fechamento oficial sem conferência.']);
        const diario=[['DATA','TÍTULO','ALUNO(A)','CONTEÚDO','SITUAÇÃO']];
        const alunoPorId=new Map(relatorio.alunos.map(a=>[id(a.id),a.nome_completo]));
        for(const d of relatorio.diario) diario.push([d.data_referencia||'',d.titulo||'',
            alunoPorId.get(id(d.aluno_id))||'',d.conteudo||'',d._pendente?'PENDENTE':'CÓPIA LOCAL']);
        return [
            {name:'Mapa Final', xml:sheet(main,{headers:new Set([5,6,7]),titleRows:new Set([1]),
                merges:['A1:R1','A2:K2','L2:R2','A3:R3','A4:R4','A5:A7','B5:B7',
                    'C5:H5','I5:N5','O5:Q5','R5:R7','M6:M7','N6:N7','O6:Q6',
                    ...['C','D','E','F','G','H'].map(c=>`${c}6:${c}7`)],
                colWidths:{A:6,B:34,C:9,D:9,E:9,F:9,G:9,H:9,I:10,J:10,K:10,L:10,M:15,N:13,O:13,P:11,Q:11,R:19},print:true})},
            {name:'Memória de Cálculo', xml:sheet(memoria,{headers:new Set([1]),freeze:'B2',colWidths:{A:6,B:36,C:17,D:17,E:17,F:17,G:25,H:20,I:20,J:20,K:20}})},
            {name:'Diário de Bordo', xml:sheet(diario,{headers:new Set([1]),freeze:'B2',colWidths:{A:16,B:34,C:30,D:65,E:19}})}
        ];
    }
    const utf8 = text => new TextEncoder().encode(text);
    const concat = parts => {const size=parts.reduce((n,p)=>n+p.length,0);const out=new Uint8Array(size);let off=0;for(const p of parts){out.set(p,off);off+=p.length;}return out;};
    const w16 = n => Uint8Array.of(n&255,(n>>>8)&255);
    const w32 = n => Uint8Array.of(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255);
    const crcTable=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let j=0;j<8;j++)c=(c&1)?0xEDB88320^(c>>>1):c>>>1;t.push(c>>>0);}return t;})();
    const crc32 = data => {let c=0xFFFFFFFF;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0;};
    function criarZip(arquivos) {
        const locals=[],central=[];let offset=0;
        for (const [nome, conteudo] of Object.entries(arquivos)) {
            const name=utf8(nome), bytes=utf8(conteudo), crc=crc32(bytes);
            if(bytes.length>30_000_000)throw new Error('Relatório muito grande para exportar neste dispositivo.');
            const local=concat([w32(0x04034b50),w16(20),w16(0x0800),w16(0),w16(0),w16(0),
                w32(crc),w32(bytes.length),w32(bytes.length),w16(name.length),w16(0),name,bytes]);
            locals.push(local);
            central.push(concat([w32(0x02014b50),w16(20),w16(20),w16(0x0800),w16(0),w16(0),w16(0),
                w32(crc),w32(bytes.length),w32(bytes.length),w16(name.length),w16(0),w16(0),w16(0),
                w16(0),w32(0),w32(offset),name]));
            offset+=local.length;
        }
        const centro=concat(central);
        if(offset+centro.length>60_000_000)throw new Error('Relatório excede o limite de exportação local.');
        return concat([...locals,centro,w32(0x06054b50),w16(0),w16(0),w16(central.length),
            w16(central.length),w32(centro.length),w32(offset),w16(0)]);
    }
    function gerarXlsx(relatorio) {
        const sheets=bookSheets(relatorio);
        const tipos='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
            '<Default Extension="xml" ContentType="application/xml"/>'+
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
            sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>';
        const workbook='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+
            sheets.map((s,i)=>`<sheet name="${xmlEscape(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+
            '</sheets><calcPr fullCalcOnLoad="1"/></workbook>';
        const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
            sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+
            `<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
        const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
            '<fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="14"/><name val="Arial"/></font><font><b/><sz val="9"/><name val="Arial"/></font></fonts>'+
            '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E7E7"/><bgColor indexed="64"/></patternFill></fill></fills>'+
            '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'+
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
            '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'+
            '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'+
            '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'+
            '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';
        const files={'[Content_Types].xml':tipos,
            '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
            'xl/workbook.xml':workbook,'xl/_rels/workbook.xml.rels':rels,'xl/styles.xml':styles};
        sheets.forEach((s,i)=>files[`xl/worksheets/sheet${i+1}.xml`]=s.xml);
        return criarZip(files);
    }
    function download(file, name) {
        const url=URL.createObjectURL(file);
        const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),30000);
    }
    function safeFilename(value) {return String(value || 'Turma').replace(/[^\p{L}\p{N} ._-]+/gu,'_').slice(0,60).trim() || 'Turma';}

    async function render({snapshot,conta}) {
        const area=document.getElementById('offline-relatorios');
        if(!area)return;
        area.replaceChildren();
        if(!Array.isArray(snapshot.frequencias) || !Number.isInteger(snapshot.ano_letivo)) {
            area.append(document.createTextNode('Baixe novamente os dados no Perfil para incluir as frequências do ano letivo e habilitar os relatórios offline.'));
            return;
        }
        const [academicas, freq, turmas]=await Promise.all([
            listarEdicoesAcademicas(conta), getPendentes(), listarEdicoesOffline(conta)]);
        const dados=montarDados(snapshot, academicas,
            freq.filter(item=>item.usuario_id === conta), turmas);
        dados.vinculos=snapshot.vinculos;
        const label=document.createElement('label');label.textContent='Turma para o relatório';
        const selector=document.createElement('select');
        dados.turmas.forEach(t=>selector.append(new Option(t.nome,id(t.id))));
        label.append(selector);area.append(label);
        const status=document.createElement('p');status.className='muted';status.setAttribute('role','status');area.append(status);
        const buttons=document.createElement('div');buttons.className='toolbar';
        const preview=document.createElement('button');preview.textContent='Consultar rendimento';preview.type='button';
        const exportar=document.createElement('button');exportar.textContent='Exportar Mapa Final (.xlsx)';exportar.type='button';
        buttons.append(preview,exportar);area.append(buttons);
        const saida=document.createElement('div');saida.className='report-results';area.append(saida);
        const update=()=>{
            const rel=montarRelatorio(dados,selector.value);
            status.textContent=`Ano letivo ${rel.ano} · cópia de ${new Date(rel.salvamento).toLocaleString('pt-BR')}`+
                (rel.alteracoesLocais?` · ${rel.alteracoesLocais} operação(ões) locais ainda não enviada(s).`:' · Sem edições locais pendentes.')+
                (rel.possuiConflitos?' ⚠️ Existem conflitos pendentes.':'');
            return rel;
        };
        const mostrar=()=>{
            saida.replaceChildren();const rel=update();
            const wrapper=document.createElement('div');wrapper.className='report-table-wrap';
            const table=document.createElement('table');table.className='report-table';
            const head=document.createElement('thead');const tr=document.createElement('tr');
            ['Aluno(a)','1ª','2ª','REC 1','3ª','4ª','REC 2','Média anual','Pres.','Faltas','% freq.','Resultado']
                .forEach(s=>{const th=document.createElement('th');th.textContent=s;tr.append(th);});
            head.append(tr);table.append(head);const body=document.createElement('tbody');
            for(const aluno of rel.linhas){const tr=document.createElement('tr');const r=aluno.rendimento;
                [aluno.nome,r.periodos[1].original,r.periodos[2].original,r.recuperacoes[1].nota,
                    r.periodos[3].original,r.periodos[4].original,r.recuperacoes[2].nota,
                    r.media,aluno.presencas,aluno.faltas,aluno.percentual,aluno.situacao]
                    .forEach((v,i)=>{const td=document.createElement('td');td.textContent=v===null?'—':
                        typeof v==='number'&&i>0&&i<8?v.toFixed(2):String(v);tr.append(td);});body.append(tr);
            }
            table.append(body);wrapper.append(table);saida.append(wrapper);
            const nota=document.createElement('p');nota.className='muted';
            nota.textContent='Recuperações aplicadas somente quando vantajosas. Totais usam notas efetivas (pesos 2/3/2/3). '+
                'Relatório provisório: confira pendências, datas e chamadas antes do fechamento oficial.';
            saida.append(nota);
        };
        selector.addEventListener('change',()=>{saida.replaceChildren();update();});
        preview.addEventListener('click',mostrar);
        exportar.addEventListener('click',async()=>{
            if(exportar.disabled)return;
            const rel=update();
            if(!confirm('Exportar um Mapa Final com dados pessoais, notas e diário salvos neste dispositivo? '+
                'É uma prévia local, possivelmente com alterações não sincronizadas.'))return;
            exportar.disabled=true;preview.disabled=true;
            try{
                const bytes=gerarXlsx(rel);
                download(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),
                    `Mapa_Final_OFFLINE_${safeFilename(rel.turma)}_${rel.ano}.xlsx`);
                status.textContent+=' Arquivo Excel gerado neste dispositivo.';
            }catch(error){console.error(error);status.textContent='Erro ao exportar: '+error.message;}
            finally{exportar.disabled=false;preview.disabled=false;}
        });
        update();
    }
    const api={render, montarDados, montarRelatorio, calcularRendimento, gerarXlsx};
    if(typeof window !== 'undefined') window.ClasseRelatoriosOffline=api;
    if(typeof module !== 'undefined' && module.exports) module.exports=api;
})();
