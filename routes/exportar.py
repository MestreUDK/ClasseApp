# routes/exportar.py

import io
from flask import Blueprint, request, send_file, jsonify
from utils import supabase
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill

exportar_bp = Blueprint('exportar_bp', __name__)

# --- HELPERS ---
def estilizar_cabecalho_excel(ws, cor="007BFF"):
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color=cor, end_color=cor, fill_type="solid")
        cell.alignment = Alignment(horizontal="center")

# --- EXPORTAR EXCEL: FREQUÊNCIA DO DIA ---
@exportar_bp.route('/exportar/turma/<uuid:turma_id>/frequencia', methods=['GET'])
def exportar_frequencia_dia_excel(turma_id):
    try:
        data = request.args.get('data')
        res_turma = supabase.table('turmas').select('nome').eq('id', turma_id).single().execute()
        turma_nome = res_turma.data['nome']

        dados, _ = supabase.rpc('get_frequencia_para_exportar', {'p_turma_id': str(turma_id), 'p_data': data}).execute()

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = f"Chamada {data}"
        ws.append(['Aluno', 'Status'])

        for row in dados[1]:
            status = 'Presente' if row['presente'] is True else 'Falta'
            ws.append([row['nome_completo'], status])

        estilizar_cabecalho_excel(ws, "007BFF")
        ws.column_dimensions['A'].width = 40

        file_buffer = io.BytesIO()
        wb.save(file_buffer)
        file_buffer.seek(0)
        return send_file(file_buffer, as_attachment=True, download_name=f"Chamada_{turma_nome}_{data}.xlsx", mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- EXPORTAR EXCEL: VISÃO GERAL ---
@exportar_bp.route('/exportar/turma/<uuid:turma_id>/geral', methods=['GET'])
def exportar_frequencia_geral_excel(turma_id):
    try:
        res_dados, _ = supabase.rpc('get_frequencia_geral', {'p_turma_id': str(turma_id)}).execute()
        dados = res_dados[1]

        alunos_dict = {}
        datas_set = set()
        if dados:
            for row in dados:
                datas_set.add(row['data_chamada'])
                if row['aluno_nome'] not in alunos_dict:
                    alunos_dict[row['aluno_nome']] = {'frequencias': {}} 
                alunos_dict[row['aluno_nome']]['frequencias'][row['data_chamada']] = row['presente']

        datas_ordenadas = sorted(list(datas_set))
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Visão Geral"
        ws.append(['Aluno'] + datas_ordenadas + ['% Presença'])

        for nome, info in alunos_dict.items():
            row = [nome]
            total_aulas = 0
            total_presencas = 0
            for data in datas_ordenadas:
                status = info['frequencias'].get(data)
                if status is True:
                    row.append('P'); total_presencas += 1; total_aulas += 1
                elif status is False:
                    row.append('F'); total_aulas += 1
                else: row.append('-')

            porc = 0
            if total_aulas > 0: porc = round((total_presencas / total_aulas) * 100, 1)
            row.append(f"{porc}%")
            ws.append(row)

        estilizar_cabecalho_excel(ws, "007BFF")
        ws.column_dimensions['A'].width = 30

        file_buffer = io.BytesIO()
        wb.save(file_buffer)
        file_buffer.seek(0)
        return send_file(file_buffer, as_attachment=True, download_name=f"Relatorio_Geral.xlsx", mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- EXPORTAR EXCEL: BOLETIM DE NOTAS ---
def buscar_dados_notas(turma_id):
    res_av, _ = supabase.table('avaliacoes').select('id, nome').eq('turma_id', turma_id).execute()
    avaliacoes = res_av[1]
    if not avaliacoes: return {}, []
    av_ids = [av['id'] for av in avaliacoes]
    map_av_nome = {av['id']: av['nome'] for av in avaliacoes}
    colunas_avaliacoes = sorted([av['nome'] for av in avaliacoes])
    res_alunos, _ = supabase.table('turmas_alunos').select('alunos(id, nome_completo)').eq('turma_id', turma_id).execute()
    alunos_notas = {}
    map_aluno_id_nome = {}
    for item in res_alunos[1]:
        aluno = item['alunos']
        if aluno:
            alunos_notas[aluno['nome_completo']] = {}
            map_aluno_id_nome[aluno['id']] = aluno['nome_completo']
    if av_ids:
        res_notas, _ = supabase.table('notas').select('aluno_id, avaliacao_id, valor').in_('avaliacao_id', av_ids).execute()
        for nota in res_notas[1]:
            aluno_nome = map_aluno_id_nome.get(nota['aluno_id'])
            av_nome = map_av_nome.get(nota['avaliacao_id'])
            if aluno_nome and av_nome:
                alunos_notas[aluno_nome][av_nome] = nota['valor']
    return alunos_notas, colunas_avaliacoes

@exportar_bp.route('/exportar/turma/<uuid:turma_id>/notas', methods=['GET'])
def exportar_notas_excel(turma_id):
    try:
        res_turma = supabase.table('turmas').select('nome').eq('id', turma_id).single().execute()
        turma_nome = res_turma.data['nome']
        alunos_notas, colunas_avaliacoes = buscar_dados_notas(turma_id)
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Notas"
        ws.append(['Aluno'] + colunas_avaliacoes)
        for nome_aluno, notas_dict in alunos_notas.items():
            row = [nome_aluno]
            for aval in colunas_avaliacoes:
                val = notas_dict.get(aval, '-')
                row.append(val)
            ws.append(row)
        estilizar_cabecalho_excel(ws, "6610f2") 
        ws.column_dimensions['A'].width = 35
        file_buffer = io.BytesIO()
        wb.save(file_buffer)
        file_buffer.seek(0)
        return send_file(file_buffer, as_attachment=True, download_name=f"Boletim_{turma_nome}.xlsx", mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    except Exception as e:
        return jsonify({"error": "Erro ao gerar Excel.", "details": str(e)}), 500