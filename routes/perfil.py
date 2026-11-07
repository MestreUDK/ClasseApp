"""Página de perfil e resumo de alertas do professor autenticado."""

from datetime import date, datetime
from hmac import compare_digest
from secrets import token_urlsafe

from flask import Blueprint, flash, jsonify, redirect, render_template, request, session, url_for
from flask_login import current_user, login_required, logout_user

from utils import novo_cliente_supabase, supabase

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
    """Mostra o Perfil e atualiza a senha somente após reautenticação."""
    csrf = session.get('perfil_csrf_token')
    if not csrf:
        csrf = token_urlsafe(32)
        session['perfil_csrf_token'] = csrf

    if request.method == 'POST':
        token_recebido = request.form.get('csrf_token', '')
        if not compare_digest(token_recebido, csrf):
            flash('Solicitação inválida. Atualize a página e tente novamente.', 'error')
            return redirect(url_for('perfil_bp.perfil')), 303

        senha_atual = request.form.get('senha_atual') or ''
        nova_senha = request.form.get('password') or ''
        if not senha_atual or not 8 <= len(nova_senha) <= 256:
            flash('Informe sua senha atual e uma nova senha de 8 a 256 caracteres.', 'error')
            return redirect(url_for('perfil_bp.perfil')), 303

        try:
            # Cliente separado: validar senha nunca modifica uma sessão alheia.
            cliente = novo_cliente_supabase()
            resposta = cliente.auth.sign_in_with_password({
                'email': current_user.email, 'password': senha_atual,
            })
            if not resposta.user or str(resposta.user.id) != str(current_user.id):
                flash('Senha atual inválida. Nenhuma alteração foi feita.', 'error')
                return redirect(url_for('perfil_bp.perfil')), 303

            cliente.auth.update_user({'password': nova_senha})
        except Exception:
            flash('Não foi possível alterar a senha. Confira a senha atual e tente novamente.', 'error')
            return redirect(url_for('perfil_bp.perfil')), 303

        # Depois de trocar a senha, exigir uma nova autenticação do professor.
        logout_user()
        session.clear()
        flash('Senha alterada! Faça login novamente com a nova senha.', 'success')
        return redirect(url_for('auth_bp.login')), 303

    return render_template('perfil.html', email=current_user.email,
                           notification_user_id=str(current_user.id),
                           perfil_csrf_token=csrf)
