"""Nascimento completo, idade opcional e aniversário apenas dia/mês."""
import unittest
from datetime import date
from modules.aniversarios import (
    calcular_aniversarios, interpretar_aniversario_sem_ano,
    validar_campos_aniversario,
)


class IdadesDeAniversario(unittest.TestCase):
    def test_ano_presente_calcula_idade_no_aniversario(self):
        alunos = [
            {'id': 'a', 'nome_completo': 'Ana', 'data_nascimento': '2010-11-11'},
            {'id': 'b', 'nome_completo': 'Bruna', 'data_nascimento': '2012-11-12'},
        ]
        resp = calcular_aniversarios(alunos, date(2026, 11, 11), 7)
        self.assertEqual([x['idade'] for x in resp['alertas']], [16, 14])
        self.assertIn('16 anos hoje', resp['alertas'][0]['mensagem'])
        self.assertIn('14 anos amanhã', resp['alertas'][1]['mensagem'])

    def test_ano_ausente_nao_inventa_idade(self):
        alunos = [{'id': 'a', 'nome_completo': 'João', 'data_nascimento': None,
                   'aniversario_dia_mes': '11-11'}]
        resp = calcular_aniversarios(alunos, date(2026, 11, 11), 7)
        self.assertEqual(resp['alunos_com_nascimento'], 1)
        self.assertIsNone(resp['alertas'][0]['idade'])
        self.assertIn('faz aniversário hoje', resp['alertas'][0]['mensagem'])
        self.assertNotIn('anos', resp['alertas'][0]['mensagem'])

    def test_virada_ano_usa_idade_do_proximo_aniversario(self):
        aluno = [{'id': 'x', 'nome_completo': 'Rosa', 'data_nascimento': '2015-01-02'}]
        resp = calcular_aniversarios(aluno, date(2026, 12, 31), 7)
        self.assertEqual(resp['alertas'][0]['idade'], 12)

    def test_29_fevereiro_parcial_e_completo(self):
        parcial = [{'id': 'x', 'nome_completo': 'Bia', 'aniversario_dia_mes': '02-29'}]
        completo = [{'id': 'y', 'nome_completo': 'Cris', 'data_nascimento': '2012-02-29'}]
        self.assertEqual(calcular_aniversarios(parcial, date(2027,2,28), 7)['alertas'][0]['dias'], 0)
        self.assertIsNone(calcular_aniversarios(parcial, date(2027,2,28), 7)['alertas'][0]['idade'])
        self.assertEqual(calcular_aniversarios(completo, date(2027,2,28), 7)['alertas'][0]['idade'], 15)
        self.assertEqual(calcular_aniversarios(parcial, date(2028,2,28), 7)['alertas'][0]['dias'], 1)

    def test_valida_sem_ano_com_ano_e_dados_vazios(self):
        self.assertEqual(validar_campos_aniversario({'aniversario_dia_mes': '02-29'}),
                         {'data_nascimento': None, 'aniversario_dia_mes': '02-29'})
        self.assertEqual(validar_campos_aniversario({'data_nascimento': '2012-02-29'}),
                         {'data_nascimento': '2012-02-29', 'aniversario_dia_mes': None})
        self.assertEqual(validar_campos_aniversario({}),
                         {'data_nascimento': None, 'aniversario_dia_mes': None})
        self.assertEqual(interpretar_aniversario_sem_ano('29/02'), (2,29))
        for payload in (
            {'aniversario_dia_mes': '02-30'},
            {'aniversario_dia_mes': '13-01'},
            {'aniversario_dia_mes': '2-03'},
            {'data_nascimento': '2025-02-29'},
            {'data_nascimento': '2012-02-29', 'aniversario_dia_mes':'02-29'},
        ):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                validar_campos_aniversario(payload)


if __name__ == '__main__':
    unittest.main()
