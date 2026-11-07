"""Cliente Supabase isolado por requisição Flask.

O SDK mantém a sessão de Auth no próprio objeto Client. Compartilhar um
Client global entre professores poderia trocar as credenciais entre requisições.
Este módulo preserva a interface ``from utils import supabase`` usada nas
rotas, mas cria um cliente diferente em cada requisição autenticada.
"""

import os

from dotenv import load_dotenv
from flask import g, has_request_context, session
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')


class ErroSessaoSupabase(Exception):
    """Falha ao restaurar a identidade da sessão no Supabase."""

    def __init__(self, invalida=False):
        super().__init__('Não foi possível validar a sessão do Supabase.')
        self.invalida = invalida


def novo_cliente_supabase():
    """Cria um cliente de Auth independente, sem sessões de outros usuários."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def _erro_autenticacao(exc):
    """Distingue rejeição explícita de token de uma falha temporária de rede."""
    status = getattr(exc, 'status', None)
    if status is None:
        status = getattr(exc, 'status_code', None)
    try:
        return int(status) in (400, 401, 403)
    except (TypeError, ValueError):
        return False


def cliente_supabase_requisicao():
    """Recupera a sessão Supabase da conta desta requisição, uma única vez.

    Apenas a sessão autenticada pelo Supabase no login é reutilizada. Se houver
    divergência entre o identificador retornado pelo Auth e o Flask-Login,
    bloqueamos a requisição. Nunca reutilizamos o token de outro visitante.
    """
    if not has_request_context():
        raise RuntimeError('O cliente Supabase deve ser usado em uma requisição Flask.')

    cliente = getattr(g, '_classeapp_supabase', None)
    if cliente is not None:
        return cliente

    cliente = novo_cliente_supabase()
    usuario_id = session.get('_user_id')
    if usuario_id:
        access = session.get('supabase_access_token')
        refresh = session.get('supabase_refresh_token')
        if not access or not refresh:
            raise ErroSessaoSupabase(invalida=True)

        try:
            resposta = cliente.auth.set_session(access, refresh)
        except Exception as exc:
            # Erros temporários não eliminam as credenciais do professor:
            # o pedido pode ser tentado novamente quando a rede estabilizar.
            raise ErroSessaoSupabase(invalida=_erro_autenticacao(exc)) from exc

        usuario_auth = getattr(resposta, 'user', None)
        sessao_auth = getattr(resposta, 'session', None)
        if (
            not usuario_auth or str(getattr(usuario_auth, 'id', '')) != str(usuario_id)
            or not sessao_auth or not getattr(sessao_auth, 'access_token', None)
            or not getattr(sessao_auth, 'refresh_token', None)
        ):
            raise ErroSessaoSupabase(invalida=True)

        # O Auth pode renovar o JWT e o refresh token ao restaurar a sessão.
        if sessao_auth.access_token != access:
            session['supabase_access_token'] = sessao_auth.access_token
        if sessao_auth.refresh_token != refresh:
            session['supabase_refresh_token'] = sessao_auth.refresh_token

    g._classeapp_supabase = cliente
    return cliente


class _SupabasePorRequisicao:
    """Compatibilidade com rotas que importam ``supabase`` diretamente."""

    def __getattr__(self, atributo):
        return getattr(cliente_supabase_requisicao(), atributo)


supabase = _SupabasePorRequisicao()
