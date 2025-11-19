# routes/exportar.py

import io
from flask import Blueprint, request, send_file, jsonify, render_template
from utils import supabase
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill
from xhtml2pdf import pisa

exportar_bp = Blueprint('exportar_bp', __name__)

# --- HELPER DE PDF SIMPLIFICADO ---
def gerar_pdf_bytes(html_string):
    """ Gera o PDF e retorna o buffer ABERTO para o Flask enviar """
    pdf_buffer = io.BytesIO()
    pisa_status = pisa.CreatePDF(html_string, dest=pdf_buffer)
    
    if pisa_status.err:
        return None
    
    pdf_buffer.seek(0) # Volta para o início do arquivo para leitura
    return pdf_buffer

# --- HELPER DE EXCEL ---
def estilizar_cabecalho_excel(ws):
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="007BFF", end_color="007BFF", fill_type="solid")
        cell.alignment = Alignment(horizontal="center")

# --- ROTAS EXCEL (.xlsx) ---

@exportar_bp.route('/exportar/turma/<uuid:turma_id>/frequencia', methods=['GET'])
def exportar_frequencia_dia_excel(turma_id):
    try:
        data = request.args.get('data')
        if not data: return jsonify({"error": "Data obrigatória"}), 400
        
        res_turma = supabase.table('turmas').select('nome').eq('id', turma_id).single().execute()
        turma_nome = res_turma.data['nome'] if res_turma.data else "Turma"

        dados, _ = supabase.rpc('get_frequencia_para_exportar', {'p_turma_id': str(turma_id), 'p_data': data}).execute()

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = f"Chamada {data}"
        ws.append(['Aluno', 'Status'])
        
        for row in dados[1]:
            status = 'Presente' if row['presente'] is True else 'Falta'
            ws.append([row['nome_completo'], status])

        estilizar_cabecalho_excel(ws)
        ws.column_dimensions['A'].width = 40
        ws.column_dimensions['B'].width = 15

        file_buffer = io.BytesIO()
        wb.save(file_buffer)
        file_buffer.seek(0)

        safe_name = "".join(c for c in turma_nome if c.isalnum() or c in (' ', '-')).rstrip()
        return send_file(file_buffer, as_attachment=True, download_name=f"Chamada_{safe_name}_{data}.xlsx", mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@exportar_bp.route('/exportar/turma/<uuid:turma_id>/geral', methods=['GET'])
def exportar_frequencia_geral_excel(turma_id):
    try:
        res_dados, _ = supabase.rpc('get_frequencia_geral', {'p_turma_id': str(turma_id)}).execute()
        dados = res_dados[1]
        if not dados: return jsonify({"error": "Sem dados."}), 404

        alunos_dict = {}
        datas_set = set()
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

        estilizar_cabecalho_excel(ws)
        ws.column_dimensions['A'].width = 30
        
        file_buffer = io.BytesIO()
        wb.save(file_buffer)
        file_buffer.seek(0)
        return send_file(file_buffer, as_attachment=True, download_name=f"Relatorio_Geral.xlsx", mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@exportar_bp.route('/exportar/turma/<uuid:turma_id>/notas', methods=['GET'])
def exportar_notas_excel(turma_id):
    try:
        res_turma = supabase.table('turmas').select('nome').eq('id', turma_id).single().execute()
        turma_nome = res_turma.data['nome']

        res_av = supabase.table('avaliacoes').select('*').eq('turma_id', turma_id).order('data').execute()
        avaliacoes = res_av.data

        res_alunos = supabase.table('turmas_alunos').select('alunos(id, nome_completo)').eq('turma_id', turma_id).execute()
        alunos = [item['alunos'] for item in res_alunos.data]
        alunos.sort(key=lambda x: x['nome_completo'])

        av_ids = [av['id'] for av in avaliacoes]
        notas_map = {}
        if av_ids:
            res_notas = supabase.table('notas').select('*').in_('avaliacao_id', av_ids).execute()
            for n in res_notas.data:
                notas_map[f"{n['aluno_id']}-{n['avaliacao_id']}"] = n['valor']

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Boletim"

        headers = ['Aluno'] + [av['nome'] for av in avaliacoes] + ['Total']
        ws.append(headers)

        for aluno in alunos:
            row = [aluno['nome_completo']]
            soma_notas = 0
            for av in avaliacoes:
                key = f"{aluno['id']}-{av['id']}"
                nota = notas_map.get(key)
                if nota is not None:
                    row.append(nota)
                    soma_notas += float(nota)
                else:
                    row.append('-')
            row.append(soma_notas)
            ws.append(row)

        estilizar_cabecalho_excel(ws)
        ws.column_dimensions['A'].width = 30

        file_buffer = io.BytesIO()
        wb.save(file_buffer)
        file_buffer.seek(0)

        return send_file(file_buffer, as_attachment=True, download_name=f"Boletim_{turma_nome}.xlsx", mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- ROTAS PDF (CORRIGIDAS) ---

@exportar_bp.route('/exportar/turma/<uuid:turma_id>/frequencia/pdf', methods=['GET'])
def exportar_frequencia_dia_pdf(turma_id):
    try:
        data_chamada = request.args.get('data')
        if not data_chamada: return jsonify({"error": "Data obrigatória"}), 400

        res_turma = supabase.table('turmas').select('nome').eq('id', turma_id).single().execute()
        turma_nome = res_turma.data['nome']
        
        dados, _ = supabase.rpc('get_frequencia_para_exportar', {'p_turma_id': str(turma_id), 'p_data': data_chamada}).execute()
        lista_alunos = dados[1]

        html = render_template('relatorios/diario_pdf.html', turma_nome=turma_nome, data_chamada=data_chamada, lista_alunos=lista_alunos)

        pdf_buffer = gerar_pdf_bytes(html)

        if pdf_buffer:
            return send_file(
                pdf_buffer, 
                as_attachment=True, 
                download_name=f"Chamada_{data_chamada}.pdf", 
                mimetype='application/pdf'
            )
        else:
            return jsonify({"error": "Erro na conversão do PDF (pisa)"}), 500

    except Exception as e:
        print(f"Erro PDF: {e}")
        return jsonify({"error": f"Erro ao gerar PDF: {str(e)}"}), 500

@exportar_bp.route('/exportar/turma/<uuid:turma_id>/geral/pdf', methods=['GET'])
def exportar_frequencia_geral_pdf(turma_id):
    try:
        res_turma = supabase.table('turmas').select('nome').eq('id', turma_id).single().execute()
        turma_nome = res_turma.data['nome']

        dados, _ = supabase.rpc('get_turma_stats', {'p_turma_id': str(turma_id)}).execute()
        stats = dados[1]

        html = render_template('relatorios/geral_pdf.html', turma_nome=turma_nome, stats=stats)

        pdf_buffer = gerar_pdf_bytes(html)

        if pdf_buffer:
            return send_file(
                pdf_buffer, 
                as_attachment=True, 
                download_name=f"Relatorio_Geral_{turma_nome}.pdf", 
                mimetype='application/pdf'
            )
        else:
            return jsonify({"error": "Erro na conversão do PDF (pisa)"}), 500

    except Exception as e:
        print(f"Erro PDF Geral: {e}")
        return jsonify({"error": f"Erro ao gerar PDF: {str(e)}"}), 500

@exportar_bp.route('/exportar/turma/<uuid:turma_id>/notas/pdf', methods=['GET'])
def exportar_notas_pdf(turma_id):
    try:
        res_turma = supabase.table('turmas').select('nome').eq('id', turma_id).single().execute()
        turma_nome = res_turma.data['nome']

        res_av = supabase.table('avaliacoes').select('*').eq('turma_id', turma_id).order('data').execute()
        avaliacoes = res_av.data

        res_alunos = supabase.table('turmas_alunos').select('alunos(id, nome_completo)').eq('turma_id', turma_id).execute()
        alunos = [item['alunos'] for item in res_alunos.data]
        alunos.sort(key=lambda x: x['nome_completo'])

        av_ids = [av['id'] for av in avaliacoes]
        notas_map = {}
        if av_ids:
            res_notas = supabase.table('notas').select('*').in_('avaliacao_id', av_ids).execute()
            for n in res_notas.data:
                notas_map[f"{n['aluno_id']}-{n['avaliacao_id']}"] = n['valor']

        linhas_tabela = []
        for aluno in alunos:
            notas_aluno = []
            soma = 0
            for av in avaliacoes:
                val = notas_map.get(f"{aluno['id']}-{av['id']}")
                if val is not None:
                    notas_aluno.append(val)
                    soma += float(val)
                else:
                    notas_aluno.append('-')
            
            linhas_tabela.append({
                'nome': aluno['nome_completo'],
                'notas': notas_aluno,
                'total': soma
            })

        html = render_template('relatorios/notas_pdf.html', 
                               turma_nome=turma_nome, 
                               colunas=[av['nome'] for av in avaliacoes], 
                               linhas=linhas_tabela)

        pdf_buffer = gerar_pdf_bytes(html)

        if pdf_buffer:
            return send_file(
                pdf_buffer, 
                as_attachment=True, 
                download_name=f"Boletim_{turma_nome}.pdf", 
                mimetype='application/pdf'
            )
        else:
            return jsonify({"error": "Erro na conversão do PDF (pisa)"}), 500

    except Exception as e:
        print(f"Erro PDF Notas: {e}")
        return jsonify({"error": f"Erro ao gerar PDF: {str(e)}"}), 500
