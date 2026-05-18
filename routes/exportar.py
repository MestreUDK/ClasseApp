# routes/exportar.py

import io
import openpyxl

from flask import Blueprint, request, send_file, jsonify
from flask_login import login_required, current_user
from openpyxl.styles import Font, Alignment, PatternFill
from utils import supabase

exportar_bp = Blueprint('exportar_bp', __name__)


# ==============================
# HELPERS
# ==============================

def estilizar_cabecalho_excel(ws, cor="007BFF"):
    """Aplica estilo visual ao cabeçalho da planilha."""
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(
            start_color=cor,
            end_color=cor,
            fill_type="solid"
        )
        cell.alignment = Alignment(horizontal="center", vertical="center")


def ajustar_texto_planilha(ws):
    """Aplica quebra de texto e alinhamento vertical nas células."""
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)


def gerar_resposta_excel(wb, nome_arquivo):
    """Gera o arquivo Excel em memória e retorna como download."""
    file_buffer = io.BytesIO()
    wb.save(file_buffer)
    file_buffer.seek(0)

    return send_file(
        file_buffer,
        as_attachment=True,
        download_name=nome_arquivo,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


def verificar_dono_turma(turma_id):
    """Verifica se a turma pertence ao usuário logado."""
    res, _ = supabase.table("turmas") \
        .select("id") \
        .eq("id", str(turma_id)) \
        .eq("user_id", current_user.id) \
        .execute()

    return len(res[1]) > 0


def buscar_nome_turma(turma_id):
    """Busca o nome da turma com segurança."""
    res, _ = supabase.table("turmas") \
        .select("nome") \
        .eq("id", str(turma_id)) \
        .eq("user_id", current_user.id) \
        .single() \
        .execute()

    return res[1]["nome"] if res[1] else "Turma"


# ==============================
# EXPORTAR FREQUÊNCIA DO DIA
# ==============================

@exportar_bp.route("/exportar/turma/<uuid:turma_id>/frequencia", methods=["GET"])
@login_required
def exportar_frequencia_dia_excel(turma_id):
    try:
        data = request.args.get("data")

        if not data:
            return jsonify({"error": "Informe a data da chamada."}), 400

        if not verificar_dono_turma(turma_id):
            return jsonify({"error": "Acesso negado."}), 403

        turma_nome = buscar_nome_turma(turma_id)

        dados, _ = supabase.rpc(
            "get_frequencia_para_exportar",
            {
                "p_turma_id": str(turma_id),
                "p_data": data
            }
        ).execute()

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = f"Chamada {data}"

        ws.append(["Aluno", "Status"])

        for row in dados[1]:
            status = "Presente" if row["presente"] is True else "Falta"
            ws.append([
                row["nome_completo"],
                status
            ])

        estilizar_cabecalho_excel(ws, "007BFF")

        ws.column_dimensions["A"].width = 40
        ws.column_dimensions["B"].width = 18

        ajustar_texto_planilha(ws)

        return gerar_resposta_excel(
            wb,
            f"Chamada_{turma_nome}_{data}.xlsx"
        )

    except Exception as e:
        return jsonify({
            "error": "Erro ao gerar frequência do dia.",
            "details": str(e)
        }), 500


# ==============================
# EXPORTAR FREQUÊNCIA GERAL
# ==============================

@exportar_bp.route("/exportar/turma/<uuid:turma_id>/geral", methods=["GET"])
@login_required
def exportar_frequencia_geral_excel(turma_id):
    try:
        if not verificar_dono_turma(turma_id):
            return jsonify({"error": "Acesso negado."}), 403

        turma_nome = buscar_nome_turma(turma_id)

        res_dados, _ = supabase.rpc(
            "get_frequencia_geral",
            {
                "p_turma_id": str(turma_id)
            }
        ).execute()

        dados = res_dados[1]

        alunos_dict = {}
        datas_set = set()

        if dados:
            for row in dados:
                datas_set.add(row["data_chamada"])

                if row["aluno_nome"] not in alunos_dict:
                    alunos_dict[row["aluno_nome"]] = {
                        "frequencias": {}
                    }

                alunos_dict[row["aluno_nome"]]["frequencias"][row["data_chamada"]] = row["presente"]

        datas_ordenadas = sorted(list(datas_set))

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Visão Geral"

        ws.append(["Aluno"] + datas_ordenadas + ["% Presença"])

        for nome, info in alunos_dict.items():
            row = [nome]

            total_aulas = 0
            total_presencas = 0

            for data in datas_ordenadas:
                status = info["frequencias"].get(data)

                if status is True:
                    row.append("P")
                    total_presencas += 1
                    total_aulas += 1

                elif status is False:
                    row.append("F")
                    total_aulas += 1

                else:
                    row.append("-")

            porcentagem = 0

            if total_aulas > 0:
                porcentagem = round((total_presencas / total_aulas) * 100, 1)

            row.append(f"{porcentagem}%")
            ws.append(row)

        estilizar_cabecalho_excel(ws, "007BFF")

        ws.column_dimensions["A"].width = 35

        for col in range(2, len(datas_ordenadas) + 3):
            ws.column_dimensions[openpyxl.utils.get_column_letter(col)].width = 15

        ajustar_texto_planilha(ws)

        return gerar_resposta_excel(
            wb,
            f"Relatorio_Geral_{turma_nome}.xlsx"
        )

    except Exception as e:
        return jsonify({
            "error": "Erro ao gerar relatório geral.",
            "details": str(e)
        }), 500


# ==============================
# EXPORTAR BOLETIM DE NOTAS
# ==============================

def buscar_dados_notas(turma_id):
    """Busca avaliações, alunos e notas da turma."""
    res_av, _ = supabase.table("avaliacoes") \
        .select("id, nome") \
        .eq("turma_id", str(turma_id)) \
        .eq("user_id", current_user.id) \
        .execute()

    avaliacoes = res_av[1]

    if not avaliacoes:
        return {}, []

    av_ids = [av["id"] for av in avaliacoes]
    map_av_nome = {av["id"]: av["nome"] for av in avaliacoes}
    colunas_avaliacoes = sorted([av["nome"] for av in avaliacoes])

    res_alunos, _ = supabase.table("turmas_alunos") \
        .select("alunos(id, nome_completo)") \
        .eq("turma_id", str(turma_id)) \
        .execute()

    alunos_notas = {}
    map_aluno_id_nome = {}

    for item in res_alunos[1]:
        aluno = item["alunos"]

        if aluno:
            alunos_notas[aluno["nome_completo"]] = {}
            map_aluno_id_nome[aluno["id"]] = aluno["nome_completo"]

    if av_ids:
        res_notas, _ = supabase.table("notas") \
            .select("aluno_id, avaliacao_id, valor") \
            .in_("avaliacao_id", av_ids) \
            .eq("user_id", current_user.id) \
            .execute()

        for nota in res_notas[1]:
            aluno_nome = map_aluno_id_nome.get(nota["aluno_id"])
            av_nome = map_av_nome.get(nota["avaliacao_id"])

            if aluno_nome and av_nome:
                alunos_notas[aluno_nome][av_nome] = nota["valor"]

    return alunos_notas, colunas_avaliacoes


@exportar_bp.route("/exportar/turma/<uuid:turma_id>/notas", methods=["GET"])
@login_required
def exportar_notas_excel(turma_id):
    try:
        if not verificar_dono_turma(turma_id):
            return jsonify({"error": "Acesso negado."}), 403

        turma_nome = buscar_nome_turma(turma_id)

        alunos_notas, colunas_avaliacoes = buscar_dados_notas(turma_id)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Notas"

        ws.append(["Aluno"] + colunas_avaliacoes)

        for nome_aluno, notas_dict in alunos_notas.items():
            row = [nome_aluno]

            for avaliacao in colunas_avaliacoes:
                row.append(notas_dict.get(avaliacao, "-"))

            ws.append(row)

        estilizar_cabecalho_excel(ws, "6610f2")

        ws.column_dimensions["A"].width = 35

        for col in range(2, len(colunas_avaliacoes) + 2):
            ws.column_dimensions[openpyxl.utils.get_column_letter(col)].width = 20

        ajustar_texto_planilha(ws)

        return gerar_resposta_excel(
            wb,
            f"Boletim_{turma_nome}.xlsx"
        )

    except Exception as e:
        return jsonify({
            "error": "Erro ao gerar boletim de notas.",
            "details": str(e)
        }), 500


# ==============================
# EXPORTAR DIÁRIO DE BORDO
# ==============================

@exportar_bp.route("/exportar/diario", methods=["GET"])
@login_required
def exportar_diario_excel():
    try:
        turma_id = request.args.get("turma_id")
        aluno_id = request.args.get("aluno_id")
        data_inicio = request.args.get("data_inicio")
        data_fim = request.args.get("data_fim")

        query = supabase.table("diario") \
            .select(
                "titulo, conteudo, data_referencia, created_at, "
                "turmas(nome), alunos(nome_completo)"
            ) \
            .eq("user_id", current_user.id)

        if turma_id:
            query = query.eq("turma_id", turma_id)

        if aluno_id:
            query = query.eq("aluno_id", aluno_id)

        if data_inicio:
            query = query.gte("data_referencia", data_inicio)

        if data_fim:
            query = query.lte("data_referencia", data_fim)

        res, _ = query.order("data_referencia", desc=False).execute()
        diarios = res[1] or []

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Diário de Bordo"

        ws.append([
            "Data da Ocorrência",
            "Título",
            "Turma",
            "Aluno",
            "Conteúdo",
            "Registrado em"
        ])

        for item in diarios:
            turma = item.get("turmas") or {}
            aluno = item.get("alunos") or {}

            ws.append([
                item.get("data_referencia") or "",
                item.get("titulo") or "",
                turma.get("nome") or "",
                aluno.get("nome_completo") or "",
                item.get("conteudo") or "",
                item.get("created_at") or ""
            ])

        estilizar_cabecalho_excel(ws, "17a2b8")

        ws.column_dimensions["A"].width = 20
        ws.column_dimensions["B"].width = 35
        ws.column_dimensions["C"].width = 25
        ws.column_dimensions["D"].width = 35
        ws.column_dimensions["E"].width = 60
        ws.column_dimensions["F"].width = 28

        ajustar_texto_planilha(ws)

        nome_arquivo = "Diario_de_Bordo.xlsx"

        if data_inicio and data_fim:
            nome_arquivo = f"Diario_de_Bordo_{data_inicio}_a_{data_fim}.xlsx"
        elif data_inicio:
            nome_arquivo = f"Diario_de_Bordo_desde_{data_inicio}.xlsx"
        elif data_fim:
            nome_arquivo = f"Diario_de_Bordo_ate_{data_fim}.xlsx"

        return gerar_resposta_excel(wb, nome_arquivo)

    except Exception as e:
        return jsonify({
            "error": "Erro ao gerar relatório do diário.",
            "details": str(e)
        }), 500