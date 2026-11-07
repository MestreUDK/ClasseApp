"""Testes isolados do proxy Supabase (não precisam de servidor nem credenciais)."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path


class ClienteFalso:
    def __init__(self, identidade=''):
        self.id = identidade
        self.chamadas = []
        self.auth = types.SimpleNamespace(set_session=self.set_session)

    def set_session(self, access, refresh):
        self.chamadas.append((access, refresh))
        if access == 'token-erro-401':
            exc = RuntimeError('token rejeitado')
            exc.status = 401
            raise exc
        if access == 'token-erro-rede':
            raise ConnectionError('sem rede')
        user_id = access.split(':')[0]
        return types.SimpleNamespace(
            user=types.SimpleNamespace(id=user_id),
            session=types.SimpleNamespace(
                access_token=access + ':renovado',
                refresh_token=refresh + ':renovado',
            ),
        )

    def table(self, tabela):
        return (self.id, tabela)


class IsolamentoSupabase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.clientes = []
        cls.flask = types.ModuleType('flask')
        cls.flask.g = types.SimpleNamespace()
        cls.flask.session = {}
        cls.flask.has_request_context = lambda: True
        cls.supabase_mod = types.ModuleType('supabase')
        cls.dotenv_mod = types.ModuleType('dotenv')
        cls.dotenv_mod.load_dotenv = lambda: None

        def factory(*_args):
            cliente = ClienteFalso(str(len(cls.clientes)))
            cls.clientes.append(cliente)
            return cliente

        cls.supabase_mod.create_client = factory
        cls.originais = {name: sys.modules.get(name)
                         for name in ('flask', 'supabase', 'dotenv')}
        sys.modules['flask'] = cls.flask
        sys.modules['supabase'] = cls.supabase_mod
        sys.modules['dotenv'] = cls.dotenv_mod
        modulo = 'utils_test_sessoes'
        spec = importlib.util.spec_from_file_location(
            modulo, Path(__file__).resolve().parents[1] / 'utils.py'
        )
        cls.utils = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.utils)

    @classmethod
    def tearDownClass(cls):
        for name, original in cls.originais.items():
            if original is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = original

    def setUp(self):
        self.flask.g.__dict__.clear()
        self.flask.session.clear()
        # Na aplicação real, g e session são LocalProxy por requisição.

    def autenticar(self, user_id):
        self.flask.session.update({
            '_user_id': user_id,
            'supabase_access_token': user_id + ':jwt',
            'supabase_refresh_token': user_id + ':refresh',
        })

    def test_requisicoes_de_usuarios_diferentes_nao_compartilham_cliente(self):
        self.autenticar('professor-a')
        primeiro = self.utils.cliente_supabase_requisicao()
        self.assertEqual(primeiro.chamadas[0][0], 'professor-a:jwt')
        self.assertIs(self.utils.cliente_supabase_requisicao(), primeiro)
        self.assertEqual(self.flask.session['supabase_refresh_token'],
                         'professor-a:refresh:renovado')

        self.flask.g.__dict__.clear()
        self.flask.session.clear()
        self.autenticar('professor-b')
        segundo = self.utils.cliente_supabase_requisicao()
        self.assertIsNot(primeiro, segundo)
        self.assertEqual(segundo.chamadas[0][0], 'professor-b:jwt')

    def test_proxy_repassa_consulta_ao_cliente_da_propria_requisicao(self):
        self.autenticar('professor-a')
        valor = self.utils.supabase.table('turmas')
        self.assertEqual(valor[1], 'turmas')
        self.assertEqual(valor[0], self.flask.g._classeapp_supabase.id)

    def test_identidade_diferente_e_recusada(self):
        self.autenticar('professor-b')
        self.flask.session['supabase_access_token'] = 'professor-a:jwt'
        with self.assertRaises(self.utils.ErroSessaoSupabase) as ctx:
            self.utils.cliente_supabase_requisicao()
        self.assertTrue(ctx.exception.invalida)
        self.assertFalse(hasattr(self.flask.g, '_classeapp_supabase'))

    def test_sessao_sem_tokens_nao_pode_consultar_banco(self):
        self.flask.session['_user_id'] = 'professor-a'
        with self.assertRaises(self.utils.ErroSessaoSupabase) as ctx:
            self.utils.cliente_supabase_requisicao()
        self.assertTrue(ctx.exception.invalida)

    def test_expiracao_reconhecida_e_distinta_da_falha_de_rede(self):
        self.autenticar('professor-a')
        self.flask.session['supabase_access_token'] = 'token-erro-401'
        with self.assertRaises(self.utils.ErroSessaoSupabase) as ctx:
            self.utils.cliente_supabase_requisicao()
        self.assertTrue(ctx.exception.invalida)
        self.flask.g.__dict__.clear()
        self.flask.session['supabase_access_token'] = 'token-erro-rede'
        with self.assertRaises(self.utils.ErroSessaoSupabase) as ctx:
            self.utils.cliente_supabase_requisicao()
        self.assertFalse(ctx.exception.invalida)

    def test_cliente_publico_nao_possui_estado_de_outros_usuarios(self):
        self.autenticar('professor-a')
        cliente_usuario = self.utils.cliente_supabase_requisicao()
        cliente_isolado = self.utils.novo_cliente_supabase()
        self.assertIsNot(cliente_usuario, cliente_isolado)
        self.assertEqual(cliente_isolado.chamadas, [])


if __name__ == '__main__':
    unittest.main()
