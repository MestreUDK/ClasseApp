# routes/dashboard.py

from flask import Blueprint, jsonify
from utils import supabase 

dashboard_bp = Blueprint('dashboard_bp', __name__)

@dashboard_bp.route('/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    try:
        # Chama a função RPC que criamos
        data, count = supabase.rpc('get_dashboard_stats').execute()
        
        # O Supabase retorna uma lista, pegamos o primeiro item (o objeto JSON)
        stats = data[1] if data[1] else {'total_alunos': 0, 'total_turmas': 0, 'media_presenca': 0}
        
        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500