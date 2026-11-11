"""Testes da v2.2.27 sem credenciais reais do Supabase."""
import ast
from pathlib import Path
from hmac import compare_digest
from types import SimpleNamespace
from jinja2 import Environment, FileSystemLoader

BASE = Path(__file__).resolve().parents[1]


def funcao_isolada(nome, variaveis):
    arvore = ast.parse((BASE/'routes/perfil.py').read_text(encoding='utf-8'))
    fn = next(n for n in arvore.body if isinstance(n, ast.FunctionDef) and n.name == nome)
    fn.decorator_list = []
    exec(compile(ast.fix_missing_locations(ast.Module(body=[fn],type_ignores=[])),
                 'routes/perfil.py', 'exec'),variaveis)
    return variaveis[nome]


def test_telas_separadas_e_controles_presentes():
    env=Environment(loader=FileSystemLoader(str(BASE/'templates')))
    env.globals['url_for'] = lambda _, filename='', **kw: '/static/'+filename
    env.globals['current_user'] = SimpleNamespace(id='usr-abc',is_authenticated=True)
    env.globals['get_flashed_messages'] = lambda **kw: []
    for nome in ('perfil','configuracoes','notificacoes','sincronizacao'):
            html=env.get_template(nome+'.html').render(app_version='2.2.27',current_year=2026,
                email='alguem@example.org',notification_user_id='usr-abc',perfil_csrf_token='csrf')
            assert 'ClasseApp' in html
            assert 'styles.css' in html
            if nome == 'perfil':
                assert 'Alterar Senha' in html
                assert 'id="dados-offline"' not in html
                assert 'id="notificacoes"' not in html
            elif nome=='configuracoes':
                assert 'id="offline-acesso"' in html
                assert 'id="aparencia"' in html
                assert 'id="sincronizacao"' not in html
            elif nome=='notificacoes':
                assert 'id="notificacoes"' in html
                assert 'id="offline-acesso"' not in html
            else:
                for ident in ('comparador-geral','pacotes-alteracoes','sincronizacao','dados-offline','sync-academico'):
                    assert html.count('id="'+ident+'"')==1


def contexto_senha(senha, token, resp_user='uid1'):
    usuario=SimpleNamespace(id='uid1',email='professor@example.org')
    class Auth:
        dados=None
        def sign_in_with_password(self, credenciais):
            self.dados=credenciais
            return SimpleNamespace(user=SimpleNamespace(id=resp_user))
    auth=Auth()
    request=SimpleNamespace(headers={'X-CSRF-Token':token},get_json=lambda silent=None:{'senha':senha})
    vars_={'request':request,'compare_digest':compare_digest,'_csrf_perfil':lambda:'csrf-ok',
           'current_user':usuario,'novo_cliente_supabase':lambda:SimpleNamespace(auth=auth),
           'jsonify':lambda x:x}
    func=funcao_isolada('validar_senha_cofre', vars_)
    return func,auth


def test_endpoint_valida_conta_sem_compartilhar_cliente():
    func,auth=contexto_senha('Senha2026!','csrf-ok')
    assert func()=={'valida':True}
    assert auth.dados=={'email':'professor@example.org','password':'Senha2026!'}


def test_endpoint_exige_csrf_valido():
    func,auth=contexto_senha('Senha2026!','token-errado')
    _,codigo=func()
    assert codigo==403
    assert auth.dados is None


def test_endpoint_rejeita_identidade_divergente():
    func,_=contexto_senha('Senha2026!','csrf-ok','outro-id')
    _,codigo=func()
    assert codigo==401


def test_endpoint_rejeita_senha_curta_ou_invalida():
    func,_=contexto_senha('curta','csrf-ok')
    _,codigo=func()
    assert codigo==400
