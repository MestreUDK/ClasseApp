# routes/notas.py

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from utils import supabase

notas_bp = Blueprint('notas_bp', __name__)


def verificar_dono_turma(turma_id):
    res, _ = supabase.table('turmas') \
        .select('id') \
        .eq('id', str(turma_id)) \
        .eq('user_id', current_user.id) \
        .execute()

    return len(res[1]) > 0


def verificar_dono_avaliacao(avaliacao_id):
    res, _ = supabase.table('avaliacoes') \
        .select('id') \
        .eq('id', str(avaliacao_id)) \
        .eq('user_id', current_user.id) \
        .execute()

    return len(res[1]) > 0


@notas_bp.route('/turma/<uuid:turma_id>/avaliacoes', methods=['GET'])
@login_required
def get_avaliacoes(turma_id):
    try:
        if not verificar_dono_turma(turma_id):
            return jsonify({"error": "Acesso negado."}), 403

        av_res, _ = supabase.table('avaliacoes') \
            .select('id, nome, data, nota_maxima, periodo_tipo, periodo_numero, categoria, peso, turma_id') \
            .eq('turma_id', str(turma_id)) \
            .eq('user_id', current_user.id) \
            .order('periodo_numero', desc=False) \
            .order('created_at', desc=False) \
            .execute()

        avaliacoes = av_res[1] or []

        if not avaliacoes:
            return jsonify([])

        av_ids = [av['id'] for av in avaliacoes]

        notas_res, _ = supabase.table('notas') \
            .select('avaliacao_id, valor') \
            .in_('avaliacao_id', av_ids) \
            .eq('user_id', current_user.id) \
            .execute()

        notas_por_avaliacao = {}

        for nota in notas_res[1] or []:
            avaliacao_id = nota.get('avaliacao_id')
            valor = nota.get('valor')

            if avaliacao_id not in notas_por_avaliacao:
                notas_por_avaliacao[avaliacao_id] = []

            if valor is not None:
                notas_por_avaliacao[avaliacao_id].append(float(valor))

        for av in avaliacoes:
            notas = notas_por_avaliacao.get(av['id'], [])

            av['media_turma'] = round(sum(notas) / len(notas), 2) if notas else None
            av['total_notas_lancadas'] = len(notas)

        return jsonify(avaliacoes)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@notas_bp.route('/avaliacoes', methods=['POST'])
@login_required
def create_avaliacao():
    try:
        dados = request.get_json()
        turma_id = dados.get('turma_id')

        if not turma_id:
            return jsonify({"error": "A turma é obrigatória."}), 400

        if not verificar_dono_turma(turma_id):
            return jsonify({"error": "Acesso negado."}), 403

        if not dados.get('nome'):
            return jsonify({"error": "O nome da avaliação é obrigatório."}), 400

        data, _ = supabase.table('avaliacoes').insert({
            'nome': dados.get('nome'),
            'data': dados.get('data') or None,
            'nota_maxima': dados.get('nota_maxima') or 10,
            'periodo_tipo': dados.get('periodo_tipo') or 'avaliacao',
            'periodo_numero': dados.get('periodo_numero') or 1,
            'categoria': dados.get('categoria') or 'atividade',
            'peso': dados.get('peso') or 1,
            'turma_id': turma_id,
            'user_id': current_user.id
        }).execute()

        return jsonify(data[1][0]), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@notas_bp.route('/avaliacoes/<uuid:avaliacao_id>', methods=['DELETE'])
@login_required
def delete_avaliacao(avaliacao_id):
    try:
        data, _ = supabase.table('avaliacoes') \
            .delete() \
            .eq('id', str(avaliacao_id)) \
            .eq('user_id', current_user.id) \
            .execute()

        if not data[1]:
            return jsonify({"error": "Avaliação não encontrada."}), 404

        return jsonify({"message": "Avaliação excluída."}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@notas_bp.route('/avaliacao/<uuid:avaliacao_id>/diario', methods=['GET'])
@login_required
def get_notas_avaliacao(avaliacao_id):
    try:
        av_res, _ = supabase.table('avaliacoes') \
            .select('id, nome, turma_id, data, nota_maxima, periodo_tipo, periodo_numero, categoria, peso') \
            .eq('id', str(avaliacao_id)) \
            .eq('user_id', current_user.id) \
            .single() \
            .execute()

        if not av_res[1]:
            return jsonify({"error": "Avaliação não encontrada."}), 404

        avaliacao = av_res[1]
        turma_id = avaliacao['turma_id']

        if not verificar_dono_turma(turma_id):
            return jsonify({"error": "Acesso negado."}), 403

        alunos_res, _ = supabase.table('turmas_alunos') \
            .select('alunos(id, nome_completo, matricula)') \
            .eq('turma_id', turma_id) \
            .execute()

        notas_res, _ = supabase.table('notas') \
            .select('aluno_id, valor') \
            .eq('avaliacao_id', str(avaliacao_id)) \
            .eq('user_id', current_user.id) \
            .execute()

        notas_map = {
            nota['aluno_id']: nota['valor']
            for nota in notas_res[1] or []
        }

        alunos = []

        for item in alunos_res[1] or []:
            aluno = item.get('alunos')

            if aluno:
                alunos.append({
                    'id': aluno['id'],
                    'nome': aluno['nome_completo'],
                    'matricula': aluno.get('matricula'),
                    'nota': notas_map.get(aluno['id']),
                    'nota_maxima': avaliacao['nota_maxima']
                })

        alunos.sort(key=lambda x: x['nome'])

        return jsonify({
            "avaliacao": avaliacao,
            "turma_id": turma_id,
            "alunos": alunos
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@notas_bp.route('/notas', methods=['POST'])
@login_required
def set_nota():
    try:
        dados = request.get_json()
        avaliacao_id = dados.get('avaliacao_id')

        if not verificar_dono_avaliacao(avaliacao_id):
            return jsonify({"error": "Acesso negado."}), 403

        valor = dados.get('valor')

        data, _ = supabase.table('notas').upsert({
            'avaliacao_id': avaliacao_id,
            'aluno_id': dados.get('aluno_id'),
            'valor': valor,
            'user_id': current_user.id
        }, on_conflict='avaliacao_id, aluno_id').execute()

        return jsonify(data[1][0]), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500