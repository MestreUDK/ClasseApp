# routes/diario.py

from flask import Blueprint, jsonify, request
from utils import supabase 

diario_bp = Blueprint('diario_bp', __name__)

# --- GET: Listar Notas ---
@diario_bp.route('/diario', methods=['GET'])
def get_notas():
    try:
        # Busca as notas e faz o JOIN para pegar nomes de turma e aluno
        data, count = supabase.table('diario') \
            .select('*, turmas(nome), alunos(nome_completo)') \
            .order('created_at', desc=True) \
            .execute()
        
        return jsonify(data[1])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- POST: Criar Nota ---
@diario_bp.route('/diario', methods=['POST'])
def create_nota():
    try:
        dados = request.get_json()
        if not dados or 'titulo' not in dados:
            return jsonify({"error": "O título é obrigatório."}), 400

        # Trata strings vazias como None (NULL no banco) para os vínculos
        turma_id = dados.get('turma_id') or None
        aluno_id = dados.get('aluno_id') or None

        data, count = supabase.table('diario').insert({
            'titulo': dados.get('titulo'),
            'conteudo': dados.get('conteudo'),
            'turma_id': turma_id,
            'aluno_id': aluno_id
        }).execute()
        
        return jsonify(data[1][0]), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- DELETE: Excluir Nota ---
@diario_bp.route('/diario/<uuid:nota_id>', methods=['DELETE'])
def delete_nota(nota_id):
    try:
        data, count = supabase.table('diario').delete().eq('id', nota_id).execute()
        return jsonify({"message": "Nota excluída."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500