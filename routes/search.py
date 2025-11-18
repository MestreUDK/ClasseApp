# routes/search.py

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user # <-- Importar
from utils import supabase 

search_bp = Blueprint('search_bp', __name__)

@search_bp.route('/search', methods=['GET'])
@login_required # <-- Bloqueia
def global_search():
    try:
        query = request.args.get('q')
        if not query or len(query) < 2:
            return jsonify({"error": "Busca inválida."}), 400

        # 1. Busca ALUNOS (Passando o ID do usuário)
        data_alunos, count_alunos = supabase.rpc(
            'search_alunos_com_turmas',
            {
                'p_query': query, 
                'p_user_id': current_user.id # <-- Filtro de Segurança
            }
        ).execute()

        # 2. Busca TURMAS (Filtrando pelo ID)
        data_turmas, count_turmas = supabase.table('turmas') \
            .select('id, nome, descricao') \
            .eq('user_id', current_user.id) \
            .or_(f'nome.ilike.%{query}%,descricao.ilike.%{query}%') \
            .limit(10) \
            .execute()

        return jsonify({
            "alunos": data_alunos[1],
            "turmas": data_turmas[1]
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500