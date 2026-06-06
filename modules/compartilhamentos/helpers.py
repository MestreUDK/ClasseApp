# modules/compartilhamentos/helpers.py

import random
import string
from datetime import datetime, timezone

from utils import supabase


def gerar_codigo_compartilhamento(tamanho=8):
    caracteres = string.ascii_uppercase + string.digits

    while True:
        codigo = "".join(random.choice(caracteres) for _ in range(tamanho))

        res, _ = supabase.table("compartilhamentos") \
            .select("id") \
            .eq("codigo", codigo) \
            .execute()

        if not res[1]:
            return codigo


def verificar_dono_turma(turma_id, user_id):
    res, _ = supabase.table("turmas") \
        .select("id") \
        .eq("id", str(turma_id)) \
        .eq("user_id", user_id) \
        .execute()

    return len(res[1]) > 0


def compartilhamento_expirado(compartilhamento):
    expira_em = compartilhamento.get("expira_em")

    if not expira_em:
        return False

    try:
        expira_em_limpo = expira_em.replace("Z", "+00:00")
        data_expiracao = datetime.fromisoformat(expira_em_limpo)

        if data_expiracao.tzinfo is None:
            data_expiracao = data_expiracao.replace(tzinfo=timezone.utc)

        return data_expiracao < datetime.now(timezone.utc)

    except Exception:
        return False


def buscar_compartilhamento_por_codigo(codigo):
    res, _ = supabase.table("compartilhamentos") \
        .select("*") \
        .eq("codigo", codigo.upper()) \
        .eq("ativo", True) \
        .single() \
        .execute()

    compartilhamento = res[1]

    if not compartilhamento:
        return None

    if compartilhamento_expirado(compartilhamento):
        return None

    return compartilhamento


def filtrar_compartilhamentos_validos(compartilhamentos):
    return [
        item for item in compartilhamentos
        if not compartilhamento_expirado(item)
    ]