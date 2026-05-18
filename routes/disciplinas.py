# routes/disciplinas.py

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from utils import supabase

disciplinas_bp = Blueprint("disciplinas_bp", __name__)


@disciplinas_bp.route("/disciplinas", methods=["GET"])
@login_required
def get_disciplinas():
    try:
        res, _ = supabase.table("disciplinas") \
            .select("*") \
            .eq("user_id", current_user.id) \
            .order("nome", desc=False) \
            .execute()

        return jsonify(res[1])

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@disciplinas_bp.route("/disciplinas", methods=["POST"])
@login_required
def create_disciplina():
    try:
        dados = request.get_json()

        if not dados or not dados.get("nome"):
            return jsonify({"error": "O nome da disciplina é obrigatório."}), 400

        res, _ = supabase.table("disciplinas").insert({
            "nome": dados.get("nome"),
            "descricao": dados.get("descricao"),
            "cor": dados.get("cor") or "#007bff",
            "user_id": current_user.id
        }).execute()

        return jsonify(res[1][0]), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@disciplinas_bp.route("/disciplinas/<uuid:disciplina_id>", methods=["PUT"])
@login_required
def update_disciplina(disciplina_id):
    try:
        dados = request.get_json()

        if not dados or not dados.get("nome"):
            return jsonify({"error": "O nome da disciplina é obrigatório."}), 400

        res, _ = supabase.table("disciplinas").update({
            "nome": dados.get("nome"),
            "descricao": dados.get("descricao"),
            "cor": dados.get("cor") or "#007bff"
        }).eq("id", str(disciplina_id)) \
         .eq("user_id", current_user.id) \
         .execute()

        if not res[1]:
            return jsonify({"error": "Disciplina não encontrada ou acesso negado."}), 404

        return jsonify(res[1][0])

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@disciplinas_bp.route("/disciplinas/<uuid:disciplina_id>", methods=["DELETE"])
@login_required
def delete_disciplina(disciplina_id):
    try:
        res, _ = supabase.table("disciplinas") \
            .delete() \
            .eq("id", str(disciplina_id)) \
            .eq("user_id", current_user.id) \
            .execute()

        if not res[1]:
            return jsonify({"error": "Disciplina não encontrada ou acesso negado."}), 404

        return jsonify({"message": "Disciplina excluída com sucesso."})

    except Exception as e:
        return jsonify({"error": str(e)}), 500