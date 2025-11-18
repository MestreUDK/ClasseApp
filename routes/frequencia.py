# routes/frequencia.py

from flask import Blueprint, jsonify, request
from utils import supabase 

frequencia_bp = Blueprint('frequencia_bp', __name__)

@frequencia_bp.route('/frequencia', methods=['GET'])
def get_frequencia():
    try:
        turma_id = request.args.get('turma_id')
        data = request.args.get('data')

        if not turma_id or not data:
            return jsonify({"error": "turma_id e data são obrigatórios"}), 400

        data, count = supabase.table('frequencia') \
            .select('aluno_id, presente') \
            .eq('turma_id', turma_id) \
            .eq('data', data) \
            .execute()
        
        return jsonify(data[1])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@frequencia_bp.route('/frequencia', methods=['POST'])
def set_frequencia():
    try:
        dados = request.get_json()
        data, count = supabase.table('frequencia').upsert(
            {
                'turma_id': dados.get('turma_id'),
                'aluno_id': dados.get('aluno_id'),
                'data': dados.get('data'),
                'presente': dados.get('presente')
            },
            on_conflict='data, aluno_id, turma_id' 
        ).execute()

        return jsonify(data[1][0]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- NOVA ROTA: Buscar Datas com Chamada ---
@frequencia_bp.route('/turma/<uuid:turma_id>/datas_chamada', methods=['GET'])
def get_datas_chamada(turma_id):
    """ Retorna as datas únicas que possuem registros de frequência para esta turma. """
    try:
        # Usamos .select('data') e o próprio python/supabase para filtrar duplicatas seria pesado.
        # Melhor usar SQL RPC se fosse big data, mas para uso simples, o Supabase não tem 'DISTINCT' direto no cliente simples.
        # Truque: Buscar dados ordenados e filtrar no Python é viável para turmas pequenas.
        
        # Maneira mais eficiente no Supabase sem criar RPC: Criar uma view ou usar RPC.
        # Vamos simplificar criando uma RPC rápida para garantir performance.
        
        # (Veja o passo extra de SQL abaixo para criar 'get_datas_unicas')
        data, count = supabase.rpc(
            'get_datas_unicas', 
            {'p_turma_id': str(turma_id)}
        ).execute()
        
        return jsonify(data[1])

    except Exception as e:
        return jsonify({"error": str(e)}), 500