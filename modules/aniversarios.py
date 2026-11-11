"""Cálculo de aniversários dos alunos, independente da hospedagem e do banco.

A data corrente é sempre calculada no fuso da escola (America/Fortaleza por
padrão), evitando que a virada do dia em UTC antecipe os avisos.
"""

import os
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


DIAS_PERMITIDOS = (7, 30)


def data_hoje_escola():
    """Devolve a data local da escola; permite APP_TIMEZONE na hospedagem."""
    try:
        fuso = ZoneInfo(os.environ.get('APP_TIMEZONE') or 'America/Fortaleza')
    except (ZoneInfoNotFoundError, ValueError):
        # Hospedagens sem base IANA de fusos usam UTC-3, horário de Fortaleza.
        fuso = timezone(timedelta(hours=-3))
    return datetime.now(fuso).date()


def interpretar_data_nascimento(valor):
    """Aceita DATE do PostgreSQL e representações legadas (ISO ou DD/MM/AAAA)."""
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    if not isinstance(valor, str):
        return None
    texto = valor.strip()
    if not texto:
        return None
    # DATE é devolvido normalmente em YYYY-MM-DD, às vezes com hora/fuso.
    for formato, trecho in (('%Y-%m-%d', texto[:10]),
                            ('%d/%m/%Y', texto[:10])):
        try:
            nascimento = datetime.strptime(trecho, formato).date()
            return nascimento
        except ValueError:
            continue
    return None


def _aniversario_no_ano(nascimento, ano):
    try:
        return nascimento.replace(year=ano)
    except ValueError:
        # Regra adotada para 29/02 em anos não bissextos: aviso em 28/02.
        return date(ano, 2, 28)


def calcular_aniversarios(alunos, hoje=None, dias=7):
    """Retorna avisos em ordem cronológica, limitados aos próximos N dias.

    A lista de entrada deve ser previamente filtrada por user_id na consulta
    autenticada ao Supabase; esta função não decide permissões de acesso.
    """
    if dias not in DIAS_PERMITIDOS:
        raise ValueError('Período de notificação inválido.')
    hoje = hoje or data_hoje_escola()
    limite = hoje + timedelta(days=dias)
    alertas = []
    com_nascimento = 0
    for aluno in alunos:
        nascimento = interpretar_data_nascimento(aluno.get('data_nascimento'))
        if not nascimento:
            continue
        com_nascimento += 1
        proximo = _aniversario_no_ano(nascimento, hoje.year)
        if proximo < hoje:
            proximo = _aniversario_no_ano(nascimento, hoje.year + 1)
        if proximo > limite:
            continue
        distancia = (proximo - hoje).days
        nome = (aluno.get('nome_completo') or 'Aluno').strip() or 'Aluno'
        if distancia == 0:
            mensagem = f'{nome} faz aniversário hoje! 🎉'
        elif distancia == 1:
            mensagem = f'{nome} faz aniversário amanhã.'
        else:
            mensagem = f'{nome} faz aniversário em {distancia} dias.'
        alertas.append({
            'id': f"aniversario:{aluno['id']}:{proximo.year}",
            'tipo': 'aniversario',
            'titulo': 'Aniversário hoje' if distancia == 0 else 'Próximo aniversário',
            'mensagem': mensagem,
            'nome': nome,
            'data': proximo.isoformat(),
            'data_formatada': proximo.strftime('%d/%m'),
            'dias': distancia,
        })
    alertas.sort(key=lambda item: (item['dias'], item['nome'].casefold()))
    return {'alertas': alertas, 'total_alunos': len(alunos),
            'alunos_com_nascimento': com_nascimento,
            'dias_consultados': dias, 'data_referencia': hoje.isoformat()}
