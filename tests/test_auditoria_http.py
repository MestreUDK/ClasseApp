"""Verificações locais da v2.2.26 sem credenciais nem servidor externo."""

import ast
import types
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


def carregar_funcao(arquivo, nome, variaveis):
    """Executa somente uma função isolada do módulo, sem importar o Flask real."""
    arvore = ast.parse((RAIZ / arquivo).read_text(encoding='utf-8'))
    funcao = next(node for node in arvore.body
                  if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                  and node.name == nome)
    funcao.decorator_list = []
    modulo = ast.Module(body=[funcao], type_ignores=[])
    exec(compile(ast.fix_missing_locations(modulo), str(arquivo), 'exec'), variaveis)
    return variaveis[nome]


class ProtegerHTTP(unittest.TestCase):
    def setUp(self):
        self.requisicao = types.SimpleNamespace(path='/api/notas')
        self.usuario = types.SimpleNamespace(is_authenticated=False)
        self.aviso = []
        self.variaveis = {
            'request': self.requisicao,
            'current_user': self.usuario,
            'jsonify': lambda obj: obj,
            'login_manager': types.SimpleNamespace(
                login_message='Faça login para acessar esta página.',
                login_message_category='info',
                login_view='auth_bp.login',
            ),
            'flash': lambda *args: self.aviso.append(args),
            'url_for': lambda nome: '/login' if nome == 'auth_bp.login' else None,
            'redirect': lambda url: ('redirect', url),
        }
        self.nao_autorizado = carregar_funcao('app.py', 'nao_autorizado', self.variaveis)
        self.proteger = carregar_funcao('app.py', 'proteger_respostas', self.variaveis)

    def test_api_sem_sessao_responde_401_json_sem_redirecionar(self):
        resposta, status = self.nao_autorizado()
        self.assertEqual(status, 401)
        self.assertIn('Sessão', resposta['error'])
        self.assertEqual(self.aviso, [])

    def test_pagina_normal_continua_levando_ao_login(self):
        self.requisicao.path = '/turma/123'
        self.assertEqual(self.nao_autorizado(), ('redirect', '/login'))
        self.assertEqual(len(self.aviso), 1)

    def test_api_autenticada_nao_e_cacheada(self):
        resposta = types.SimpleNamespace(headers={})
        self.proteger(resposta)
        self.assertEqual(resposta.headers['Cache-Control'], 'no-store')
        self.assertEqual(resposta.headers['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(resposta.headers['Referrer-Policy'], 'no-referrer')

    def test_pagina_offline_publica_permanece_cacheavel(self):
        self.requisicao.path = '/offline'
        resposta = types.SimpleNamespace(headers={})
        self.proteger(resposta)
        self.assertNotIn('Cache-Control', resposta.headers)

    def test_paginas_do_professor_nao_ficam_em_cache_http(self):
        self.usuario.is_authenticated = True
        self.requisicao.path = '/turma/qualquer'
        resposta = types.SimpleNamespace(headers={})
        self.proteger(resposta)
        self.assertEqual(resposta.headers['Cache-Control'], 'no-store')


class ConsultasSeguras(unittest.TestCase):
    def test_cadastro_compartilhado_nao_solicita_contatos_ou_detalhes(self):
        conteudo = (RAIZ / 'modules/compartilhamentos/consultas.py').read_text()
        trecho = conteudo.split('def buscar_alunos_compartilhados', 1)[1].split('\n\ndef ', 1)[0]
        self.assertIn('alunos(id, nome_completo, matricula, data_nascimento, aniversario_dia_mes)', trecho)
        self.assertNotIn('alunos(*)', trecho)

    def test_ausencia_de_vinculo_retorna_404(self):
        class QueryFake:
            data = []
            def select(self, *_): return self
            def eq(self, *_): return self
            def limit(self, *_): return self
            def execute(self): return self
        supabase = types.SimpleNamespace(table=lambda _t: QueryFake())
        vars_ = {'supabase': supabase, 'jsonify': lambda item: item,
                 'verificar_dono_turma': lambda _: True}
        remover = carregar_funcao('routes/turmas.py', 'remover_aluno_turma', vars_)
        resposta, status = remover('id-nao-encontrado')
        self.assertEqual(status, 404)
        self.assertIn('não encontrado', resposta['error'])

    def test_ausencia_de_avaliacao_retorna_404(self):
        class QueryFake:
            data = []
            def select(self, *_): return self
            def eq(self, *_): return self
            def limit(self, *_): return self
            def execute(self): return self
        vars_ = {'supabase': types.SimpleNamespace(table=lambda _t: QueryFake()),
                 'current_user': types.SimpleNamespace(id='usuario-teste'),
                 'jsonify': lambda item: item}
        carregar = carregar_funcao('routes/notas.py', 'get_notas_avaliacao', vars_)
        resposta, status = carregar('avaliacao-inexistente')
        self.assertEqual(status, 404)
        self.assertIn('Avaliação', resposta['error'])


if __name__ == '__main__':
    unittest.main()
