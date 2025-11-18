# routes/dashboard.py

from flask import Blueprint, jsonify
from flask_login import login_required, current_user # <-- Importar
from utils import supabase 

dashboard_bp = Blueprint('dashboard_bp', __name__)

@dashboard_bp.route('/dashboard/stats', methods=['GET'])
@login_required # <-- Bloqueia
def get_dashboard_stats():
    try:
        # Passa o ID do usuário logado para a função SQL
        data, count = supabase.rpc(
            'get_dashboard_stats', 
            {'p_user_id': current_user.id}
        ).execute()
        
        stats = data[1] if data[1] else {'total_alunos': 0, 'total_turmas': 0, 'media_presenca': 0}
        
        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500