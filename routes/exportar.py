# routes/exportar.py

import io
import openpyxl

from flask import Blueprint, request, send_file, jsonify
from flask_login import login_required, current_user
from openpyxl.styles import Font, Alignment, PatternFill
from utils import supabase
from modules.rendimento import calcular_rendimento, media_atividades

exportar_bp = Blueprint('exportar_bp', __name__)


# ==============================
# HELPERS
# ==============================

def estilizar_cabecalho_excel(ws, cor="007BFF"):
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color=cor, end_color=cor, fill_type="solid")
        cell.alignment = Alignment(horizontal="center", vertical="center")


def ajustar_texto_planilha(ws):
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)


def gerar_resposta_excel(wb, nome_arquivo):
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
    res, _ = supabase.table("turmas") \
        .select("id") \
        .eq("id", str(turma_id)) \
        .eq("user_id", current_user.id) \
        .execute()

    return len(res[1]) > 0


def buscar_nome_turma(turma_id):
    res, _ = supabase.table("turmas") \
        .select("nome") \
        .eq("id", str(turma_id)) \
        .eq("user_id", current_user.id) \
        .single() \
        .execute()

    return res[1]["nome"] if res[1] else "Turma"


def buscar_alunos_da_turma(turma_id):
    res, _ = supabase.table("turmas_alunos") \
        .select("alunos(id, nome_completo, matricula)") \
        .eq("turma_id", str(turma_id)) \
        .execute()

    alunos = []

    for item in res[1] or []:
        aluno = item.get("alunos")
        if aluno:
            alunos.append(aluno)

    alunos.sort(key=lambda a: a.get("nome_completo") or "")
    return alunos


def nome_periodo(periodo_tipo, periodo_numero):
    mapa = {
        "avaliacao": "Avaliação",
        "bimestre": "Bimestre",
        "trimestre": "Trimestre",
        "semestre": "Semestre"
    }

    return f"{periodo_numero}ª {mapa.get(periodo_tipo, 'Avaliação')}"


# ==============================
# FREQUÊNCIA DO DIA
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
            ws.append([row["nome_completo"], status])

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
# FREQUÊNCIA GERAL COM FILTRO
# ==============================

@exportar_bp.route("/exportar/turma/<uuid:turma_id>/geral", methods=["GET"])
@login_required
def exportar_frequencia_geral_excel(turma_id):
    try:
        if not verificar_dono_turma(turma_id):
            return jsonify({"error": "Acesso negado."}), 403

        turma_nome = buscar_nome_turma(turma_id)
        data_inicio = request.args.get("inicio")
        data_fim = request.args.get("fim")

        alunos = buscar_alunos_da_turma(turma_id)

        freq_query = supabase.table("frequencia") \
            .select("aluno_id, presente, data") \
            .eq("turma_id", str(turma_id))

        if data_inicio:
            freq_query = freq_query.gte("data", data_inicio)

        if data_fim:
            freq_query = freq_query.lte("data", data_fim)

        freq_res, _ = freq_query.order("data", desc=False).execute()
        frequencias = freq_res[1] or []

        datas_ordenadas = sorted(list({f["data"] for f in frequencias}))

        mapa_freq = {}

        for item in frequencias:
            aluno_id = item.get("aluno_id")

            if aluno_id not in mapa_freq:
                mapa_freq[aluno_id] = {}

            mapa_freq[aluno_id][item["data"]] = item.get("presente")

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Frequência Geral"

        ws.append(["Aluno"] + datas_ordenadas + ["Presenças", "Faltas", "Total", "% Presença"])

        for aluno in alunos:
            aluno_id = aluno["id"]
            nome = aluno.get("nome_completo") or ""

            row = [nome]
            total_presencas = 0
            total_faltas = 0

            for data in datas_ordenadas:
                status = mapa_freq.get(aluno_id, {}).get(data)

                if status is True:
                    row.append("P")
                    total_presencas += 1
                elif status is False:
                    row.append("F")
                    total_faltas += 1
                else:
                    row.append("-")

            total = total_presencas + total_faltas
            porcentagem = round((total_presencas / total) * 100, 1) if total > 0 else 0

            row.extend([
                total_presencas,
                total_faltas,
                total,
                f"{porcentagem}%"
            ])

            ws.append(row)

        estilizar_cabecalho_excel(ws, "007BFF")

        ws.column_dimensions["A"].width = 35

        for col in range(2, len(datas_ordenadas) + 6):
            ws.column_dimensions[openpyxl.utils.get_column_letter(col)].width = 14

        ajustar_texto_planilha(ws)

        nome_arquivo = f"Frequencia_Geral_{turma_nome}.xlsx"

        if data_inicio and data_fim:
            nome_arquivo = f"Frequencia_{turma_nome}_{data_inicio}_a_{data_fim}.xlsx"

        return gerar_resposta_excel(wb, nome_arquivo)

    except Exception as e:
        return jsonify({
            "error": "Erro ao gerar relatório geral.",
            "details": str(e)
        }), 500


# ==============================
# NOTAS MODULARES E RECUPERAÇÃO
# ==============================


def buscar_dados_notas_modulares(turma_id):
    """Carrega avaliações/notas sem tratar recuperação como peso autônomo."""
    alunos = buscar_alunos_da_turma(turma_id)
    avaliacoes = (supabase.table('avaliacoes')
                  .select('id, nome, data, nota_maxima, periodo_tipo, '
                          'periodo_numero, categoria, peso')
                  .eq('turma_id', str(turma_id))
                  .eq('user_id', current_user.id)
                  .order('periodo_numero', desc=False)
                  .order('created_at', desc=False)
                  .execute().data or [])

    notas_map = {}
    if avaliacoes:
        registros = (supabase.table('notas')
                     .select('aluno_id, avaliacao_id, valor')
                     .in_('avaliacao_id', [av['id'] for av in avaliacoes])
                     .eq('user_id', current_user.id)
                     .execute().data or [])
        for registro in registros:
            notas_map.setdefault(registro['aluno_id'], {})[
                registro['avaliacao_id']] = registro.get('valor')

    grupos = {}
    for av in avaliacoes:
        if av.get('categoria') == 'recuperacao':
            continue
        tipo = av.get('periodo_tipo') or 'avaliacao'
        numero = av.get('periodo_numero') or 1
        chave = f'{tipo}_{numero}'
        if chave not in grupos:
            grupos[chave] = {
                'periodo_tipo': tipo, 'periodo_numero': numero,
                'nome_periodo': nome_periodo(tipo, numero),
                'avaliacoes': [],
            }
        grupos[chave]['avaliacoes'].append(av)
    periodos = sorted(grupos.values(),
                      key=lambda grupo: (grupo['periodo_tipo'],
                                         grupo['periodo_numero']))
    return alunos, periodos, notas_map, avaliacoes


def calcular_media_ponderada(aluno_id, avaliacoes, notas_map,
                             todas_avaliacoes=None):
    """Retorna nota efetiva (com REC) e quantidade de lançamentos regulares."""
    original, lancadas, _ = media_atividades(
        avaliacoes, notas_map.get(aluno_id, {}))
    media = float(original) if original is not None else None
    if todas_avaliacoes and avaliacoes:
        primeiro = avaliacoes[0]
        numero = primeiro.get('periodo_numero')
        if (primeiro.get('periodo_tipo') == 'avaliacao'
                and numero in (1, 2, 3, 4)):
            media = calcular_rendimento(
                aluno_id, todas_avaliacoes, notas_map)['periodos'][numero]['efetiva']
    return round(media, 2) if media is not None else None, lancadas


def _celula_segura(texto):
    """Não interpreta nomes digitados como fórmulas em uma planilha Excel."""
    valor = str(texto or '')
    if valor.lstrip().startswith(('=', '+', '-', '@')):
        return "'" + valor
    return valor


@exportar_bp.route('/exportar/turma/<uuid:turma_id>/notas', methods=['GET'])
@login_required
def exportar_notas_excel(turma_id):
    """Resumo ponderado e abas modulares, sem somar REC como avaliação extra."""
    try:
        if not verificar_dono_turma(turma_id):
            return jsonify({'error': 'Acesso negado.'}), 403

        turma_nome = buscar_nome_turma(turma_id)
        alunos, periodos, notas_map, avaliacoes = buscar_dados_notas_modulares(turma_id)
        wb = openpyxl.Workbook()
        resumo = wb.active
        resumo.title = 'Resumo de Notas'
        resumo.append([
            'Aluno', '1ª AV. (×2)', '2ª AV. (×3)', '3ª AV. (×2)',
            '4ª AV. (×3)', '1ª REC', '2ª REC', 'Total ponderado',
            'Média anual', 'Média parcial',
        ])
        for aluno in alunos:
            rendimento = calcular_rendimento(aluno['id'], avaliacoes, notas_map)
            periodos_aluno = rendimento['periodos']
            recs = rendimento['recuperacoes']
            resumo.append([
                _celula_segura(aluno.get('nome_completo')),
                *(periodos_aluno[n]['efetiva'] for n in (1, 2, 3, 4)),
                recs[1]['nota'], recs[2]['nota'],
                rendimento['total_pontos'], rendimento['media_anual'],
                rendimento['media_parcial'],
            ])
        resumo.freeze_panes = 'B2'
        resumo.auto_filter.ref = resumo.dimensions
        estilizar_cabecalho_excel(resumo, '6610f2')
        resumo.column_dimensions['A'].width = 35
        for coluna in range(2, 11):
            resumo.column_dimensions[openpyxl.utils.get_column_letter(coluna)].width = 19
        for linha in resumo.iter_rows(min_row=2, min_col=2, max_col=10):
            for celula in linha:
                if isinstance(celula.value, (int, float)):
                    celula.number_format = '0.00'
        ajustar_texto_planilha(resumo)

        for periodo in periodos:
            ws = wb.create_sheet(title=periodo['nome_periodo'][:31])
            grupo = periodo['avaliacoes']
            cabecalho = ['Aluno'] + [
                f"{av['nome']} / {av.get('nota_maxima') or 10}"
                for av in grupo
            ] + ['Notas lançadas', 'Média efetiva']
            ws.append([_celula_segura(item) for item in cabecalho])
            for aluno in alunos:
                aluno_id = aluno['id']
                linha = [_celula_segura(aluno.get('nome_completo'))]
                linha.extend(notas_map.get(aluno_id, {}).get(av['id']) for av in grupo)
                media, lancadas = calcular_media_ponderada(
                    aluno_id, grupo, notas_map, avaliacoes)
                linha.extend([f'{lancadas}/{len(grupo)}', media])
                ws.append(linha)
            ws.append([])
            ws.append(['Detalhes das avaliações'])
            ws.append(['Nome', 'Categoria', 'Data', 'Nota máxima', 'Peso'])
            for av in grupo:
                ws.append([
                    _celula_segura(av.get('nome')),
                    av.get('categoria') or '', av.get('data') or '',
                    av.get('nota_maxima'), av.get('peso'),
                ])
            ws.freeze_panes = 'B2'
            estilizar_cabecalho_excel(ws, '6610f2')
            ws.column_dimensions['A'].width = 36
            for col in range(2, len(cabecalho) + 1):
                ws.column_dimensions[openpyxl.utils.get_column_letter(col)].width = 21
            ajustar_texto_planilha(ws)

        recuperacoes = [av for av in avaliacoes
                        if av.get('categoria') == 'recuperacao']
        if recuperacoes:
            ws = wb.create_sheet('Recuperações')
            ws.append(['Aluno', 'REC 1', 'Alvo REC 1', 'REC 1 aplicada',
                       'REC 2', 'Alvo REC 2', 'REC 2 aplicada'])
            for aluno in alunos:
                result = calcular_rendimento(aluno['id'], avaliacoes, notas_map)
                rec1, rec2 = result['recuperacoes'][1], result['recuperacoes'][2]
                ws.append([
                    _celula_segura(aluno.get('nome_completo')),
                    rec1['nota'], rec1['alvo'], 'Sim' if rec1['aplicada'] else 'Não',
                    rec2['nota'], rec2['alvo'], 'Sim' if rec2['aplicada'] else 'Não',
                ])
            estilizar_cabecalho_excel(ws, '6610f2')
            ws.column_dimensions['A'].width = 36
            for col in 'BCDEFG':
                ws.column_dimensions[col].width = 20
            ajustar_texto_planilha(ws)

        return gerar_resposta_excel(wb, f'Notas_Modulares_{turma_nome}.xlsx')
    except Exception as exc:
        return jsonify({
            'error': 'Erro ao gerar boletim de notas.',
            'details': str(exc),
        }), 500


# ==============================
# DIÁRIO DE BORDO
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