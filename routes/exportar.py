# routes/exportar.py

import io
from flask import Blueprint, request, send_file, jsonify, render_template
from utils import supabase
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill
from xhtml2pdf import pisa

exportar_bp = Blueprint('exportar_bp', __name__)

# --- HELPERS ---
def gerar_pdf_bytes(html_string):
    pdf_buffer = io.BytesIO()
    pisa_status = pisa.CreatePDF(html_string, dest=pdf_buffer)
    if pisa_status.err: return None
    pdf_buffer.seek(0)
    return pdf_buffer

def estilizar_cabecalho_excel(ws, cor="007BFF"):
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color=cor, end_color=cor, fill_type="solid")
        cell.alignment = Alignment(horizontal="center")

# --- FREQUÊNCIA E GERAL (MANTIDOS IGUAIS) ---

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

# --- PDF FREQUENCIA E GERAL ---
@exportar_bp.route('/exportar/turma/<uuid:turma_id>/frequencia/pdf', methods=['GET'])
def exportar_frequencia_dia_pdf(turma_id):
    try:
        data_chamada = request.args.get('data')
        res_turma = supabase.table('turmas').select('nome').eq('id', turma_id).single().execute()
        turma_nome = res_turma.data['nome']
        dados, _ = supabase.rpc('get_frequencia_para_exportar', {'p_turma_id': str(turma_id), 'p_data': data_chamada}).execute()
        
        html = render_template('relatorios/diario_pdf.html', turma_nome=turma_nome, data_chamada=data_chamada, lista_alunos=dados[1])
        pdf_buffer = gerar_pdf_bytes(html)
        return send_file(pdf_buffer, as_attachment=True, download_name=f"Chamada_{data_chamada}.pdf", mimetype='application/pdf')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@exportar_bp.route('/exportar/turma/<uuid:turma_id>/geral/pdf', methods=['GET'])
def exportar_frequencia_geral_pdf(turma_id):
    try:
        res_turma = supabase.table('turmas').select('nome').eq('id', turma_id).single().execute()
        dados, _ = supabase.rpc('get_turma_stats', {'p_turma_id': str(turma_id)}).execute()
        
        html = render_template('relatorios/geral_pdf.html', turma_nome=res_turma.data['nome'], stats=dados[1])
        pdf_buffer = gerar_pdf_bytes(html)
        return send_file(pdf_buffer, as_attachment=True, download_name=f"Relatorio_Geral.pdf", mimetype='application/pdf')
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==============================================================================
#  CORREÇÃO: BOLETIM DE NOTAS (LÓGICA CORRIGIDA)
# ==============================================================================

def buscar_dados_notas(turma_id):
    """ Busca e cruza Avaliações x Alunos x Notas corretamente """
    
    # 1. Buscar Avaliações da Turma
    res_av, _ = supabase.table('avaliacoes').select('id, nome').eq('turma_id', turma_id).execute()
    avaliacoes = res_av[1]
    
    if not avaliacoes: return {}, []

    av_ids = [av['id'] for av in avaliacoes]
    map_av_nome = {av['id']: av['nome'] for av in avaliacoes}
    colunas_avaliacoes = sorted([av['nome'] for av in avaliacoes])

    # 2. Buscar TODOS os Alunos da Turma (via tabela de vínculo)
    res_alunos, _ = supabase.table('turmas_alunos')\
        .select('alunos(id, nome_completo)')\
        .eq('turma_id', turma_id)\
        .execute()
    
    alunos_notas = {}
    map_aluno_id_nome = {}
    
    # Inicializa todos os alunos com vazio
    for item in res_alunos[1]:
        aluno = item['alunos']
        if aluno:
            alunos_notas[aluno['nome_completo']] = {}
            map_aluno_id_nome[aluno['id']] = aluno['nome_completo']

    # 3. Buscar Notas (apenas das avaliações desta turma)
    if av_ids:
        res_notas, _ = supabase.table('notas')\
            .select('aluno_id, avaliacao_id, valor')\
            .in_('avaliacao_id', av_ids)\
            .execute()
        
        for nota in res_notas[1]:
            aluno_nome = map_aluno_id_nome.get(nota['aluno_id'])
            av_nome = map_av_nome.get(nota['avaliacao_id'])
            
            # Se achou o aluno e a avaliação, preenche a célula
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
        
        # Cabeçalho
        ws.append(['Aluno'] + colunas_avaliacoes)

        # Linhas
        for nome_aluno, notas_dict in alunos_notas.items():
            row = [nome_aluno]
            for aval in colunas_avaliacoes:
                # Pega a nota ou '-'
                val = notas_dict.get(aval, '-')
                row.append(val)
            ws.append(row)

        estilizar_cabecalho_excel(ws, "6610f2") # Roxo
        ws.column_dimensions['A'].width = 35

        file_buffer = io.BytesIO()
        wb.save(file_buffer)
        file_buffer.seek(0)
        return send_file(file_buffer, as_attachment=True, download_name=f"Boletim_{turma_nome}.xlsx", mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    except Exception as e:
        print(f"Erro Notas Excel: {e}")
        return jsonify({"error": "Erro ao gerar Excel.", "details": str(e)}), 500

@exportar_bp.route('/exportar/turma/<uuid:turma_id>/notas/pdf', methods=['GET'])
def exportar_notas_pdf(turma_id):
    try:
        res_turma = supabase.table('turmas').select('nome').eq('id', turma_id).single().execute()
        turma_nome = res_turma.data['nome']

        alunos_notas, colunas_avaliacoes = buscar_dados_notas(turma_id)

        html = render_template(
            'relatorios/notas_pdf.html', 
            turma_nome=turma_nome, 
            alunos_notas=alunos_notas, 
            colunas_avaliacoes=colunas_avaliacoes
        )

        pdf_buffer = gerar_pdf_bytes(html)
        return send_file(pdf_buffer, as_attachment=True, download_name=f"Boletim_{turma_nome}.pdf", mimetype='application/pdf')
    except Exception as e:
        return jsonify({"error": "Erro ao gerar PDF.", "details": str(e)}), 500