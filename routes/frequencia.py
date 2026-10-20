# routes/frequencia.py

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user # <-- Importar
from utils import supabase
from modules.revisoes import salvar_versionado 

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
            .select('aluno_id, presente, revision, updated_at') \
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

        aluno_id = dados.get('aluno_id')
        if not aluno_id or not dados.get('data') or not isinstance(dados.get('presente'), bool):
            return jsonify({"error": "Dados de frequência inválidos."}), 400
        vinculo = (supabase.table('turmas_alunos').select('aluno_id')
                   .eq('turma_id', turma_id).eq('aluno_id', aluno_id)
                   .limit(1).execute().data or [])
        if not vinculo:
            return jsonify({"error": "Aluno não pertence à turma."}), 403
        resultado, status = salvar_versionado('frequencia',
            {'turma_id': turma_id, 'aluno_id': aluno_id, 'data': dados['data']},
            {'presente': dados['presente']}, dados.get('revision'))
        return jsonify(resultado), status
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

# ==========================================
# --- NOVO: APAGAR FREQUÊNCIA DO DIA ---
# ==========================================
@frequencia_bp.route('/frequencia/dia', methods=['DELETE'])
@login_required
def delete_frequencia_dia():
    try:
        dados = request.get_json()
        turma_id = dados.get('turma_id')
        data = dados.get('data')
        
        if not verificar_dono_turma(turma_id): 
            return jsonify({"error": "Acesso negado."}), 403

        # Apaga todos os registros daquela turma naquela data
        res, count = supabase.table('frequencia') \
            .delete() \
            .eq('turma_id', turma_id) \
            .eq('data', data) \
            .execute()

        return jsonify({"message": "Frequência apagada com sucesso."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500