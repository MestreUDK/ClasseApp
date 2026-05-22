# routes/compartilhamentos.py

import random
import string

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from utils import supabase

compartilhamentos_bp = Blueprint("compartilhamentos_bp", __name__)


def gerar_codigo_compartilhamento(tamanho=8):
    caracteres = string.ascii_uppercase + string.digits

    while True:
        codigo = "".join(random.choice(caracteres) for _ in range(tamanho))

        res, _ = supabase.table("compartilhamentos") \
            .select("id") \
            .eq("codigo", codigo) \
            .execute()

        if not res[1]:
            return codigo


def verificar_dono_turma(turma_id):
    res, _ = supabase.table("turmas") \
        .select("id") \
        .eq("id", str(turma_id)) \
        .eq("user_id", current_user.id) \
        .execute()

    return len(res[1]) > 0


def buscar_compartilhamento_por_codigo(codigo):
    res, _ = supabase.table("compartilhamentos") \
        .select("*") \
        .eq("codigo", codigo.upper()) \
        .eq("ativo", True) \
        .single() \
        .execute()

    return res[1]


@compartilhamentos_bp.route("/compartilhamentos/turma/<uuid:turma_id>", methods=["POST"])
@login_required
def criar_compartilhamento_turma(turma_id):
    try:
        if not verificar_dono_turma(turma_id):
            return jsonify({"error": "Acesso negado."}), 403

        dados = request.get_json() or {}
        codigo = gerar_codigo_compartilhamento()

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
            .order("created_at", desc=True) \
            .execute()

        return jsonify(res[1] or [])

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
            return jsonify({"error": "Código inválido."}), 404

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
            alunos_res, _ = supabase.table("turmas_alunos") \
                .select("alunos(*)") \
                .eq("turma_id", turma_id) \
                .execute()

            alunos = []

            for item in alunos_res[1] or []:
                aluno = item.get("alunos")

                if aluno:
                    alunos.append(aluno)

            resposta["alunos"] = alunos

        return jsonify(resposta)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@compartilhamentos_bp.route("/compartilhamentos/codigo/<codigo>/copiar", methods=["POST"])
@login_required
def copiar_compartilhamento_para_minha_conta(codigo):
    try:
        compartilhamento = buscar_compartilhamento_por_codigo(codigo)

        if not compartilhamento:
            return jsonify({"error": "Código inválido ou inativo."}), 404

        if not compartilhamento.get("permite_copia"):
            return jsonify({"error": "Este compartilhamento não permite cópia."}), 403

        if compartilhamento["tipo"] != "turma":
            return jsonify({"error": "Tipo de compartilhamento não suportado."}), 400

        turma_original_id = compartilhamento["recurso_id"]

        turma_res, _ = supabase.table("turmas") \
            .select("*") \
            .eq("id", turma_original_id) \
            .single() \
            .execute()

        turma_original = turma_res[1]

        if not turma_original:
            return jsonify({"error": "Turma original não encontrada."}), 404

        nova_turma_res, _ = supabase.table("turmas").insert({
            "nome": f"{turma_original.get('nome')} (cópia)",
            "descricao": turma_original.get("descricao"),
            "disciplina_id": None,
            "user_id": current_user.id
        }).execute()

        nova_turma = nova_turma_res[1][0]
        nova_turma_id = nova_turma["id"]

        mapa_alunos = {}

        if compartilhamento.get("compartilhar_alunos"):
            alunos_res, _ = supabase.table("turmas_alunos") \
                .select("alunos(*)") \
                .eq("turma_id", turma_original_id) \
                .execute()

            for item in alunos_res[1] or []:
                aluno = item.get("alunos")

                if not aluno:
                    continue

                novo_aluno_res, _ = supabase.table("alunos").insert({
                    "nome_completo": aluno.get("nome_completo"),
                    "matricula": None,
                    "telefone": aluno.get("telefone"),
                    "email": aluno.get("email"),
                    "data_nascimento": aluno.get("data_nascimento"),
                    "detalhes": aluno.get("detalhes"),
                    "user_id": current_user.id
                }).execute()

                novo_aluno = novo_aluno_res[1][0]
                mapa_alunos[aluno["id"]] = novo_aluno["id"]

                supabase.table("turmas_alunos").insert({
                    "turma_id": nova_turma_id,
                    "aluno_id": novo_aluno["id"]
                }).execute()

        if compartilhamento.get("compartilhar_frequencia") and mapa_alunos:
            freq_res, _ = supabase.table("frequencia") \
                .select("*") \
                .eq("turma_id", turma_original_id) \
                .execute()

            for freq in freq_res[1] or []:
                aluno_antigo_id = freq.get("aluno_id")
                novo_aluno_id = mapa_alunos.get(aluno_antigo_id)

                if not novo_aluno_id:
                    continue

                supabase.table("frequencia").upsert({
                    "turma_id": nova_turma_id,
                    "aluno_id": novo_aluno_id,
                    "data": freq.get("data"),
                    "presente": freq.get("presente")
                }, on_conflict="data, aluno_id, turma_id").execute()

        if compartilhamento.get("compartilhar_notas") and mapa_alunos:
            avaliacoes_res, _ = supabase.table("avaliacoes") \
                .select("*") \
                .eq("turma_id", turma_original_id) \
                .execute()

            mapa_avaliacoes = {}

            for av in avaliacoes_res[1] or []:
                nova_av_res, _ = supabase.table("avaliacoes").insert({
                    "nome": av.get("nome"),
                    "data": av.get("data"),
                    "nota_maxima": av.get("nota_maxima"),
                    "periodo_tipo": av.get("periodo_tipo"),
                    "periodo_numero": av.get("periodo_numero"),
                    "categoria": av.get("categoria"),
                    "peso": av.get("peso"),
                    "turma_id": nova_turma_id,
                    "user_id": current_user.id
                }).execute()

                nova_av = nova_av_res[1][0]
                mapa_avaliacoes[av["id"]] = nova_av["id"]

            if mapa_avaliacoes:
                notas_res, _ = supabase.table("notas") \
                    .select("*") \
                    .in_("avaliacao_id", list(mapa_avaliacoes.keys())) \
                    .execute()

                for nota in notas_res[1] or []:
                    novo_aluno_id = mapa_alunos.get(nota.get("aluno_id"))
                    nova_avaliacao_id = mapa_avaliacoes.get(nota.get("avaliacao_id"))

                    if not novo_aluno_id or not nova_avaliacao_id:
                        continue

                    supabase.table("notas").upsert({
                        "avaliacao_id": nova_avaliacao_id,
                        "aluno_id": novo_aluno_id,
                        "valor": nota.get("valor"),
                        "user_id": current_user.id
                    }, on_conflict="avaliacao_id, aluno_id").execute()

        if compartilhamento.get("compartilhar_diario"):
            diario_res, _ = supabase.table("diario") \
                .select("*") \
                .eq("turma_id", turma_original_id) \
                .execute()

            for nota in diario_res[1] or []:
                aluno_antigo_id = nota.get("aluno_id")
                novo_aluno_id = mapa_alunos.get(aluno_antigo_id) if aluno_antigo_id else None

                supabase.table("diario").insert({
                    "titulo": nota.get("titulo"),
                    "conteudo": nota.get("conteudo"),
                    "data_referencia": nota.get("data_referencia"),
                    "turma_id": nova_turma_id,
                    "aluno_id": novo_aluno_id,
                    "user_id": current_user.id
                }).execute()

        return jsonify({
            "message": "Turma copiada com sucesso.",
            "turma_id": nova_turma_id
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500