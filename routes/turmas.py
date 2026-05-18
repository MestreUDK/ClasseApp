# routes/turmas.py

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from utils import supabase

turmas_bp = Blueprint('turmas_bp', __name__)


def verificar_dono_turma(turma_id):
    res, _ = supabase.table('turmas') \
        .select('id') \
        .eq('id', str(turma_id)) \
        .eq('user_id', current_user.id) \
        .execute()

    return len(res[1]) > 0


def verificar_dono_aluno(aluno_id):
    res, _ = supabase.table('alunos') \
        .select('id') \
        .eq('id', str(aluno_id)) \
        .eq('user_id', current_user.id) \
        .execute()

    return len(res[1]) > 0


def verificar_dono_disciplina(disciplina_id):
    if not disciplina_id:
        return True

    res, _ = supabase.table('disciplinas') \
        .select('id') \
        .eq('id', str(disciplina_id)) \
        .eq('user_id', current_user.id) \
        .execute()

    return len(res[1]) > 0


@turmas_bp.route('/turmas', methods=['GET'])
@login_required
def get_turmas():
    try:
        data, _ = supabase.table('turmas') \
            .select('*, disciplinas(id, nome, cor)') \
            .eq('user_id', current_user.id) \
            .order('created_at', desc=True) \
            .execute()

        return jsonify(data[1])

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@turmas_bp.route('/turmas', methods=['POST'])
@login_required
def create_turma():
    try:
        dados = request.get_json()

        if not dados or not dados.get('nome'):
            return jsonify({"error": "O campo 'nome' é obrigatório."}), 400

        disciplina_id = dados.get('disciplina_id') or None

        if not verificar_dono_disciplina(disciplina_id):
            return jsonify({"error": "Disciplina inválida ou acesso negado."}), 403

        data, _ = supabase.table('turmas').insert({
            'nome': dados.get('nome'),
            'descricao': dados.get('descricao'),
            'disciplina_id': disciplina_id,
            'user_id': current_user.id
        }).execute()

        return jsonify(data[1][0]), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@turmas_bp.route('/turmas/<uuid:turma_id>', methods=['GET'])
@login_required
def get_turma_detalhe(turma_id):
    try:
        data, _ = supabase.table('turmas') \
            .select('*, disciplinas(id, nome, cor)') \
            .eq('id', str(turma_id)) \
            .eq('user_id', current_user.id) \
            .single() \
            .execute()

        if not data[1]:
            return jsonify({"error": "Turma não encontrada ou acesso negado."}), 404

        return jsonify(data[1])

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@turmas_bp.route('/turmas/<uuid:turma_id>', methods=['PUT'])
@login_required
def update_turma(turma_id):
    try:
        dados = request.get_json()

        if not dados or not dados.get('nome'):
            return jsonify({"error": "O campo 'nome' é obrigatório."}), 400

        disciplina_id = dados.get('disciplina_id') or None

        if not verificar_dono_disciplina(disciplina_id):
            return jsonify({"error": "Disciplina inválida ou acesso negado."}), 403

        data, _ = supabase.table('turmas').update({
            'nome': dados.get('nome'),
            'descricao': dados.get('descricao'),
            'disciplina_id': disciplina_id
        }).eq('id', str(turma_id)) \
          .eq('user_id', current_user.id) \
          .execute()

        if not data[1]:
            return jsonify({"error": "Turma não encontrada ou acesso negado."}), 404

        return jsonify(data[1][0]), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@turmas_bp.route('/turmas/<uuid:turma_id>', methods=['DELETE'])
@login_required
def delete_turma(turma_id):
    try:
        data, _ = supabase.table('turmas') \
            .delete() \
            .eq('id', str(turma_id)) \
            .eq('user_id', current_user.id) \
            .execute()

        if not data[1]:
            return jsonify({"error": "Turma não encontrada ou acesso negado."}), 404

        return jsonify({"message": "Turma excluída com sucesso."}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@turmas_bp.route('/turmas/<uuid:turma_id>/alunos_vinculados', methods=['GET'])
@login_required
def get_alunos_da_turma(turma_id):
    try:
        if not verificar_dono_turma(turma_id):
            return jsonify({"error": "Acesso negado."}), 403

        data, _ = supabase.table('turmas_alunos') \
            .select('id, alunos(id, nome_completo, matricula)') \
            .eq('turma_id', str(turma_id)) \
            .execute()

        return jsonify(data[1])

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@turmas_bp.route('/turmas/vincular_aluno', methods=['POST'])
@login_required
def vincular_aluno_turma():
    try:
        dados = request.get_json()

        turma_id = dados.get('turma_id')
        aluno_id = dados.get('aluno_id')

        if not turma_id or not aluno_id:
            return jsonify({"error": "Turma e aluno são obrigatórios."}), 400

        if not verificar_dono_turma(turma_id):
            return jsonify({"error": "Acesso negado à turma."}), 403

        if not verificar_dono_aluno(aluno_id):
            return jsonify({"error": "Acesso negado ao aluno."}), 403

        data, _ = supabase.table('turmas_alunos').insert({
            'turma_id': turma_id,
            'aluno_id': aluno_id
        }).execute()

        return jsonify(data[1][0]), 201

    except Exception as e:
        if 'violates unique constraint' in str(e):
            return jsonify({"error": "Este aluno já está nesta turma."}), 409

        return jsonify({"error": str(e)}), 500


@turmas_bp.route('/turmas/remover_aluno/<uuid:vinculo_id>', methods=['DELETE'])
@login_required
def remover_aluno_turma(vinculo_id):
    try:
        vinculo_res, _ = supabase.table('turmas_alunos') \
            .select('id, turma_id') \
            .eq('id', str(vinculo_id)) \
            .single() \
            .execute()

        if not vinculo_res[1]:
            return jsonify({"error": "Vínculo não encontrado."}), 404

        if not verificar_dono_turma(vinculo_res[1]['turma_id']):
            return jsonify({"error": "Acesso negado."}), 403

        data, _ = supabase.table('turmas_alunos') \
            .delete() \
            .eq('id', str(vinculo_id)) \
            .execute()

        if not data[1]:
            return jsonify({"error": "Vínculo não encontrado."}), 404

        return jsonify({"message": "Aluno removido."}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500