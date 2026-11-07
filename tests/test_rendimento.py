"""Testes de regressão dos pesos e das duas recuperações escolares.

Executar na raiz do projeto: python -m unittest discover -s tests
"""

import unittest

from modules.rendimento import calcular_rendimento


def avaliacao(nome, numero, categoria='prova', peso=None, nota_maxima=10):
    return {
        'id': nome, 'nome': nome, 'categoria': categoria,
        'periodo_tipo': 'avaliacao', 'periodo_numero': numero,
        'nota_maxima': nota_maxima,
        'peso': peso or (3 if numero in (2, 4) else 2),
    }


class TestarRecuperacoes(unittest.TestCase):
    def setUp(self):
        self.avs = [avaliacao('a1', 1), avaliacao('a2', 2),
                    avaliacao('a3', 3), avaliacao('a4', 4),
                    avaliacao('r1', 1, 'recuperacao', 99),
                    avaliacao('r2', 2, 'recuperacao', 99)]

    def calcular(self, **valores):
        return calcular_rendimento('aluno', self.avs, {'aluno': valores})

    def test_duas_vermelhas_prioriza_segunda(self):
        r = self.calcular(a1=4, a2=3, a3=7, a4=6, r1=8)
        self.assertEqual(r['periodos'][1]['efetiva'], 4)
        self.assertEqual(r['periodos'][2]['efetiva'], 8)
        self.assertTrue(r['periodos'][2]['recuperada'])
        self.assertEqual(r['recuperacoes'][1]['alvo'], 2)
        self.assertEqual(r['media_anual'], 6.4)
        self.assertEqual(r['total_pontos'], 64)

    def test_vermelha_apenas_primeira(self):
        r = self.calcular(a1=4, a2=7, a3=8, a4=9, r1=6)
        self.assertEqual(r['periodos'][1]['efetiva'], 6)
        self.assertEqual(r['periodos'][2]['efetiva'], 7)
        self.assertEqual(r['recuperacoes'][1]['alvo'], 1)

    def test_recuperacao_segunda_dupla_prioriza_quarta(self):
        r = self.calcular(a1=7, a2=6, a3=2, a4=4, r2=9)
        self.assertEqual(r['periodos'][3]['efetiva'], 2)
        self.assertEqual(r['periodos'][4]['efetiva'], 9)
        self.assertEqual(r['recuperacoes'][2]['alvo'], 4)

    def test_recuperacao_nao_abaixa_nota(self):
        r = self.calcular(a1=4, a2=3, a3=5, a4=8, r1=2)
        self.assertEqual(r['periodos'][2]['efetiva'], 3)
        self.assertFalse(r['recuperacoes'][1]['aplicada'])

    def test_sem_vermelha_nao_aplica_recuperacao(self):
        r = self.calcular(a1=5, a2=5, a3=6, a4=8, r1=10)
        self.assertIsNone(r['recuperacoes'][1]['alvo'])
        self.assertEqual(r['periodos'][2]['efetiva'], 5)

    def test_recuperacao_peso_99_nao_entra_na_media(self):
        r = self.calcular(a1=7, a2=8, a3=9, a4=10, r1=10, r2=10)
        self.assertEqual(r['media_anual'], 8.6)

    def test_ausencia_da_quarta_nao_gera_media_anual(self):
        r = self.calcular(a1=4, a2=5, a3=6, r1=7)
        self.assertIsNone(r['media_anual'])
        self.assertFalse(r['completo'])
        self.assertEqual(r['media_parcial'], 5.86)

    def test_zero_e_nota_valida(self):
        r = self.calcular(a1=0, a2=0, a3=0, a4=0)
        self.assertEqual(r['media_anual'], 0)
        self.assertTrue(r['completo'])

    def test_normalizacao_de_nota_maxima(self):
        self.avs[0]['nota_maxima'] = 20
        r = self.calcular(a1=16, a2=8, a3=8, a4=8)
        self.assertEqual(r['periodos'][1]['efetiva'], 8)
        self.assertEqual(r['media_anual'], 8)

    def test_duplicata_recuperacao_nao_e_aplicada(self):
        self.avs.append(avaliacao('r1extra', 1, 'recuperacao'))
        r = self.calcular(a1=2, a2=1, a3=6, a4=7, r1=10, r1extra=9)
        self.assertFalse(r['recuperacoes'][1]['aplicada'])
        self.assertEqual(r['periodos'][2]['efetiva'], 1)
        self.assertTrue(r['avisos'])

    def test_atividades_modulares_nao_duplicam_peso_oficial(self):
        self.avs.append(avaliacao('trabalho1', 1, 'trabalho', peso=1))
        r = self.calcular(a1=8, trabalho1=2, a2=6, a3=6, a4=6)
        self.assertEqual(r['periodos'][1]['efetiva'], 6)
        self.assertEqual(r['media_anual'], 6)

    def test_sem_registro_de_nota_nao_e_zero(self):
        r = self.calcular(a1=4, a3=6, a4=8, r1=9)
        self.assertIsNone(r['periodos'][2]['original'])
        self.assertIsNone(r['media_anual'])


if __name__ == '__main__':
    unittest.main()
