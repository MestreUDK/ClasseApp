# routes/estatisticas.py

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from utils import supabase
from modules.rendimento import calcular_rendimento, media_atividades

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
    """Mostra médias por período com recuperações aplicadas sem peso extra."""
    avaliacoes = (supabase.table('avaliacoes')
                  .select('id, nome, data, nota_maxima, periodo_tipo, '
                          'periodo_numero, categoria, peso')
                  .eq('turma_id', str(turma_id))
                  .eq('user_id', current_user.id)
                  .order('periodo_numero', desc=False)
                  .order('created_at', desc=False)
                  .execute().data or [])
    if not avaliacoes:
        return {'periodos': [], 'total_avaliacoes': 0}

    registros = (supabase.table('notas')
                 .select('aluno_id, avaliacao_id, valor')
                 .in_('avaliacao_id', [av['id'] for av in avaliacoes])
                 .eq('user_id', current_user.id)
                 .execute().data or [])
    notas = {}
    for registro in registros:
        notas.setdefault(registro['aluno_id'], {})[
            registro['avaliacao_id']] = registro.get('valor')

    grupos = {}
    for av in avaliacoes:
        # A recuperação pertence à dupla de avaliações, não a um período
        # comum. Sua nota aparece na prévia do rendimento.
        if av.get('categoria') == 'recuperacao':
            continue
        tipo = av.get('periodo_tipo') or 'avaliacao'
        numero = av.get('periodo_numero') or 1
        chave = f'{tipo}_{numero}'
        if chave not in grupos:
            grupos[chave] = {
                'chave': chave, 'periodo_tipo': tipo,
                'periodo_numero': numero,
                'nome_periodo': nome_periodo(tipo, numero),
                'avaliacoes': [], 'alunos': [], 'media_turma': None,
            }
        grupos[chave]['avaliacoes'].append(av)

    rendimento_por_aluno = {
        aluno['id']: calcular_rendimento(aluno['id'], avaliacoes, notas)
        for aluno in alunos
    }
    for grupo in grupos.values():
        medias_turma = []
        tipo, numero = grupo['periodo_tipo'], grupo['periodo_numero']
        for aluno in alunos:
            aluno_id = aluno['id']
            media, lancadas, total = media_atividades(
                grupo['avaliacoes'], notas.get(aluno_id, {}))
            original = float(media) if media is not None else None
            efetiva = original
            recuperada = False
            if tipo == 'avaliacao' and numero in (1, 2, 3, 4):
                detalhe = rendimento_por_aluno[aluno_id]['periodos'][numero]
                efetiva = detalhe['efetiva']
                recuperada = detalhe['recuperada']
            if efetiva is not None:
                medias_turma.append(efetiva)
            grupo['alunos'].append({
                'aluno_id': aluno_id,
                'nome_completo': aluno.get('nome_completo'),
                'matricula': aluno.get('matricula'),
                'media_periodo': round(efetiva, 2) if efetiva is not None else None,
                'nota_original': round(original, 2) if original is not None else None,
                'recuperada': recuperada,
                'total_lancadas': lancadas,
                'total_avaliacoes': total,
            })
        if medias_turma:
            grupo['media_turma'] = round(sum(medias_turma) / len(medias_turma), 2)

    periodos = sorted(grupos.values(),
                      key=lambda item: (item['periodo_tipo'], item['periodo_numero']))
    return {
        'periodos': periodos,
        'total_avaliacoes': len(avaliacoes),
        'recuperacoes_cadastradas': sum(
            av.get('categoria') == 'recuperacao' for av in avaliacoes),
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