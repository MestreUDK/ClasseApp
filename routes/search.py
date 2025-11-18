# routes/search.py
from flask import Blueprint, jsonify, request
from utils import supabase 

search_bp = Blueprint('search_bp', __name__)

@search_bp.route('/search', methods=['GET'])
def global_search():
    """
    Busca alunos (com suas turmas) e turmas.
    """
    try:
        query = request.args.get('q')

        if not query or len(query) < 2:
            return jsonify({"error": "A busca precisa ter ao menos 2 caracteres."}), 400

        # 1. Busca ALUNOS usando a nova função RPC
        # Ela já retorna a coluna "nomes_turmas"
        data_alunos, count_alunos = supabase.rpc(
            'search_alunos_com_turmas',
            {'p_query': query}
        ).execute()

        # 2. Busca TURMAS normalmente
        data_turmas, count_turmas = supabase.table('turmas') \
            .select('id, nome, descricao') \
            .or_(f'nome.ilike.%{query}%,descricao.ilike.%{query}%') \
            .limit(10) \
            .execute()

        return jsonify({
            "alunos": data_alunos[1],
            "turmas": data_turmas[1]
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500