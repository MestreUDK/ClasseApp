# routes/notas.py

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from utils import supabase 

notas_bp = Blueprint('notas_bp', __name__)

# --- HELPER: Segurança ---
def verificar_dono_turma(turma_id):
    res, _ = supabase.table('turmas').select('id').eq('id', turma_id).eq('user_id', current_user.id).execute()
    return len(res[1]) > 0

def verificar_dono_avaliacao(avaliacao_id):
    # Busca a avaliação e verifica se o user_id bate
    res, _ = supabase.table('avaliacoes').select('id').eq('id', avaliacao_id).eq('user_id', current_user.id).execute()
    return len(res[1]) > 0

# --- 1. GESTÃO DE AVALIAÇÕES (PROVAS) ---

@notas_bp.route('/turma/<uuid:turma_id>/avaliacoes', methods=['GET'])
@login_required
def get_avaliacoes(turma_id):
    try:
        if not verificar_dono_turma(turma_id): return jsonify({"error": "Acesso negado."}), 403

        # Usa a função RPC que criamos para já trazer a média da turma
        data, count = supabase.rpc('get_avaliacoes_turma', {'p_turma_id': str(turma_id)}).execute()
        return jsonify(data[1])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@notas_bp.route('/avaliacoes', methods=['POST'])
@login_required
def create_avaliacao():
    try:
        dados = request.get_json()
        turma_id = dados.get('turma_id')

        if not verificar_dono_turma(turma_id): return jsonify({"error": "Acesso negado."}), 403

        data, count = supabase.table('avaliacoes').insert({
            'nome': dados.get('nome'),
            'data': dados.get('data'),
            'nota_maxima': dados.get('nota_maxima', 10.0),
            'turma_id': turma_id,
            'user_id': current_user.id # Dono
        }).execute()
        
        return jsonify(data[1][0]), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@notas_bp.route('/avaliacoes/<uuid:avaliacao_id>', methods=['DELETE'])
@login_required
def delete_avaliacao(avaliacao_id):
    try:
        # Deleta apenas se for do usuário logado
        data, count = supabase.table('avaliacoes').delete().eq('id', avaliacao_id).eq('user_id', current_user.id).execute()
        
        if count and count[1] == 0:
             return jsonify({"error": "Avaliação não encontrada."}), 404

        return jsonify({"message": "Avaliação excluída."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- 2. LANÇAMENTO DE NOTAS ---

@notas_bp.route('/avaliacao/<uuid:avaliacao_id>/diario', methods=['GET'])
@login_required
def get_notas_avaliacao(avaliacao_id):
    """ 
    Retorna a lista de todos os alunos da turma + a nota que eles tiraram nessa prova.
    Faz o 'join' manual aqui no Python para garantir que todos os alunos apareçam.
    """
    try:
        # 1. Busca dados da avaliação para saber a turma
        av_res, _ = supabase.table('avaliacoes').select('turma_id, nota_maxima').eq('id', avaliacao_id).eq('user_id', current_user.id).single().execute()
        if not av_res[1]: return jsonify({"error": "Avaliação não encontrada"}), 404
        
        avaliacao = av_res[1]
        turma_id = avaliacao['turma_id']

        # 2. Busca todos os alunos da turma
        alunos_res, _ = supabase.table('turmas_alunos')\
            .select('alunos(id, nome_completo, matricula)')\
            .eq('turma_id', turma_id)\
            .execute()
        
        # 3. Busca as notas já lançadas para esta avaliação
        notas_res, _ = supabase.table('notas').select('aluno_id, valor').eq('avaliacao_id', avaliacao_id).execute()
        
        # Cria um mapa {aluno_id: nota} para acesso rápido
        notas_map = {n['aluno_id']: n['valor'] for n in notas_res[1]}

        # 4. Monta a lista final
        lista_final = []
        for item in alunos_res[1]:
            aluno = item['alunos']
            lista_final.append({
                'id': aluno['id'],
                'nome': aluno['nome_completo'],
                'matricula': aluno['matricula'],
                'nota': notas_map.get(aluno['id']), # Retorna a nota ou None (se não tiver)
                'nota_maxima': avaliacao['nota_maxima']
            })
            
        # Ordena por nome
        lista_final.sort(key=lambda x: x['nome'])

        return jsonify(lista_final)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@notas_bp.route('/notas', methods=['POST'])
@login_required
def set_nota():
    try:
        dados = request.get_json()
        avaliacao_id = dados.get('avaliacao_id')
        
        if not verificar_dono_avaliacao(avaliacao_id): return jsonify({"error": "Acesso negado."}), 403

        # Upsert (Insere ou Atualiza a nota)
        data, count = supabase.table('notas').upsert({
            'avaliacao_id': avaliacao_id,
            'aluno_id': dados.get('aluno_id'),
            'valor': dados.get('valor'), # Pode ser float
            'user_id': current_user.id
        }, on_conflict='avaliacao_id, aluno_id').execute()

        return jsonify(data[1][0]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
