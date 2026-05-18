# routes/estatisticas.py

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from utils import supabase

estatisticas_bp = Blueprint('estatisticas_bp', __name__)


def verificar_dono_turma(turma_id):
    res, _ = supabase.table('turmas') \
        .select('id') \
        .eq('id', str(turma_id)) \
        .eq('user_id', current_user.id) \
        .execute()

    return len(res[1]) > 0


@estatisticas_bp.route('/turma/<uuid:turma_id>/stats', methods=['GET'])
@login_required
def get_stats_da_turma(turma_id):
    try:
        if not verificar_dono_turma(turma_id):
            return jsonify({"error": "Acesso negado."}), 403

        data_inicio = request.args.get('inicio')
        data_fim = request.args.get('fim')

        alunos_res, _ = supabase.table('turmas_alunos') \
            .select('alunos(id, nome_completo, matricula)') \
            .eq('turma_id', str(turma_id)) \
            .execute()

        alunos = []

        for item in alunos_res[1]:
            aluno = item.get('alunos')
            if aluno:
                alunos.append(aluno)

        freq_query = supabase.table('frequencia') \
            .select('aluno_id, presente, data') \
            .eq('turma_id', str(turma_id))

        if data_inicio:
            freq_query = freq_query.gte('data', data_inicio)

        if data_fim:
            freq_query = freq_query.lte('data', data_fim)

        freq_res, _ = freq_query.execute()
        frequencias = freq_res[1] or []

        mapa_freq = {}

        for item in frequencias:
            aluno_id = item.get('aluno_id')

            if aluno_id not in mapa_freq:
                mapa_freq[aluno_id] = {
                    'presencas': 0,
                    'faltas': 0,
                    'total': 0
                }

            mapa_freq[aluno_id]['total'] += 1

            if item.get('presente') is True:
                mapa_freq[aluno_id]['presencas'] += 1
            else:
                mapa_freq[aluno_id]['faltas'] += 1

        resultado = []

        for aluno in alunos:
            aluno_id = aluno['id']
            dados = mapa_freq.get(aluno_id, {
                'presencas': 0,
                'faltas': 0,
                'total': 0
            })

            total = dados['total']
            presencas = dados['presencas']
            faltas = dados['faltas']

            porcentagem = 0
            if total > 0:
                porcentagem = round((presencas / total) * 100, 1)

            resultado.append({
                'aluno_id': aluno_id,
                'nome_completo': aluno.get('nome_completo'),
                'matricula': aluno.get('matricula'),
                'total_presencas': presencas,
                'total_faltas': faltas,
                'total_registros': total,
                'porcentagem_presenca': porcentagem
            })

        resultado.sort(key=lambda x: x['nome_completo'] or '')

        return jsonify(resultado)

    except Exception as e:
        return jsonify({"error": str(e)}), 500