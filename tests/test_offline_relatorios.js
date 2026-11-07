'use strict';
// Execute: node tests/test_offline_relatorios.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const reports = require('../static/js/offline_relatorios.js');
const turmas = [{id:'turma-1',nome:'8º A',disciplinas:{nome:'Matemática'}}];
const avaliacoes = [1,2,3,4].map(p=>({id:`av${p}`,turma_id:'turma-1',
    periodo_tipo:'avaliacao',periodo_numero:p,categoria:'prova',nota_maxima:10,peso:1,
    data:`2026-0${p}-10`}));
avaliacoes.push({id:'rec1',turma_id:'turma-1',periodo_tipo:'avaliacao',periodo_numero:1,
    categoria:'recuperacao',nota_maxima:10,recuperacao_modo:'automatico'});
const notas = [4,3,7,6].map((valor,i)=>({avaliacao_id:`av${i+1}`,aluno_id:'a1',valor,revision:1}));
notas.push({avaliacao_id:'rec1',aluno_id:'a1',valor:8,revision:1});
const snapshot={usuario_id:'prof-1',salvo_em:'2026-11-07T12:00:00Z',ano_letivo:2026,
    turmas,alunos:[{id:'a1',nome_completo:'=HYPERLINK("BAD")'},
        {id:'a2',nome_completo:'Aluno & Filho'}],
    vinculos:[{turma_id:'turma-1',aluno_id:'a1'},{turma_id:'turma-1',aluno_id:'a2'}],
    avaliacoes,notas,
    frequencias:[
        {turma_id:'turma-1',aluno_id:'a1',data:'2026-04-01',presente:true,updated_at:'2026-04-01T12:00Z'},
        {turma_id:'turma-1',aluno_id:'a1',data:'2026-04-02',presente:false,updated_at:'2026-04-02T12:00Z'},
        {turma_id:'turma-1',aluno_id:'a1',data:'2025-04-03',presente:false,updated_at:'2026-04-03T12:00Z'}],
    diario:[{id:'d1',turma_id:'turma-1',data_referencia:'2026-03-02',titulo:'Aula <Algebra>',conteudo:'Menos & mais'}]};
let dados = reports.montarDados(snapshot);
let r = reports.montarRelatorio(dados,'turma-1');
assert.equal(r.linhas[0].rendimento.periodos[2].efetiva,8);
assert.equal(r.linhas[0].rendimento.media,6.4);
assert.equal(r.linhas[0].rendimento.recuperacoes[1].alvo,2);
assert.equal(r.linhas[0].presencas,1);
assert.equal(r.linhas[0].faltas,1);
assert.equal(r.linhas[0].percentual,50);
assert.equal(r.linhas[0].situacao,'REPROVADO');
assert.equal(r.linhas[1].rendimento.media,null);
assert.equal(r.linhas[1].situacao,'EM ANDAMENTO');
const override = [{usuario_id:'prof-1',criado_em:'2026-11-07T12:30Z',
    dados:{turma_id:'turma-1',aluno_id:'a1',data:'2026-04-02',presente:true}}];
dados = reports.montarDados(snapshot,[],override);
r=reports.montarRelatorio(dados,'turma-1');
assert.equal(r.linhas[0].percentual,100);
assert.equal(r.linhas[0].situacao,'APROVADO');
assert.equal(r.alteracoesLocais,1);
const manual=JSON.parse(JSON.stringify(snapshot));
manual.avaliacoes[4].recuperacao_modo='manual';
manual.notas[4].recupera_periodo=1;
r=reports.montarRelatorio(reports.montarDados(manual),'turma-1');
assert.equal(r.linhas[0].rendimento.recuperacoes[1].alvo,1);
assert.equal(r.linhas[0].rendimento.media,5.7);
const notaPendente={tipo:'nota',avaliacao_id:'av1',aluno_id:'a1',dados:{valor:9},estado:'pendente'};
r=reports.montarRelatorio(reports.montarDados(snapshot,[notaPendente]),'turma-1');
assert.equal(r.linhas[0].rendimento.periodos[1].efetiva,9);
const excluir={tipo:'nota_excluir',avaliacao_id:'av4',aluno_id:'a1',dados:{}};
r=reports.montarRelatorio(reports.montarDados(snapshot,[excluir]),'turma-1');
assert.equal(r.linhas[0].rendimento.media,null);
assert.equal(r.linhas[0].situacao,'EM ANDAMENTO');
const xlsx=reports.gerarXlsx(reports.montarRelatorio(reports.montarDados(snapshot),'turma-1'));
assert.equal(Buffer.from(xlsx.subarray(0,4)).toString('hex'),'504b0304');
assert.ok(xlsx.byteLength>5000);
fs.writeFileSync('/mnt/data/classeapp_221_work/teste_mapa_offline.xlsx',xlsx);
console.log('OK: 17 cenários de cálculo e exportação offline. XLSX',xlsx.length,'bytes');
