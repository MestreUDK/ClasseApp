# routes/alunos.py

from flask import Blueprint, jsonify, request
from utils import supabase

alunos_bp = Blueprint('alunos_bp', __name__)

# --- GET (Listar Todos) ---
@alunos_bp.route('/alunos', methods=['GET'])
def get_alunos():
    try:
        # select('*') já vai trazer telefone e email automaticamente
        data, count = supabase.table('alunos').select('*').order('nome_completo', desc=False).execute()
        return jsonify(data[1]) 
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- POST (Criar) ---
@alunos_bp.route('/alunos', methods=['POST'])
def create_aluno():
    try:
        dados = request.get_json()
        if not dados or 'nome_completo' not in dados:
            return jsonify({"error": "O campo 'nome_completo' é obrigatório."}), 400

        # INSERE COM OS NOVOS CAMPOS
        data, count = supabase.table('alunos').insert({
            'nome_completo': dados.get('nome_completo'),
            'matricula': dados.get('matricula'),
            'telefone': dados.get('telefone'), # Novo
            'email': dados.get('email')        # Novo
        }).execute()
        
        return jsonify(data[1][0]), 201
        
    except Exception as e:
        if 'violates unique constraint "alunos_matricula_key"' in str(e):
             return jsonify({"error": "Esta matrícula já está cadastrada."}), 409
        return jsonify({"error": str(e)}), 500

# --- GET /alunos/<id> (Buscar UM aluno) ---
@alunos_bp.route('/alunos/<uuid:aluno_id>', methods=['GET'])
def get_aluno_by_id(aluno_id):
    try:
        data, count = supabase.table('alunos').select('*').eq('id', aluno_id).single().execute()
        
        if not data[1]:
             return jsonify({"error": "Aluno não encontrado."}), 404

        return jsonify(data[1])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- PUT /alunos/<id> (Atualizar UM aluno) ---
@alunos_bp.route('/alunos/<uuid:aluno_id>', methods=['PUT'])
def update_aluno(aluno_id):
    try:
        dados = request.get_json()
        if not dados or 'nome_completo' not in dados:
            return jsonify({"error": "O campo 'nome_completo' é obrigatório."}), 400

        # ATUALIZA COM OS NOVOS CAMPOS
        data, count = supabase.table('alunos').update({
            'nome_completo': dados.get('nome_completo'),
            'matricula': dados.get('matricula'),
            'telefone': dados.get('telefone'), # Novo
            'email': dados.get('email')        # Novo
        }).eq('id', aluno_id).execute()
        
        if not data[1]:
             return jsonify({"error": "Aluno não encontrado."}), 404

        return jsonify(data[1][0]), 200
        
    except Exception as e:
        if 'violates unique constraint "alunos_matricula_key"' in str(e):
             return jsonify({"error": "Esta matrícula já está cadastrada."}), 409
        return jsonify({"error": str(e)}), 500

# --- DELETE (Excluir) ---
@alunos_bp.route('/alunos/<uuid:aluno_id>', methods=['DELETE'])
def delete_aluno(aluno_id):
    try:
        data, count = supabase.table('alunos').delete().eq('id', aluno_id).execute()
        
        if count and count[1] == 0:
             return jsonify({"error": "Aluno não encontrado."}), 404

        return jsonify({"message": "Aluno excluído com sucesso."}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
