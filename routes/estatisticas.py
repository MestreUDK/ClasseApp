# routes/estatistica.py

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user # <-- Importar
from utils import supabase 

estatisticas_bp = Blueprint('estatisticas_bp', __name__)

@estatisticas_bp.route('/turma/<uuid:turma_id>/stats', methods=['GET'])
@login_required # <-- Bloqueia
def get_stats_da_turma(turma_id):
    try:
        # 1. Verifica se a turma é do usuário logado
        check, _ = supabase.table('turmas').select('id').eq('id', turma_id).eq('user_id', current_user.id).execute()
        if not check[1]:
            return jsonify({"error": "Acesso negado."}), 403

        # 2. Executa a RPC
        data, count = supabase.rpc(
            'get_turma_stats',
            { 'p_turma_id': str(turma_id) }
        ).execute()
        
        return jsonify(data[1])
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500