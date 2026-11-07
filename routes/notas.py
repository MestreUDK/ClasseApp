# routes/notas.py

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from utils import supabase
from modules.revisoes import salvar_versionado
from modules.rendimento import calcular_rendimento

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


def validar_recuperacao(turma_id, tipo, numero, categoria, ignorar_id=None):
    """Evita múltiplas recuperações no mesmo par de avaliações."""
    if categoria != 'recuperacao':
        return None
    if tipo != 'avaliacao' or numero not in (1, 2):
        return 'A recuperação deve ser 1ª ou 2ª, no tipo de período Avaliação.'
    query = (supabase.table('avaliacoes').select('id')
             .eq('turma_id', str(turma_id))
             .eq('user_id', current_user.id)
             .eq('periodo_tipo', 'avaliacao')
             .eq('periodo_numero', numero)
             .eq('categoria', 'recuperacao'))
    if ignorar_id:
        query = query.neq('id', str(ignorar_id))
    if query.limit(1).execute().data:
        return f'A {numero}ª recuperação já está cadastrada nesta turma.'
    return None


@notas_bp.route('/turma/<uuid:turma_id>/avaliacoes', methods=['GET'])
@login_required
def get_avaliacoes(turma_id):
    try:
        if not verificar_dono_turma(turma_id):
            return jsonify({"error": "Acesso negado."}), 403

        av_res, _ = supabase.table('avaliacoes') \
            .select('id, nome, data, nota_maxima, periodo_tipo, periodo_numero, categoria, peso, turma_id, revision') \
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

        nome = str(dados.get('nome') or '').strip()
        if not nome or len(nome) > 200:
            return jsonify({'error': 'Informe um nome com até 200 caracteres.'}), 400
        try:
            periodo_numero = int(dados.get('periodo_numero', 1))
            nota_maxima = float(dados.get('nota_maxima', 10))
            peso = (1 if dados.get('categoria') == 'recuperacao'
                    else float(dados.get('peso', 1)))
            if not (1 <= periodo_numero <= 12 and 0 < nota_maxima <= 100):
                raise ValueError()
            if not (0 < peso <= 100):
                raise ValueError()
        except (TypeError, ValueError):
            return jsonify({'error': 'Período, nota máxima ou peso inválido.'}), 400
        tipo = dados.get('periodo_tipo') or 'avaliacao'
        categoria = dados.get('categoria') or 'atividade'
        if tipo not in ('avaliacao', 'bimestre', 'trimestre', 'semestre'):
            return jsonify({'error': 'Tipo de período inválido.'}), 400
        if categoria not in ('atividade', 'trabalho', 'prova', 'participacao', 'recuperacao', 'outro'):
            return jsonify({'error': 'Categoria inválida.'}), 400
        erro = validar_recuperacao(turma_id, tipo, periodo_numero, categoria)
        if erro:
            return jsonify({'error': erro}), 400
        # O banco pode exigir peso não nulo: 1 é neutro e IGNORADO nas médias.
        if categoria == 'recuperacao':
            peso = 1
        data, _ = supabase.table('avaliacoes').insert({
            'nome': nome,
            'data': dados.get('data') or None,
            'nota_maxima': nota_maxima,
            'periodo_tipo': tipo,
            'periodo_numero': periodo_numero,
            'categoria': categoria,
            'peso': peso,
            'turma_id': turma_id,
            'user_id': current_user.id
        }).execute()

        return jsonify(data[1][0]), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@notas_bp.route('/avaliacoes/<uuid:avaliacao_id>', methods=['PUT'])
@login_required
def editar_avaliacao(avaliacao_id):
    """Edita metadados de uma avaliação sem modificar notas já lançadas."""
    try:
        dados = request.get_json(silent=True) or {}
        atuais = (supabase.table('avaliacoes')
                  .select('id, turma_id, revision')
                  .eq('id', str(avaliacao_id))
                  .eq('user_id', current_user.id)
                  .limit(1).execute().data or [])
        if not atuais or not verificar_dono_turma(atuais[0]['turma_id']):
            return jsonify({'error': 'Avaliação não encontrada.'}), 404
        revisao = dados.get('revision')
        if not isinstance(revisao, int) or isinstance(revisao, bool):
            return jsonify({'error': 'Revisão obrigatória. Atualize a página.'}), 428
        nome = str(dados.get('nome') or '').strip()
        if not nome or len(nome) > 200:
            return jsonify({'error': 'Informe um nome com até 200 caracteres.'}), 400
        try:
            nota_maxima = float(dados.get('nota_maxima'))
            peso = (1 if dados.get('categoria') == 'recuperacao'
                    else float(dados.get('peso')))
            periodo_numero = int(dados.get('periodo_numero'))
            if not (0 < nota_maxima <= 100 and 0 < peso <= 100 and 1 <= periodo_numero <= 12):
                raise ValueError()
        except (TypeError, ValueError):
            return jsonify({'error': 'Nota máxima, peso ou período inválido.'}), 400
        tipo = dados.get('periodo_tipo')
        categoria = dados.get('categoria')
        if tipo not in ('avaliacao', 'bimestre', 'trimestre', 'semestre'):
            return jsonify({'error': 'Tipo de período inválido.'}), 400
        if categoria not in ('atividade', 'trabalho', 'prova', 'participacao', 'recuperacao', 'outro'):
            return jsonify({'error': 'Categoria inválida.'}), 400
        erro = validar_recuperacao(atuais[0]['turma_id'], tipo, periodo_numero,
                                  categoria, ignorar_id=avaliacao_id)
        if erro:
            return jsonify({'error': erro}), 400
        if categoria == 'recuperacao':
            peso = 1
        valores = {
            'nome': nome, 'data': dados.get('data') or None,
            'nota_maxima': nota_maxima, 'peso': peso,
            'periodo_tipo': tipo, 'periodo_numero': periodo_numero,
            'categoria': categoria,
        }
        alterados = (supabase.table('avaliacoes').update(valores)
                     .eq('id', str(avaliacao_id))
                     .eq('user_id', current_user.id)
                     .eq('revision', revisao).execute().data or [])
        if not alterados:
            return jsonify({'error': 'Conflito: avaliação alterada em outra sessão.'}), 409
        return jsonify(alterados[0]), 200
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


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
            .select('aluno_id, valor, revision, updated_at') \
            .eq('avaliacao_id', str(avaliacao_id)) \
            .eq('user_id', current_user.id) \
            .execute()

        notas_map = {
            nota['aluno_id']: nota
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
                    'nota': (notas_map.get(aluno['id']) or {}).get('valor'),
                    'revision': (notas_map.get(aluno['id']) or {}).get('revision', 0),
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


@notas_bp.route('/turma/<uuid:turma_id>/rendimento', methods=['GET'])
@login_required
def consultar_rendimento(turma_id):
    """Prévia sem alterar notas, para conferência de recuperação e média."""
    try:
        if not verificar_dono_turma(turma_id):
            return jsonify({'error': 'Acesso negado.'}), 403
        avs = (supabase.table('avaliacoes')
               .select('id, categoria, periodo_tipo, periodo_numero, nota_maxima, peso')
               .eq('turma_id', str(turma_id))
               .eq('user_id', current_user.id)
               .execute().data or [])
        vinculos = (supabase.table('turmas_alunos')
                    .select('alunos(id, nome_completo, matricula)')
                    .eq('turma_id', str(turma_id)).execute().data or [])
        notas = {}
        if avs:
            registros = (supabase.table('notas')
                         .select('aluno_id, avaliacao_id, valor')
                         .in_('avaliacao_id', [av['id'] for av in avs])
                         .eq('user_id', current_user.id)
                         .execute().data or [])
            for registro in registros:
                notas.setdefault(registro['aluno_id'], {})[
                    registro['avaliacao_id']] = registro.get('valor')
        alunos = []
        for vinculo in vinculos:
            aluno = vinculo.get('alunos')
            if not aluno:
                continue
            alunos.append({
                'aluno_id': aluno['id'],
                'nome': aluno.get('nome_completo'),
                'matricula': aluno.get('matricula'),
                'rendimento': calcular_rendimento(aluno['id'], avs, notas),
            })
        alunos.sort(key=lambda item: (item['nome'] or '').casefold())
        return jsonify({'alunos': alunos, 'pesos': [2, 3, 2, 3]})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@notas_bp.route('/notas', methods=['POST'])
@login_required
def set_nota():
    try:
        dados = request.get_json()
        avaliacao_id = dados.get('avaliacao_id')

        if not verificar_dono_avaliacao(avaliacao_id):
            return jsonify({"error": "Acesso negado."}), 403

        valor = dados.get('valor')

        aluno_id = dados.get('aluno_id')
        av = (supabase.table('avaliacoes').select('turma_id, nota_maxima')
              .eq('id', avaliacao_id).eq('user_id', current_user.id)
              .limit(1).execute().data or [])
        if not av or not aluno_id:
            return jsonify({"error": "Avaliação ou aluno inválido."}), 400
        vinculo = (supabase.table('turmas_alunos').select('aluno_id')
                   .eq('turma_id', av[0]['turma_id']).eq('aluno_id', aluno_id)
                   .limit(1).execute().data or [])
        if not vinculo:
            return jsonify({"error": "Aluno não pertence à turma."}), 403
        try:
            numero = None if valor is None else float(valor)
            if numero is not None and not (0 <= numero <= float(av[0]['nota_maxima'])):
                raise ValueError()
        except (ValueError, TypeError):
            return jsonify({"error": "Nota fora dos limites."}), 400
        resultado, status = salvar_versionado('notas',
            {'avaliacao_id': avaliacao_id, 'aluno_id': aluno_id},
            {'valor': numero, 'user_id': current_user.id}, dados.get('revision'))
        return jsonify(resultado), status
    except Exception as e:
        return jsonify({"error": str(e)}), 500