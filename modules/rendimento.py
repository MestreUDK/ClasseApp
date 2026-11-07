"""Regras de recuperação e média anual do Mapa Final de Rendimento.

Não altera as notas gravadas: a recuperação produz *notas efetivas* apenas
nos cálculos. A identificação das avaliações é pelo tipo/número do período,
não pelo nome digitado pelo professor.
"""

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

PESOS_ANUAIS = {1: 2, 2: 3, 3: 2, 4: 3}
NOTA_VERMELHA = Decimal('5')


def _numero(valor, padrao=None):
    """Converte números/strings do Supabase com segurança."""
    try:
        if valor is None or isinstance(valor, bool):
            return padrao
        numero = Decimal(str(valor))
        return numero if numero.is_finite() else padrao
    except (TypeError, InvalidOperation, ValueError):
        return padrao


def _decimal_para_nota(valor):
    if valor is None:
        return None
    return float(valor.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def nota_normalizada(nota, avaliacao):
    """Normaliza qualquer nota máxima para a escala 0–10."""
    valor = _numero(nota)
    maxima = _numero(avaliacao.get('nota_maxima'), Decimal(10))
    if valor is None or maxima is None or maxima <= 0:
        return None
    return valor * Decimal(10) / maxima


def media_atividades(avaliacoes, notas_do_aluno):
    """Retorna (média Decimal, total lançado, total esperado).

    O peso individual vale apenas DENTRO do período. Recuperações nunca
    entram nessa média.
    """
    regulares = [av for av in avaliacoes
                if av.get('categoria') != 'recuperacao']
    soma, pesos, lancadas = Decimal(0), Decimal(0), 0
    for av in regulares:
        valor = nota_normalizada(notas_do_aluno.get(av['id']), av)
        peso = _numero(av.get('peso'), Decimal(1))
        if valor is None or peso is None or peso <= 0:
            continue
        soma += valor * peso
        pesos += peso
        lancadas += 1
    return (soma / pesos if pesos else None, lancadas, len(regulares))


def calcular_rendimento(aluno_id, avaliacoes, notas_por_aluno,
                       destinos_por_aluno=None):
    """Calcula notas efetivas, recuperações e média anual de um aluno.

    1ª REC cobre 1ª/2ª; 2ª REC cobre 3ª/4ª. Se ambas vermelhas, escolhe
    2ª/4ª (maior peso). No modo manual, o professor define um destino
    individual (por aluno), sempre dentro do par e com nota abaixo de 5.
    A recuperação só atua se superar a nota escolhida. A média anual
    é definitiva apenas com os quatro períodos completos.
    """
    notas = notas_por_aluno.get(aluno_id, {})
    destinos = (destinos_por_aluno or {}).get(aluno_id, {})
    regulares = {numero: [] for numero in PESOS_ANUAIS}
    recuperacoes = {1: [], 2: []}
    avisos = []

    for av in avaliacoes:
        try:
            numero = int(av.get('periodo_numero') or 0)
        except (ValueError, TypeError):
            continue
        if av.get('periodo_tipo') != 'avaliacao':
            continue
        if av.get('categoria') == 'recuperacao':
            if numero in recuperacoes:
                recuperacoes[numero].append(av)
        elif numero in regulares:
            regulares[numero].append(av)

    periodos = {}
    for numero, itens in regulares.items():
        media, lancadas, total = media_atividades(itens, notas)
        periodos[numero] = {
            'numero': numero,
            'peso': PESOS_ANUAIS[numero],
            'original': _decimal_para_nota(media),
            'efetiva': _decimal_para_nota(media),
            'recuperada': False,
            'lancadas': lancadas,
            'total_atividades': total,
            'completo': total > 0 and lancadas == total,
            '_valor': media,
        }

    situacao_recuperacoes = {}
    for rec_num, (primeiro, segundo) in {1: (1, 2), 2: (3, 4)}.items():
        candidatas = recuperacoes[rec_num]
        rec_nota = None
        alvo = None
        aplicada = False
        modo = ('manual' if candidatas and
                candidatas[0].get('recuperacao_modo') == 'manual'
                else 'automatico')
        if len(candidatas) > 1:
            avisos.append(
                f'Existem {len(candidatas)} avaliações para a {rec_num}ª '
                'recuperação; regularize os cadastros para utilizar as notas.'
            )
        elif candidatas:
            rec_av = candidatas[0]
            rec_nota = nota_normalizada(notas.get(rec_av['id']), rec_av)
            vermelhas = [numero for numero in (primeiro, segundo)
                         if periodos[numero]['_valor'] is not None
                         and periodos[numero]['_valor'] < NOTA_VERMELHA]
            if modo == 'manual':
                destino = destinos.get(rec_av['id'])
                # Um destino antigo pode deixar de ser elegível depois que o
                # professor corrigir a avaliação regular. Não o aplicamos.
                if destino in vermelhas:
                    alvo = destino
            elif len(vermelhas) == 2:
                alvo = segundo
            elif vermelhas:
                alvo = vermelhas[0]
            if (rec_nota is not None and alvo is not None
                    and rec_nota > periodos[alvo]['_valor']):
                periodos[alvo]['_valor'] = rec_nota
                periodos[alvo]['efetiva'] = _decimal_para_nota(rec_nota)
                periodos[alvo]['recuperada'] = True
                aplicada = True

        situacao_recuperacoes[rec_num] = {
            'nota': _decimal_para_nota(rec_nota),
            'alvo': alvo,
            'aplicada': aplicada,
            'modo': modo,
            'pendente_alvo': (modo == 'manual' and rec_nota is not None
                             and alvo is None),
            'cadastrada': bool(candidatas),
            'ambigua': len(candidatas) > 1,
        }

    soma, soma_pesos = Decimal(0), Decimal(0)
    for periodo in periodos.values():
        valor = periodo.pop('_valor')
        if valor is not None:
            soma += valor * periodo['peso']
            soma_pesos += periodo['peso']

    completo = all(periodo['completo'] for periodo in periodos.values())
    return {
        'periodos': periodos,
        'recuperacoes': situacao_recuperacoes,
        'total_pontos': _decimal_para_nota(soma) if soma_pesos else None,
        'media_parcial': _decimal_para_nota(soma / soma_pesos)
        if soma_pesos else None,
        'media_anual': _decimal_para_nota(soma / Decimal(10))
        if completo else None,
        'completo': completo,
        'avisos': avisos,
    }
