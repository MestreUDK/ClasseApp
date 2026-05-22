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


def calcular_frequencia(turma_id, data_inicio=None, data_fim=None):
    alunos_res, _ = supabase.table('turmas_alunos') \
        .select('alunos(id, nome_completo, matricula)') \
        .eq('turma_id', str(turma_id)) \
        .execute()

    alunos = []

    for item in alunos_res[1] or []:
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

    return resultado, alunos


def nome_periodo(periodo_tipo, periodo_numero):
    mapa = {
        'avaliacao': 'Avaliação',
        'bimestre': 'Bimestre',
        'trimestre': 'Trimestre',
        'semestre': 'Semestre'
    }

    nome = mapa.get(periodo_tipo, 'Avaliação')
    return f"{periodo_numero}ª {nome}"


def calcular_notas_modulares(turma_id, alunos):
    av_res, _ = supabase.table('avaliacoes') \
        .select('id, nome, data, nota_maxima, periodo_tipo, periodo_numero, categoria, peso') \
        .eq('turma_id', str(turma_id)) \
        .eq('user_id', current_user.id) \
        .order('periodo_numero', desc=False) \
        .order('created_at', desc=False) \
        .execute()

    avaliacoes = av_res[1] or []

    if not avaliacoes:
        return {
            'periodos': [],
            'total_avaliacoes': 0
        }

    av_ids = [av['id'] for av in avaliacoes]

    notas_res, _ = supabase.table('notas') \
        .select('aluno_id, avaliacao_id, valor') \
        .in_('avaliacao_id', av_ids) \
        .eq('user_id', current_user.id) \
        .execute()

    notas = notas_res[1] or []

    notas_por_aluno_av = {}

    for nota in notas:
        aluno_id = nota.get('aluno_id')
        avaliacao_id = nota.get('avaliacao_id')

        if aluno_id not in notas_por_aluno_av:
            notas_por_aluno_av[aluno_id] = {}

        notas_por_aluno_av[aluno_id][avaliacao_id] = nota.get('valor')

    grupos = {}

    for av in avaliacoes:
        periodo_tipo = av.get('periodo_tipo') or 'avaliacao'
        periodo_numero = av.get('periodo_numero') or 1
        chave = f"{periodo_tipo}_{periodo_numero}"

        if chave not in grupos:
            grupos[chave] = {
                'chave': chave,
                'periodo_tipo': periodo_tipo,
                'periodo_numero': periodo_numero,
                'nome_periodo': nome_periodo(periodo_tipo, periodo_numero),
                'avaliacoes': [],
                'alunos': [],
                'media_turma': None
            }

        grupos[chave]['avaliacoes'].append(av)

    for chave, grupo in grupos.items():
        medias_turma = []

        for aluno in alunos:
            aluno_id = aluno['id']

            soma_pesos = 0
            soma_ponderada = 0
            total_lancadas = 0

            for av in grupo['avaliacoes']:
                avaliacao_id = av['id']
                nota_valor = notas_por_aluno_av.get(aluno_id, {}).get(avaliacao_id)

                if nota_valor is None:
                    continue

                nota_maxima = float(av.get('nota_maxima') or 10)
                peso = float(av.get('peso') or 1)

                if nota_maxima <= 0:
                    continue

                nota_normalizada = (float(nota_valor) / nota_maxima) * 10

                soma_ponderada += nota_normalizada * peso
                soma_pesos += peso
                total_lancadas += 1

            media_periodo = None

            if soma_pesos > 0:
                media_periodo = round(soma_ponderada / soma_pesos, 2)
                medias_turma.append(media_periodo)

            grupo['alunos'].append({
                'aluno_id': aluno_id,
                'nome_completo': aluno.get('nome_completo'),
                'matricula': aluno.get('matricula'),
                'media_periodo': media_periodo,
                'total_lancadas': total_lancadas,
                'total_avaliacoes': len(grupo['avaliacoes'])
            })

        if medias_turma:
            grupo['media_turma'] = round(sum(medias_turma) / len(medias_turma), 2)

    periodos = list(grupos.values())
    periodos.sort(key=lambda p: (p['periodo_tipo'], p['periodo_numero']))

    return {
        'periodos': periodos,
        'total_avaliacoes': len(avaliacoes)
    }


@estatisticas_bp.route('/turma/<uuid:turma_id>/stats', methods=['GET'])
@login_required
def get_stats_da_turma(turma_id):
    try:
        if not verificar_dono_turma(turma_id):
            return jsonify({"error": "Acesso negado."}), 403

        data_inicio = request.args.get('inicio')
        data_fim = request.args.get('fim')

        frequencia, alunos = calcular_frequencia(
            turma_id,
            data_inicio=data_inicio,
            data_fim=data_fim
        )

        notas = calcular_notas_modulares(turma_id, alunos)

        return jsonify({
            'frequencia': frequencia,
            'notas': notas
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500