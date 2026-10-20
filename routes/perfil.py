"""Página de perfil e resumo de alertas do professor autenticado."""

from datetime import date, datetime

from flask import Blueprint, flash, jsonify, render_template, request
from flask_login import current_user, login_required

from utils import supabase

perfil_bp = Blueprint('perfil_bp', __name__)


def _aniversario(valor):
    """Converte formatos de data conhecidos, ignorando valores inválidos."""
    if not valor:
        return None
    valor = str(valor).strip()
    for formato in ('%Y-%m-%d', '%d/%m/%Y', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.strptime(valor[:19] if 'T' in formato else valor[:10], formato).date()
        except ValueError:
            continue
    return None


@perfil_bp.route('/api/notificacoes/resumo', methods=['GET'])
@login_required
def resumo_notificacoes():
    """Lista aniversários próximos sem expor alunos de outros usuários."""
    try:
        resposta = (supabase.table('alunos')
                    .select('id,nome_completo,data_nascimento')
                    .eq('user_id', current_user.id).execute())
        alunos = resposta.data if hasattr(resposta, 'data') else resposta[1]
        hoje = date.today()
        alertas = []
        for aluno in alunos or []:
            nascimento = _aniversario(aluno.get('data_nascimento'))
            if not nascimento:
                continue
            for ano in (hoje.year, hoje.year + 1):
                try:
                    aniversario = nascimento.replace(year=ano)
                except ValueError:
                    aniversario = date(ano, 2, 28)
                dias = (aniversario - hoje).days
                if 0 <= dias <= 7:
                    nome = aluno.get('nome_completo') or 'Aluno'
                    mensagem = (f'{nome} faz aniversário hoje!' if dias == 0
                                else f'{nome} faz aniversário em {dias} dia(s).')
                    alertas.append({
                        'id': f"aniversario:{aluno.get('id')}:{ano}",
                        'tipo': 'aniversario', 'titulo': 'Aniversário de aluno',
                        'mensagem': mensagem, 'dias': dias,
                    })
                    break
        alertas.sort(key=lambda item: (item['dias'], item['mensagem']))
        return jsonify({'alertas': alertas})
    except Exception:
        return jsonify({'error': 'Não foi possível consultar os aniversários.'}), 503


@perfil_bp.route('/perfil', methods=['GET', 'POST'])
@login_required
def perfil():
    """Exibe o perfil e mantém o formulário de alteração de senha existente."""
    if request.method == 'POST':
        nova_senha = request.form.get('password')
        if nova_senha:
            try:
                supabase.auth.update_user({'password': nova_senha})
                flash('Senha alterada com sucesso!', 'success')
            except Exception as exc:
                flash(f'Erro ao alterar senha: {exc}', 'error')
        else:
            flash('Digite uma nova senha para alterar.', 'error')
    return render_template('perfil.html', email=current_user.email,
                           notification_user_id=str(current_user.id))
