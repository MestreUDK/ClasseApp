# routes/frequencia.py

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user # <-- Importar
from utils import supabase 

frequencia_bp = Blueprint('frequencia_bp', __name__)

# Função auxiliar para verificar dono da turma
def verificar_dono_turma(turma_id):
    res, _ = supabase.table('turmas').select('id').eq('id', turma_id).eq('user_id', current_user.id).execute()
    return len(res[1]) > 0

@frequencia_bp.route('/frequencia', methods=['GET'])
@login_required
def get_frequencia():
    try:
        turma_id = request.args.get('turma_id')
        data = request.args.get('data')

        if not turma_id or not data: return jsonify({"error": "Faltam dados."}), 400

        # Verifica segurança
        if not verificar_dono_turma(turma_id): return jsonify({"error": "Acesso negado."}), 403

        data, count = supabase.table('frequencia') \
            .select('aluno_id, presente') \
            .eq('turma_id', turma_id) \
            .eq('data', data) \
            .execute()
        
        return jsonify(data[1])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@frequencia_bp.route('/frequencia', methods=['POST'])
@login_required
def set_frequencia():
    try:
        dados = request.get_json()
        turma_id = dados.get('turma_id')
        
        # Verifica segurança antes de salvar
        if not verificar_dono_turma(turma_id): return jsonify({"error": "Acesso negado."}), 403

        data, count = supabase.table('frequencia').upsert({
            'turma_id': turma_id,
            'aluno_id': dados.get('aluno_id'),
            'data': dados.get('data'),
            'presente': dados.get('presente')
        }, on_conflict='data, aluno_id, turma_id').execute()

        return jsonify(data[1][0]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@frequencia_bp.route('/turma/<uuid:turma_id>/datas_chamada', methods=['GET'])
@login_required
def get_datas_chamada(turma_id):
    try:
        # Verifica segurança
        if not verificar_dono_turma(turma_id): return jsonify({"error": "Acesso negado."}), 403

        data, count = supabase.rpc('get_datas_unicas', {'p_turma_id': str(turma_id)}).execute()
        return jsonify(data[1])
    except Exception as e:
        return jsonify({"error": str(e)}), 500