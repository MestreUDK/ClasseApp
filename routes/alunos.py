# routes/alunos.py

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user # <-- IMPORTAR
from utils import supabase

alunos_bp = Blueprint('alunos_bp', __name__)

# --- GET (Listar SEUS Alunos) ---
@alunos_bp.route('/alunos', methods=['GET'])
@login_required
def get_alunos():
    try:
        # Filtra pelo seu ID
        data, count = supabase.table('alunos')\
            .select('*')\
            .eq('user_id', current_user.id)\
            .order('nome_completo', desc=False)\
            .execute()
        return jsonify(data[1]) 
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- POST (Criar Aluno para VOCÊ) ---
@alunos_bp.route('/alunos', methods=['POST'])
@login_required
def create_aluno():
    try:
        dados = request.get_json()
        if not dados or 'nome_completo' not in dados:
            return jsonify({"error": "O campo 'nome_completo' é obrigatório."}), 400

        # Insere vinculando ao seu usuário
        data, count = supabase.table('alunos').insert({
            'nome_completo': dados.get('nome_completo'),
            'matricula': dados.get('matricula'),
            'telefone': dados.get('telefone'),
            'email': dados.get('email'),
            'user_id': current_user.id # <-- VÍNCULO DE PROPRIEDADE
        }).execute()
        
        return jsonify(data[1][0]), 201
        
    except Exception as e:
        # Esse erro de constraint pode acontecer se você tentar cadastrar
        # a mesma matrícula que OUTRO professor já usou (se a matrícula for única globalmente).
        # Idealmente, a constraint no banco deveria ser (matricula, user_id), mas vamos manter simples.
        if 'violates unique constraint' in str(e):
             return jsonify({"error": "Esta matrícula já está cadastrada."}), 409
        return jsonify({"error": str(e)}), 500

# --- GET (Buscar UM aluno SEU) ---
@alunos_bp.route('/alunos/<uuid:aluno_id>', methods=['GET'])
@login_required
def get_aluno_by_id(aluno_id):
    try:
        data, count = supabase.table('alunos')\
            .select('*')\
            .eq('id', aluno_id)\
            .eq('user_id', current_user.id)\
            .single().execute()
        
        if not data[1]:
             return jsonify({"error": "Aluno não encontrado ou acesso negado."}), 404

        return jsonify(data[1])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- PUT (Atualizar UM aluno SEU) ---
@alunos_bp.route('/alunos/<uuid:aluno_id>', methods=['PUT'])
@login_required
def update_aluno(aluno_id):
    try:
        dados = request.get_json()
        if not dados or 'nome_completo' not in dados:
            return jsonify({"error": "O campo 'nome_completo' é obrigatório."}), 400

        data, count = supabase.table('alunos').update({
            'nome_completo': dados.get('nome_completo'),
            'matricula': dados.get('matricula'),
            'telefone': dados.get('telefone'),
            'email': dados.get('email')
        }).eq('id', aluno_id).eq('user_id', current_user.id).execute()
        
        if not data[1]:
             return jsonify({"error": "Aluno não encontrado ou acesso negado."}), 404

        return jsonify(data[1][0]), 200
        
    except Exception as e:
        if 'violates unique constraint' in str(e):
             return jsonify({"error": "Esta matrícula já está cadastrada."}), 409
        return jsonify({"error": str(e)}), 500

# --- DELETE (Excluir UM aluno SEU) ---
@alunos_bp.route('/alunos/<uuid:aluno_id>', methods=['DELETE'])
@login_required
def delete_aluno(aluno_id):
    try:
        data, count = supabase.table('alunos')\
            .delete()\
            .eq('id', aluno_id)\
            .eq('user_id', current_user.id)\
            .execute()
        
        if count and count[1] == 0:
             return jsonify({"error": "Aluno não encontrado ou acesso negado."}), 404

        return jsonify({"message": "Aluno excluído com sucesso."}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500