# routes/turmas.py
from flask import Blueprint, jsonify, request
from utils import supabase 

turmas_bp = Blueprint('turmas_bp', __name__)

# --- GET (Listar todas) e POST (Criar) ---
@turmas_bp.route('/turmas', methods=['GET'])
def get_turmas():
    try:
        data, count = supabase.table('turmas').select('*').order('created_at', desc=True).execute()
        return jsonify(data[1]) 
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@turmas_bp.route('/turmas', methods=['POST'])
def create_turma():
    try:
        dados = request.get_json()
        if not dados or 'nome' not in dados:
            return jsonify({"error": "O campo 'nome' é obrigatório."}), 400

        data, count = supabase.table('turmas').insert({
            'nome': dados.get('nome'),
            'descricao': dados.get('descricao')
        }).execute()
        
        return jsonify(data[1][0]), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- GET (Detalhes de UMA turma) ---
@turmas_bp.route('/turmas/<uuid:turma_id>', methods=['GET'])
def get_turma_detalhe(turma_id):
    try:
        data, count = supabase.table('turmas').select('*').eq('id', turma_id).single().execute()
        return jsonify(data[1])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- ROTAS DE VÍNCULO (Não mudam) ---
@turmas_bp.route('/turmas/<uuid:turma_id>/alunos_vinculados', methods=['GET'])
def get_alunos_da_turma(turma_id):
    try:
        data, count = supabase.table('turmas_alunos') \
            .select('id, alunos(id, nome_completo, matricula)') \
            .eq('turma_id', turma_id) \
            .execute()
        return jsonify(data[1])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@turmas_bp.route('/turmas/vincular_aluno', methods=['POST'])
def vincular_aluno_turma():
    try:
        dados = request.get_json()
        data, count = supabase.table('turmas_alunos').insert({
            'turma_id': dados.get('turma_id'),
            'aluno_id': dados.get('aluno_id')
        }).execute()
        return jsonify(data[1][0]), 201
    except Exception as e:
        if 'violates unique constraint "turmas_alunos_turma_id_aluno_id_key"' in str(e):
            return jsonify({"error": "Este aluno já está nesta turma."}), 409
        return jsonify({"error": str(e)}), 500

@turmas_bp.route('/turmas/remover_aluno/<uuid:vinculo_id>', methods=['DELETE'])
def remover_aluno_turma(vinculo_id):
    try:
        data, count = supabase.table('turmas_alunos').delete().eq('id', vinculo_id).execute()
        if count and count[1] == 0:
             return jsonify({"error": "Vínculo não encontrado."}), 404
        return jsonify({"message": "Aluno removido da turma com sucesso."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- NOVAS ROTAS DE API (CRUD) ---

# --- PUT /turmas/<id> (Atualizar UMA turma) ---
@turmas_bp.route('/turmas/<uuid:turma_id>', methods=['PUT'])
def update_turma(turma_id):
    try:
        dados = request.get_json()
        if not dados or 'nome' not in dados:
            return jsonify({"error": "O campo 'nome' é obrigatório."}), 400

        data, count = supabase.table('turmas').update({
            'nome': dados.get('nome'),
            'descricao': dados.get('descricao')
        }).eq('id', turma_id).execute()
        
        if not data[1]:
             return jsonify({"error": "Turma não encontrada."}), 404

        return jsonify(data[1][0]), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- DELETE /turmas/<id> (Excluir UMA turma) ---
@turmas_bp.route('/turmas/<uuid:turma_id>', methods=['DELETE'])
def delete_turma(turma_id):
    try:
        # Excluir uma turma vai excluir os vínculos
        # e frequências dela (ON DELETE CASCADE).
        data, count = supabase.table('turmas').delete().eq('id', turma_id).execute()
        
        if count and count[1] == 0:
             return jsonify({"error": "Turma não encontrada."}), 404

        return jsonify({"message": "Turma excluída com sucesso."}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500