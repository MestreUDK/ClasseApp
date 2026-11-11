/* Dia e mês são suficientes para avisos. O ano só é necessário para calcular
 * idade; nunca inventar um ano fictício nem enviá-lo como DATE ao Supabase.
 */
(() => {
    'use strict';
    const bissexto = ano => ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
    const diasPorMes = (mes, ano = 2000) => [0,31,bissexto(ano)?29:28,31,30,31,30,31,31,30,31,30,31][mes] || 0;
    const pad = numero => String(numero).padStart(2, '0');
    function obter(els) {
        const diaTxt = els.nascimentoDia.value.trim();
        const mesTxt = els.nascimentoMes.value.trim();
        const anoTxt = els.nascimentoAno.value.trim();
        if (!diaTxt && !mesTxt && !anoTxt) return {data_nascimento:null, aniversario_dia_mes:null};
        if (!diaTxt || !mesTxt) throw new Error('Para informar o aniversário, preencha dia e mês. O ano é opcional.');
        if (![diaTxt, mesTxt, anoTxt].every(t => !t || /^\d+$/.test(t))) {
            throw new Error('Dia, mês e ano devem conter apenas números inteiros.');
        }
        const dia = Number(diaTxt), mes = Number(mesTxt);
        const ano = anoTxt ? Number(anoTxt) : null;
        if (mes < 1 || mes > 12 || dia < 1 || dia > diasPorMes(mes, ano || 2000)) {
            throw new Error('Dia e mês inválidos para a data informada.');
        }
        if (ano !== null && (ano < 1 || ano > 9999 ||
            `${String(ano).padStart(4,'0')}-${pad(mes)}-${pad(dia)}` > (() => { const h = new Date(); return `${h.getFullYear()}-${pad(h.getMonth()+1)}-${pad(h.getDate())}`; })())) {
            // Validation on the server also rejects dates in the future. Date-only
            // comparison here avoids local timezone arithmetic and negative ages.
            throw new Error('O ano informado é inválido ou a data está no futuro.');
        }
        return ano === null
            ? {data_nascimento:null, aniversario_dia_mes:`${pad(mes)}-${pad(dia)}`}
            : {data_nascimento:`${String(ano).padStart(4, '0')}-${pad(mes)}-${pad(dia)}`, aniversario_dia_mes:null};
    }
    function preencher(els, aluno = {}) {
        let dia = '', mes = '', ano = '';
        if (typeof aluno.data_nascimento === 'string' && /^\d{4}-\d{2}-\d{2}/.test(aluno.data_nascimento)) {
            [ano, mes, dia] = aluno.data_nascimento.slice(0,10).split('-');
        } else if (typeof aluno.aniversario_dia_mes === 'string' && /^\d{2}-\d{2}$/.test(aluno.aniversario_dia_mes)) {
            [mes, dia] = aluno.aniversario_dia_mes.split('-');
        }
        els.nascimentoDia.value = dia ? String(Number(dia)) : '';
        els.nascimentoMes.value = mes ? String(Number(mes)) : '';
        els.nascimentoAno.value = ano ? String(Number(ano)) : '';
    }
    function formatar(aluno = {}) {
        const nascimento = aluno.data_nascimento;
        if (typeof nascimento === 'string' && /^\d{4}-\d{2}-\d{2}/.test(nascimento)) {
            const [ano, mes, dia] = nascimento.slice(0,10).split('-');
            return `${dia}/${mes}/${ano}`;
        }
        const parcial = aluno.aniversario_dia_mes;
        if (typeof parcial === 'string' && /^\d{2}-\d{2}$/.test(parcial)) {
            return `${parcial.slice(3)}/${parcial.slice(0,2)} (ano não informado)`;
        }
        return null;
    }
    window.ClasseDataAniversario = {obter, preencher, formatar};
})();
