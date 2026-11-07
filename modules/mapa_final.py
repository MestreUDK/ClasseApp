"""Montagem do Mapa Final de Rendimento Escolar (exportação XLSX).

Reproduz a organização do formulário escolar, preservando as notas
originais e mostrando os pontos ponderados após as recuperações.
O resultado é indicativo e deve ser conferido conforme regras da escola.
"""

from collections import defaultdict

from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

from modules.rendimento import calcular_rendimento, PESOS_ANUAIS

MEDIA_MINIMA_REFERENCIA = 5
FREQUENCIA_MINIMA_REFERENCIA = 75


# Campos de presença são contabilizados por aluno e dia; uma data ainda
# não lançada NÃO é convertida em falta.
def contar_frequencia_anual(registros, ano):
    """Retorna {aluno_id: (presenças, faltas)} no ano, sem duplicar datas.

    Se houver dois registros no mesmo dia, usa o de atualização mais
    recente. Datas fora do ano são descartadas mesmo se a API mudar.
    """
    ultimo_por_dia = {}
    for registro in sorted(registros, key=lambda r: r.get('updated_at') or ''):
        data = str(registro.get('data') or '')
        aluno_id = registro.get('aluno_id')
        if not aluno_id or not data.startswith(f'{ano}-'):
            continue
        if registro.get('presente') not in (True, False):
            continue
        ultimo_por_dia[(str(aluno_id), data)] = registro['presente']

    contagem = defaultdict(lambda: [0, 0])
    for (aluno_id, _), presente in ultimo_por_dia.items():
        contagem[aluno_id][0 if presente else 1] += 1
    return {id_aluno: tuple(total) for id_aluno, total in contagem.items()}


def _titulo_seguro(texto):
    """Mantém textos fornecidos pelo usuário como texto, não fórmulas."""
    texto = str(texto or '')
    return "'" + texto if texto.lstrip().startswith(('=', '+', '-', '@')) else texto


def _borda_fina():
    lado = Side(style='thin', color='595959')
    return Border(left=lado, right=lado, top=lado, bottom=lado)


def montar_mapa_final(wb, alunos, avaliacoes, notas_map, destinos,
                       frequencias, turma_nome, componente, ano):
    """Adiciona 'Mapa Final' e 'Memória de Cálculo' ao livro existente.

    Os pesos anuais são 2/3/2/3. As REC são exibidas separadamente;
    os pontos ponderados usam a nota EFETIVA calculada no servidor.
    A média anual permanece em branco enquanto faltar uma atividade.
    """
    mapa = wb.create_sheet('Mapa Final', 0)
    memoria = wb.create_sheet('Memória de Cálculo', 1)
    presencas = contar_frequencia_anual(frequencias, ano)
    cinza = 'E7E7E7'
    cinza_secundario = 'F4F4F4'
    preto = '202020'
    borda = _borda_fina()

    mapa.merge_cells('A1:R1')
    mapa['A1'] = 'MAPA FINAL DO RENDIMENTO ESCOLAR'
    mapa['A1'].font = Font(name='Arial', size=14, bold=True, color=preto)
    mapa['A1'].alignment = Alignment(horizontal='center', vertical='center')
    mapa.row_dimensions[1].height = 28

    mapa.merge_cells('A2:K2')
    mapa['A2'] = f'COMPONENTE: {_titulo_seguro(componente or "Não informado")}'
    mapa.merge_cells('L2:R2')
    mapa['L2'] = f'ANO LETIVO: {ano}'
    mapa.merge_cells('A3:R3')
    mapa['A3'] = f'TURMA: {_titulo_seguro(turma_nome)}'
    mapa.merge_cells('A4:R4')
    mapa['A4'] = ('Resultado indicativo: média mínima 5,0 e frequência mínima 75%. '
                   'Conferir critérios de aprovação e fechamento com a escola.')
    for referencia in ('A2', 'L2', 'A3'):
        mapa[referencia].font = Font(name='Arial', size=10, bold=True)
    mapa['A4'].font = Font(name='Arial', size=9, italic=True, color='555555')

    for intervalo in ('A5:A7', 'B5:B7', 'C5:H5', 'I5:N5',
                      'O5:Q5', 'R5:R7', 'M6:M7', 'N6:N7'):
        mapa.merge_cells(intervalo)
    for col in 'CDEFGH':
        mapa.merge_cells(f'{col}6:{col}7')
    mapa.merge_cells('O6:Q6')

    grupos = {'A5': 'Nº', 'B5': 'ALUNO(A)',
              'C5': 'AVALIAÇÕES BIMESTRAIS',
              'I5': 'PROCESSO PONDERADO',
              'O5': 'APROVEITAMENTO ESCOLAR',
              'R5': 'RESULTADO', 'M6': 'TOTAL DE\nPONTOS',
              'N6': 'MÉDIA\nANUAL', 'O6': 'TOTAL'}
    for local, texto in grupos.items():
        mapa[local] = texto
    for col, texto in zip('CDEFGH', ['1ª', '2ª', 'REC', '3ª', '4ª', 'REC']):
        mapa[f'{col}6'] = texto
    for col, numero in zip('IJKL', (1, 2, 3, 4)):
        mapa[f'{col}6'] = f'{numero}ª AV.'
        mapa[f'{col}7'] = f'× {PESOS_ANUAIS[numero]}'
    for col, texto in zip('OPQ', ('PRESENÇA', 'FALTA', '% FREQ.')):
        mapa[f'{col}7'] = texto

    for linha in mapa.iter_rows(min_row=5, max_row=7, min_col=1, max_col=18):
        for celula in linha:
            celula.fill = PatternFill('solid', fgColor=cinza)
            celula.font = Font(name='Arial', size=8, bold=True)
            celula.alignment = Alignment(horizontal='center', vertical='center',
                                         wrap_text=True)
            celula.border = borda
    mapa.row_dimensions[5].height = 26
    mapa.row_dimensions[6].height = 29
    mapa.row_dimensions[7].height = 26

    memoria.append(['Nº', 'Aluno(a)', '1ª efetiva', '2ª efetiva', '3ª efetiva',
                    '4ª efetiva', '4 períodos completos?', 'Destino REC 1',
                    'REC 1 aplicada?', 'Destino REC 2', 'REC 2 aplicada?'])
    for celula in memoria[1]:
        celula.font = Font(name='Arial', size=9, bold=True)
        celula.fill = PatternFill('solid', fgColor=cinza)
        celula.alignment = Alignment(horizontal='center', wrap_text=True)
    memoria.row_dimensions[1].height = 30

    for indice, aluno in enumerate(alunos, start=1):
        rendimento = calcular_rendimento(aluno['id'], avaliacoes, notas_map, destinos)
        periodos = rendimento['periodos']
        rec1, rec2 = rendimento['recuperacoes'][1], rendimento['recuperacoes'][2]
        linha = indice + 7
        linha_memoria = indice + 1
        nome = _titulo_seguro(aluno.get('nome_completo') or '')
        memoria.append([
            indice, nome,
            *(periodos[n]['efetiva'] for n in (1, 2, 3, 4)),
            'SIM' if rendimento['completo'] else 'NÃO',
            rec1['alvo'], 'SIM' if rec1['aplicada'] else 'NÃO',
            rec2['alvo'], 'SIM' if rec2['aplicada'] else 'NÃO',
        ])
        presentes, faltas = presencas.get(str(aluno['id']), (0, 0))
        originais = [periodos[n]['original'] for n in (1, 2, 3, 4)]
        mapa.append([
            indice, nome, originais[0], originais[1], rec1['nota'],
            originais[2], originais[3], rec2['nota'],
        ])
        # As notas efetivas ficam registradas numa memória auditável.
        # As fórmulas multiplicam pela ponderação SEM atribuir peso à REC.
        for col_destino, col_origem, periodo in zip('IJKL', 'CDEF', (1, 2, 3, 4)):
            referencia = f"'Memória de Cálculo'!{col_origem}{linha_memoria}"
            mapa[f'{col_destino}{linha}'] = (
                f'=IF({referencia}="","",{referencia}*{PESOS_ANUAIS[periodo]})'
            )
        mapa[f'M{linha}'] = f'=IF(COUNT(I{linha}:L{linha})=0,"",SUM(I{linha}:L{linha}))'
        mapa[f'N{linha}'] = (
            f'=IF(OR(COUNT(I{linha}:L{linha})<4,'
            f"'Memória de Cálculo'!G{linha_memoria}<>\"SIM\"),\"\",ROUND(M{linha}/10,2))"
        )
        mapa[f'O{linha}'] = presentes
        mapa[f'P{linha}'] = faltas
        mapa[f'Q{linha}'] = (
            f'=IF(SUM(O{linha}:P{linha})=0,"",ROUND(100*O{linha}/SUM(O{linha}:P{linha}),1))'
        )
        mapa[f'R{linha}'] = (
            f'=IF(N{linha}="","EM ANDAMENTO",'
            f'IF(Q{linha}="","SEM FREQUÊNCIA",'
            f'IF(AND(N{linha}>={MEDIA_MINIMA_REFERENCIA},'
            f'Q{linha}>={FREQUENCIA_MINIMA_REFERENCIA}),"APROVADO","REPROVADO")))'
        )
        for celula in mapa[linha]:
            celula.font = Font(name='Arial', size=9, color=preto)
            celula.alignment = Alignment(vertical='center',
                                         horizontal='left' if celula.column == 2 else 'center')
            celula.border = borda
            if indice % 2 == 0:
                celula.fill = PatternFill('solid', fgColor=cinza_secundario)
            if celula.column in tuple(range(3, 15)) + (17,):
                celula.number_format = '0.0'
        mapa.row_dimensions[linha].height = 21

    for coluna in 'CDEFGH':
        intervalo = f'{coluna}8:{coluna}{max(8, 7 + len(alunos))}'
        mapa.conditional_formatting.add(
            intervalo, CellIsRule(operator='lessThan',
                                 formula=[str(MEDIA_MINIMA_REFERENCIA)],
                                 font=Font(color='9C0006', bold=True))
        )

    largura = {'A': 5, 'B': 33, 'C': 8, 'D': 8, 'E': 8, 'F': 8,
               'G': 8, 'H': 8, 'I': 9, 'J': 9, 'K': 9, 'L': 9,
               'M': 11, 'N': 10, 'O': 11, 'P': 10, 'Q': 10, 'R': 15}
    for coluna, valor in largura.items():
        mapa.column_dimensions[coluna].width = valor
    memoria.column_dimensions['A'].width = 6
    memoria.column_dimensions['B'].width = 35
    for coluna in 'CDEFGHIJK':
        memoria.column_dimensions[coluna].width = 20
    for linha in memoria.iter_rows(min_row=2, min_col=3, max_col=6):
        for celula in linha:
            celula.number_format = '0.00'

    ultima_linha = max(8, len(alunos) + 7)
    rodape = ultima_linha + 2
    mapa.merge_cells(start_row=rodape, start_column=1,
                      end_row=rodape, end_column=18)
    mapa.cell(rodape, 1, 'REC 1 atende 1ª/2ª AV.; REC 2 atende 3ª/4ª AV. '
              'A recuperação não possui peso próprio; só eleva a nota da avaliação recuperada.')
    mapa.cell(rodape, 1).font = Font(name='Arial', size=8, italic=True)
    mapa.merge_cells(start_row=rodape + 1, start_column=1,
                      end_row=rodape + 1, end_column=18)
    mapa.cell(rodape + 1, 1,
              'Células vazias significam nota não lançada. Frequência: apenas chamadas registradas no ano letivo.')
    mapa.cell(rodape + 1, 1).font = Font(name='Arial', size=8, italic=True)

    mapa.freeze_panes = 'C8'
    mapa.sheet_view.showGridLines = False
    memoria.freeze_panes = 'C2'
    memoria.sheet_view.showGridLines = False
    mapa.sheet_properties.pageSetUpPr.fitToPage = True
    mapa.page_setup.orientation = 'landscape'
    mapa.page_setup.paperSize = mapa.PAPERSIZE_A3
    mapa.page_setup.fitToWidth = 1
    mapa.page_setup.fitToHeight = 0
    mapa.print_title_rows = '1:7'
    mapa.print_area = f'A1:R{rodape + 1}'
    mapa.oddFooter.center.text = 'ClasseApp · Página &P de &N'
    try:
        wb.calculation.fullCalcOnLoad = True
        wb.calculation.forceFullCalc = True
    except AttributeError:
        pass
    return mapa
