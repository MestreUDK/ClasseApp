"""Testes do Mapa Final exportado pelo ClasseApp (sem Supabase).

Executar: python -m unittest discover -s tests
"""

import unittest
from io import BytesIO

from openpyxl import Workbook, load_workbook

from modules.mapa_final import contar_frequencia_anual, montar_mapa_final


def avaliacao(identificador, periodo, categoria='prova', modo='automatico'):
    return {
        'id': identificador, 'periodo_tipo': 'avaliacao',
        'periodo_numero': periodo, 'categoria': categoria,
        'nota_maxima': 10, 'peso': 3 if periodo in (2, 4) else 2,
        'recuperacao_modo': modo,
    }


class TestarMapaFinal(unittest.TestCase):
    def setUp(self):
        self.avaliacoes = [
            avaliacao('a1', 1), avaliacao('a2', 2),
            avaliacao('a3', 3), avaliacao('a4', 4),
            avaliacao('r1', 1, 'recuperacao'),
            avaliacao('r2', 2, 'recuperacao'),
        ]
        self.alunos = [
            {'id': 'aluno-1', 'nome_completo': 'Ana Silva'},
            {'id': 'aluno-2', 'nome_completo': '=INJETAR()'},
        ]
        self.notas = {
            'aluno-1': {'a1': 4, 'a2': 3, 'a3': 7, 'a4': 6, 'r1': 8},
            'aluno-2': {'a1': 0, 'a2': 9, 'a3': 6},
        }
        self.frequencias = [
            {'aluno_id': 'aluno-1', 'data': '2026-01-10', 'presente': True},
            {'aluno_id': 'aluno-1', 'data': '2026-01-11', 'presente': False},
            {'aluno_id': 'aluno-1', 'data': '2026-01-12', 'presente': True},
            {'aluno_id': 'aluno-1', 'data': '2025-01-12', 'presente': False},
            {'aluno_id': 'aluno-2', 'data': '2026-01-12', 'presente': True},
        ]

    def gerar(self, destinos=None):
        livro = Workbook()
        mapa = montar_mapa_final(
            livro, self.alunos, self.avaliacoes, self.notas, destinos or {},
            self.frequencias, '6º Ano', 'Matemática', 2026)
        return livro, mapa

    def test_estrutura_e_recuperacao_peso_da_avaliacao(self):
        livro, mapa = self.gerar()
        self.assertEqual(livro.sheetnames[:2], ['Mapa Final', 'Memória de Cálculo'])
        self.assertEqual(mapa['A1'].value, 'MAPA FINAL DO RENDIMENTO ESCOLAR')
        self.assertEqual(mapa['A2'].value, 'COMPONENTE: Matemática')
        self.assertEqual(mapa['L2'].value, 'ANO LETIVO: 2026')
        self.assertEqual([mapa[f'{col}8'].value for col in 'CDEFGH'],
                         [4.0, 3.0, 8.0, 7.0, 6.0, None])
        memoria = livro['Memória de Cálculo']
        self.assertEqual([memoria[f'{col}2'].value for col in 'CDEF'],
                         [4.0, 8.0, 7.0, 6.0])
        self.assertIn('*3', mapa['J8'].value)
        self.assertIn('SUM(I8:L8)', mapa['M8'].value)
        self.assertIn('M8/10', mapa['N8'].value)
        self.assertEqual((mapa['O8'].value, mapa['P8'].value), (2, 1))
        self.assertEqual(mapa['G9'].value, None)
        self.assertEqual(mapa['C9'].value, 0)
        self.assertEqual(memoria['G3'].value, 'NÃO')

    def test_lancamentos_incompletos_nao_viram_zero(self):
        _, mapa = self.gerar()
        self.assertIsNone(mapa['G9'].value)
        self.assertTrue(mapa['N9'].value.startswith('=IF(OR(COUNT('))
        self.assertIn('G3', mapa['N9'].value)

    def test_contagem_frequencia_por_data_com_ultima_atualizacao(self):
        dados = self.frequencias + [
            {'aluno_id': 'aluno-1', 'data': '2026-01-11', 'presente': True,
             'updated_at': '2026-10-01T12:00:00+00:00'},
        ]
        contagem = contar_frequencia_anual(dados, 2026)
        self.assertEqual(contagem['aluno-1'], (3, 0))
        self.assertEqual(contagem['aluno-2'], (1, 0))

    def test_manual_aplica_ao_destino_sem_modificar_original(self):
        self.avaliacoes[4]['recuperacao_modo'] = 'manual'
        _, mapa = self.gerar({'aluno-1': {'r1': 1}})
        self.assertEqual(mapa['C8'].value, 4)
        self.assertEqual(mapa['D8'].value, 3)
        livro, _ = self.gerar({'aluno-1': {'r1': 1}})
        self.assertEqual(livro['Memória de Cálculo']['C2'].value, 8)
        self.assertEqual(livro['Memória de Cálculo']['D2'].value, 3)

    def test_exporta_xlsx_valido_com_formulas_e_configuracoes_impressao(self):
        livro, mapa = self.gerar()
        memoria = livro['Memória de Cálculo']
        self.assertEqual(mapa.print_title_rows, '$1:$7')
        self.assertEqual(mapa.page_setup.orientation, 'landscape')
        self.assertEqual(mapa.freeze_panes, 'C8')
        self.assertTrue(memoria['B3'].value.startswith("'="))
        dados = BytesIO()
        livro.save(dados)
        dados.seek(0)
        reaberto = load_workbook(dados, data_only=False)
        self.assertEqual(reaberto['Mapa Final']['R8'].data_type, 'f')
        self.assertEqual(reaberto['Mapa Final']['Q8'].data_type, 'f')
        self.assertEqual(reaberto['Mapa Final']['B9'].data_type, 's')


if __name__ == '__main__':
    unittest.main()
