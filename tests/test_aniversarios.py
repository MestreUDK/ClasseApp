"""Regras de aniversários e consulta autorizada da v2.2.28."""
import ast
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace

from modules.aniversarios import calcular_aniversarios, interpretar_data_nascimento

RAIZ = Path(__file__).resolve().parents[1]


class Aniversarios(unittest.TestCase):
    def test_datas_iso_legado_e_invalidas(self):
        self.assertEqual(interpretar_data_nascimento('2010-11-11'), date(2010, 11, 11))
        self.assertEqual(interpretar_data_nascimento('11/11/2010'), date(2010, 11, 11))
        self.assertEqual(interpretar_data_nascimento('2010-11-11T23:00:00Z'), date(2010, 11, 11))
        self.assertIsNone(interpretar_data_nascimento('31/02/2010'))
        self.assertIsNone(interpretar_data_nascimento(None))

    def test_hoje_amanha_e_sete_dias(self):
        alunos = [
            {'id':'a', 'nome_completo':'Ana', 'data_nascimento':'2010-11-11'},
            {'id':'b', 'nome_completo':'Bruna', 'data_nascimento':'2012-11-12'},
            {'id':'c', 'nome_completo':'Carlos', 'data_nascimento':'2012-11-18'},
            {'id':'d', 'nome_completo':'Davi', 'data_nascimento':'2011-11-19'},
            {'id':'e', 'nome_completo':'Eva', 'data_nascimento':None},
        ]
        resp=calcular_aniversarios(alunos, date(2026,11,11), 7)
        self.assertEqual([a['nome'] for a in resp['alertas']], ['Ana','Bruna','Carlos'])
        self.assertEqual([a['dias'] for a in resp['alertas']], [0,1,7])
        self.assertEqual(resp['alunos_com_nascimento'], 4)
        self.assertIn('hoje', resp['alertas'][0]['mensagem'])
        self.assertIn('amanhã', resp['alertas'][1]['mensagem'])

    def test_virada_de_ano_e_dispensa_por_ano(self):
        aluno = [{'id':'abc','nome_completo':'Teste','data_nascimento':'2000-01-02'}]
        resp=calcular_aniversarios(aluno,date(2026,12,31),7)
        self.assertEqual(resp['alertas'][0]['id'],'aniversario:abc:2027')
        self.assertEqual(resp['alertas'][0]['dias'],2)
        resp2=calcular_aniversarios(aluno,date(2027,1,3),30)
        self.assertEqual(resp2['alertas'],[])

    def test_29_de_fevereiro_em_ano_nao_bissexto(self):
        aluno=[{'id':'x','nome_completo':'Bissexto','data_nascimento':'2012-02-29'}]
        self.assertEqual(calcular_aniversarios(aluno,date(2027,2,28),7)['alertas'][0]['dias'],0)
        self.assertEqual(calcular_aniversarios(aluno,date(2028,2,28),7)['alertas'][0]['dias'],1)

    def test_perfil_nao_mistura_contas_e_pagina_mais_de_500(self):
        arvore=ast.parse((RAIZ/'routes/perfil.py').read_text(encoding='utf-8'))
        funcao=next(n for n in arvore.body if isinstance(n,ast.FunctionDef) and n.name=='resumo_notificacoes')
        funcao.decorator_list=[]
        class Query:
            def __init__(self): self.chamadas=[]
            def select(self,*args): return self
            def eq(self,*args):
                self.chamadas.append(('eq',args))
                return self
            def order(self,*args): return self
            def range(self,inicio,fim):
                self.inicio=inicio
                return self
            def execute(self):
                # Teste de paginação: há 502 alunos do mesmo professor.
                size=min(500,502-self.inicio)
                return SimpleNamespace(data=[{'id':str(self.inicio+i), 'nome_completo':'Aluno',
                    'data_nascimento':'2010-11-11'} for i in range(size)])
        query=Query()
        vars_={'supabase':SimpleNamespace(table=lambda _:query),
               'request':SimpleNamespace(args={'dias':'7'}),
               'current_user':SimpleNamespace(id='prof-uid'),
               'calcular_aniversarios':lambda alunos,dias:{'quantidade':len(alunos),'dias':dias},
               'jsonify':lambda dado:dado,
               'current_app':SimpleNamespace(logger=SimpleNamespace(warning=lambda *_:None))}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[funcao],type_ignores=[])),
                     'routes/perfil.py','exec'),vars_)
        result=vars_['resumo_notificacoes']()
        self.assertEqual(result,{'quantidade':502,'dias':7})
        self.assertEqual(query.chamadas,[('eq',('user_id','prof-uid'))]*2)
        vars_['request'].args={'dias':'999'}
        _,status=vars_['resumo_notificacoes']()
        self.assertEqual(status,400)
        self.assertEqual(len(query.chamadas),2)


if __name__=='__main__':
    unittest.main()
