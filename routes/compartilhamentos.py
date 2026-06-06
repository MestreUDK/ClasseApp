# routes/compartilhamentos.py

from datetime import datetime
from zoneinfo import ZoneInfo

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from utils import supabase

from modules.compartilhamentos.helpers import (
    buscar_compartilhamento_por_codigo,
    filtrar_compartilhamentos_validos,
    gerar_codigo_compartilhamento,
    verificar_dono_turma
)

from modules.compartilhamentos.consultas import (
    buscar_alunos_compartilhados,
    buscar_diario_compartilhado,
    buscar_frequencia_resumo_compartilhada,
    buscar_notas_resumo_compartilhadas
)

from modules.compartilhamentos.copia import (
    buscar_copia_existente,
    copiar_compartilhamento_turma
)

compartilhamentos_bp = Blueprint("compartilhamentos_bp", __name__)


def tratar_expiracao(expira_em):
    if not expira_em:
        return None

    data_local = datetime.strptime(
        expira_em,
        "%Y-%m-%dT%H:%M"
    )

    data_local = data_local.replace(
        tzinfo=ZoneInfo("America/Belem")
    )

    return data_local.isoformat()


def adicionar_estatisticas_copias(compartilhamentos):
    if not compartilhamentos:
        return []

    ids = [item["id"] for item in compartilhamentos]

    res, _ = supabase.table("compartilhamento_copias") \
        .select("compartilhamento_id, created_at") \
        .in_("compartilhamento_id", ids) \
        .execute()

    copias = res[1] or []

    mapa = {}

    for copia in copias:
        comp_id = copia.get("compartilhamento_id")

        if comp_id not in mapa:
            mapa[comp_id] = {
                "total_copias": 0,
                "ultima_copia_em": None
            }

        mapa[comp_id]["total_copias"] += 1

        created_at = copia.get("created_at")

        if created_at:
            atual = mapa[comp_id]["ultima_copia_em"]

            if not atual or created_at > atual:
                mapa[comp_id]["ultima_copia_em"] = created_at

    for item in compartilhamentos:
        stats = mapa.get(item["id"], {
            "total_copias": 0,
            "ultima_copia_em": None
        })

        item["total_copias"] = stats["total_copias"]
        item["ultima_copia_em"] = stats["ultima_copia_em"]

    return compartilhamentos


@compartilhamentos_bp.route("/compartilhamentos/turma/<uuid:turma_id>", methods=["POST"])
@login_required
def criar_compartilhamento_turma(turma_id):
    try:
        if not verificar_dono_turma(turma_id, current_user.id):
            return jsonify({"error": "Acesso negado."}), 403

        dados = request.get_json() or {}

        codigo = gerar_codigo_compartilhamento()
        expira_em = tratar_expiracao(dados.get("expira_em") or None)

        compartilhamento = {
            "codigo": codigo,
            "dono_id": current_user.id,
            "tipo": "turma",
            "recurso_id": str(turma_id),
            "permissao": "visualizar",
            "permite_copia": bool(dados.get("permite_copia", False)),
            "compartilhar_alunos": bool(dados.get("compartilhar_alunos", True)),
            "compartilhar_frequencia": bool(dados.get("compartilhar_frequencia", False)),
            "compartilhar_notas": bool(dados.get("compartilhar_notas", False)),
            "compartilhar_diario": bool(dados.get("compartilhar_diario", False)),
            "expira_em": expira_em,
            "ativo": True
        }

        res, _ = supabase.table("compartilhamentos") \
            .insert(compartilhamento) \
            .execute()

        return jsonify({
            "message": "Compartilhamento criado.",
            "codigo": codigo,
            "dados": res[1][0]
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@compartilhamentos_bp.route("/compartilhamentos", methods=["GET"])
@login_required
def listar_compartilhamentos():
    try:
        res, _ = supabase.table("compartilhamentos") \
            .select("*") \
            .eq("dono_id", current_user.id) \
            .eq("ativo", True) \
            .order("created_at", desc=True) \
            .execute()

        compartilhamentos = res[1] or []

        compartilhamentos_validos = filtrar_compartilhamentos_validos(
            compartilhamentos
        )

        compartilhamentos_com_stats = adicionar_estatisticas_copias(
            compartilhamentos_validos
        )

        return jsonify(compartilhamentos_com_stats)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@compartilhamentos_bp.route("/compartilhamentos/<uuid:comp_id>", methods=["PUT"])
@login_required
def editar_compartilhamento(comp_id):
    try:
        dados = request.get_json() or {}

        expira_em = tratar_expiracao(dados.get("expira_em") or None)

        atualizacao = {
            "permite_copia": bool(dados.get("permite_copia", False)),
            "compartilhar_alunos": bool(dados.get("compartilhar_alunos", True)),
            "compartilhar_frequencia": bool(dados.get("compartilhar_frequencia", False)),
            "compartilhar_notas": bool(dados.get("compartilhar_notas", False)),
            "compartilhar_diario": bool(dados.get("compartilhar_diario", False)),
            "expira_em": expira_em
        }

        res, _ = supabase.table("compartilhamentos") \
            .update(atualizacao) \
            .eq("id", str(comp_id)) \
            .eq("dono_id", current_user.id) \
            .eq("ativo", True) \
            .execute()

        if not res[1]:
            return jsonify({"error": "Compartilhamento não encontrado ou acesso negado."}), 404

        return jsonify({
            "message": "Compartilhamento atualizado.",
            "dados": res[1][0]
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@compartilhamentos_bp.route("/compartilhamentos/<uuid:comp_id>/desativar", methods=["POST"])
@login_required
def desativar_compartilhamento(comp_id):
    try:
        res, _ = supabase.table("compartilhamentos") \
            .update({"ativo": False}) \
            .eq("id", str(comp_id)) \
            .eq("dono_id", current_user.id) \
            .execute()

        if not res[1]:
            return jsonify({"error": "Compartilhamento não encontrado."}), 404

        return jsonify({"message": "Compartilhamento desativado."})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@compartilhamentos_bp.route("/compartilhamentos/codigo/<codigo>", methods=["GET"])
@login_required
def visualizar_compartilhamento(codigo):
    try:
        compartilhamento = buscar_compartilhamento_por_codigo(codigo)

        if not compartilhamento:
            return jsonify({"error": "Código inválido, inativo ou expirado."}), 404

        if compartilhamento["tipo"] != "turma":
            return jsonify({"error": "Tipo de compartilhamento não suportado."}), 400

        turma_id = compartilhamento["recurso_id"]

        turma_res, _ = supabase.table("turmas") \
            .select("*") \
            .eq("id", turma_id) \
            .single() \
            .execute()

        turma = turma_res[1]

        if not turma:
            return jsonify({"error": "Turma não encontrada."}), 404

        resposta = {
            "compartilhamento": compartilhamento,
            "turma": turma
        }

        if compartilhamento.get("compartilhar_alunos"):
            resposta["alunos"] = buscar_alunos_compartilhados(turma_id)

        if compartilhamento.get("compartilhar_frequencia"):
            resposta["frequencia_resumo"] = buscar_frequencia_resumo_compartilhada(turma_id)

        if compartilhamento.get("compartilhar_notas"):
            resposta["notas_resumo"] = buscar_notas_resumo_compartilhadas(turma_id)

        if compartilhamento.get("compartilhar_diario"):
            resposta["diario"] = buscar_diario_compartilhado(turma_id)

        return jsonify(resposta)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@compartilhamentos_bp.route("/compartilhamentos/codigo/<codigo>/copiar", methods=["POST"])
@login_required
def copiar_compartilhamento_para_minha_conta(codigo):
    try:
        compartilhamento = buscar_compartilhamento_por_codigo(codigo)

        if not compartilhamento:
            return jsonify({"error": "Código inválido, inativo ou expirado."}), 404

        if not compartilhamento.get("permite_copia"):
            return jsonify({"error": "Este compartilhamento não permite cópia."}), 403

        if compartilhamento["tipo"] != "turma":
            return jsonify({"error": "Tipo de compartilhamento não suportado."}), 400

        copia_existente = buscar_copia_existente(
            compartilhamento["id"],
            current_user.id
        )

        if copia_existente:
            return jsonify({
                "message": "Você já copiou esta turma anteriormente.",
                "turma_id": copia_existente,
                "ja_existia": True
            }), 200

        nova_turma = copiar_compartilhamento_turma(
            compartilhamento,
            current_user.id
        )

        if not nova_turma:
            return jsonify({"error": "Turma original não encontrada."}), 404

        return jsonify({
            "message": "Turma copiada com sucesso.",
            "turma_id": nova_turma["id"]
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@compartilhamentos_bp.route("/compartilhamentos/<uuid:comp_id>/copias", methods=["GET"])
@login_required
def listar_copias_compartilhamento(comp_id):
    try:
        res, _ = supabase.table("compartilhamento_copias") \
            .select("*") \
            .eq("compartilhamento_id", str(comp_id)) \
            .eq("dono_id", current_user.id) \
            .order("created_at", desc=True) \
            .execute()

        return jsonify(res[1] or [])

    except Exception as e:
        return jsonify({"error": str(e)}), 500