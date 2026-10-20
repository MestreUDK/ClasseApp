"""Controle otimista de versões para lançamentos escolares.

Revisões são comparadas na condição do UPDATE para evitar corrida entre requisições.
"""
from flask import jsonify
from utils import supabase


def salvar_versionado(tabela, filtros, valores, revisao):
    """Atualiza condicionalmente ou insere novo registro; devolve (objeto, HTTP)."""
    if revisao is None:
        return {"error": "Revisão obrigatória. Atualize a página antes de salvar."}, 428
    if not isinstance(revisao, int) or isinstance(revisao, bool) or revisao < 0:
        return {"error": "Revisão inválida."}, 400
    consulta = supabase.table(tabela).select('id,revision')
    for chave, valor in filtros.items():
        consulta = consulta.eq(chave, valor)
    encontrados = consulta.limit(1).execute().data or []
    if encontrados:
        registro = encontrados[0]
        if registro['revision'] != revisao:
            return {"error": "Conflito: registro alterado na nuvem. Recarregue antes de salvar.", "revision_atual": registro['revision']}, 409
        atualizacao = supabase.table(tabela).update(valores).eq('id', registro['id']).eq('revision', revisao)
        for chave, valor in filtros.items():
            atualizacao = atualizacao.eq(chave, valor)
        gravados = atualizacao.execute().data or []
        if not gravados:
            return {"error": "Conflito: registro modificado durante o salvamento."}, 409
        return gravados[0], 200
    if revisao != 0:
        return {"error": "Registro removido ou alterado. Recarregue a página."}, 409
    # A unicidade deve ser garantida por UNIQUE no banco; conflito não vira overwrite.
    try:
        criados = supabase.table(tabela).insert({**filtros, **valores}).execute().data or []
        if not criados:
            return {"error": "Falha ao inserir registro."}, 500
        return criados[0], 200
    except Exception as exc:
        if '23505' in str(exc) or 'duplicate key' in str(exc).lower():
            return {"error": "Conflito: outro dispositivo criou este registro."}, 409
        raise
