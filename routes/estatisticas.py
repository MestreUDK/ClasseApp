# routes/estatistica.py
from flask import Blueprint, jsonify, request
from utils import supabase 

estatisticas_bp = Blueprint('estatisticas_bp', __name__)

@estatisticas_bp.route('/turma/<uuid:turma_id>/stats', methods=['GET'])
def get_stats_da_turma(turma_id):
    """
    Chama a função RPC 'get_turma_stats' que criamos no Supabase.
    """
    try:
        # Em vez de 'table()', usamos 'rpc()'
        data, count = supabase.rpc(
            'get_turma_stats', # Nome da função no SQL
            { 'p_turma_id': str(turma_id) } # Argumentos que a função espera
        ).execute()
        
        return jsonify(data[1])
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
