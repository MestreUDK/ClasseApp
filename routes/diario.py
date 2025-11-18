# routes/diario.py

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user # <-- IMPORTAR
from utils import supabase 

diario_bp = Blueprint('diario_bp', __name__)

# --- GET: Listar SUAS Notas ---
@diario_bp.route('/diario', methods=['GET'])
@login_required
def get_notas():
    try:
        # Busca APENAS as suas notas
        data, count = supabase.table('diario') \
            .select('*, turmas(nome), alunos(nome_completo)') \
            .eq('user_id', current_user.id) \
            .order('created_at', desc=True) \
            .execute()
        
        return jsonify(data[1])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- POST: Criar Nota ---
@diario_bp.route('/diario', methods=['POST'])
@login_required
def create_nota():
    try:
        dados = request.get_json()
        if not dados or 'titulo' not in dados:
            return jsonify({"error": "O título é obrigatório."}), 400

        turma_id = dados.get('turma_id') or None
        aluno_id = dados.get('aluno_id') or None

        # Salva vinculando ao seu usuário
        data, count = supabase.table('diario').insert({
            'titulo': dados.get('titulo'),
            'conteudo': dados.get('conteudo'),
            'turma_id': turma_id,
            'aluno_id': aluno_id,
            'user_id': current_user.id # <-- VÍNCULO DE PROPRIEDADE
        }).execute()
        
        return jsonify(data[1][0]), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- DELETE: Excluir Nota SUA ---
@diario_bp.route('/diario/<uuid:nota_id>', methods=['DELETE'])
@login_required
def delete_nota(nota_id):
    try:
        # Só deleta se for sua
        data, count = supabase.table('diario')\
            .delete()\
            .eq('id', nota_id)\
            .eq('user_id', current_user.id)\
            .execute()
            
        if count and count[1] == 0:
             return jsonify({"error": "Nota não encontrada ou acesso negado."}), 404
             
        return jsonify({"message": "Nota excluída."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500