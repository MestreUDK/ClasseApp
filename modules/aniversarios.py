"""Cálculo de aniversários dos alunos, independente da hospedagem e do banco.

A data corrente é sempre calculada no fuso da escola (America/Fortaleza por
padrão), evitando que a virada do dia em UTC antecipe os avisos.
"""

import os
import re
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


def interpretar_aniversario_sem_ano(valor):
    """Retorna (mês, dia) para valores MM-DD, sem inventar um ano de nascimento.

    Aceita também --MM-DD e DD/MM em cópias antigas ou importadas.
    O ano 2000 é usado *apenas* para validar 29/02, nunca para idade.
    """
    if not isinstance(valor, str):
        return None
    texto = valor.strip()
    if re.fullmatch(r'--\d{2}-\d{2}', texto):
        texto = texto[2:]
    if re.fullmatch(r'\d{2}-\d{2}', texto):
        mes, dia = map(int, texto.split('-'))
    elif re.fullmatch(r'\d{2}/\d{2}', texto):
        dia, mes = map(int, texto.split('/'))
    else:
        return None
    try:
        date(2000, mes, dia)
    except ValueError:
        return None
    return mes, dia


def validar_campos_aniversario(dados):
    """Valida os campos usados em cadastro/edição, sem datas fictícias.

    Data completa e aniversário sem ano são mutuamente exclusivos. O campo
    parcial é salvo como MM-DD em coluna própria (VARCHAR(5) no Supabase).
    """
    data_completa = dados.get('data_nascimento') or None
    parcial = dados.get('aniversario_dia_mes') or None
    if data_completa and parcial:
        raise ValueError('Informe a data completa OU apenas dia e mês.')
    if data_completa:
        if not isinstance(data_completa, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', data_completa):
            raise ValueError('Nascimento inválido. Use AAAA-MM-DD.')
        nascimento = interpretar_data_nascimento(data_completa)
        if not nascimento or nascimento.year < 1 or nascimento > data_hoje_escola():
            raise ValueError('Data de nascimento inválida ou futura.')
    if parcial:
        if not isinstance(parcial, str) or not re.fullmatch(r'\d{2}-\d{2}', parcial) or not interpretar_aniversario_sem_ano(parcial):
            raise ValueError('Aniversário sem ano inválido. Use MM-DD (ex.: 11-25).')
    return {'data_nascimento': data_completa, 'aniversario_dia_mes': parcial}


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
        parcial = interpretar_aniversario_sem_ano(aluno.get('aniversario_dia_mes'))
        if nascimento:
            base = nascimento
        elif parcial:
            base = date(2000, parcial[0], parcial[1])
        else:
            continue
        com_nascimento += 1
        proximo = _aniversario_no_ano(base, hoje.year)
        if proximo < hoje:
            proximo = _aniversario_no_ano(base, hoje.year + 1)
        if proximo > limite:
            continue
        distancia = (proximo - hoje).days
        nome = (aluno.get('nome_completo') or 'Aluno').strip() or 'Aluno'
        idade = (proximo.year - nascimento.year) if nascimento and proximo.year >= nascimento.year else None
        if idade is not None:
            if distancia == 0:
                mensagem = f'{nome} completa {idade} ano{"s" if idade != 1 else ""} hoje! 🎉'
            elif distancia == 1:
                mensagem = f'{nome} completa {idade} ano{"s" if idade != 1 else ""} amanhã.'
            else:
                mensagem = f'{nome} completa {idade} ano{"s" if idade != 1 else ""} em {distancia} dias.'
        elif distancia == 0:
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
            'idade': idade,  # None quando somente o dia/mês foi informado
            'data': proximo.isoformat(),
            'data_formatada': proximo.strftime('%d/%m'),
            'dias': distancia,
        })
    alertas.sort(key=lambda item: (item['dias'], item['nome'].casefold()))
    return {'alertas': alertas, 'total_alunos': len(alunos),
            'alunos_com_nascimento': com_nascimento,
            'dias_consultados': dias, 'data_referencia': hoje.isoformat()}
