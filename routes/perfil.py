"""Página de perfil e resumo de alertas do professor autenticado."""

from hmac import compare_digest
from secrets import token_urlsafe

from flask import Blueprint, current_app, flash, jsonify, redirect, render_template, request, session, url_for
from flask_login import current_user, login_required, logout_user

from utils import novo_cliente_supabase, supabase
from modules.aniversarios import calcular_aniversarios

perfil_bp = Blueprint('perfil_bp', __name__)


@perfil_bp.route('/api/notificacoes/resumo', methods=['GET'])
@login_required
def resumo_notificacoes():
    """Busca aniversários dos alunos do próprio professor (7 ou 30 dias).

    Pagina resultados para não ignorar alunos após o limite do PostgREST.
    Requisições com parâmetros inválidos não consultam o banco.
    """
    periodo = request.args.get('dias', '7')
    if periodo not in ('7', '30'):
        return jsonify({'error': 'Período inválido. Escolha 7 ou 30 dias.'}), 400
    try:
        alunos = []
        pagina = 500
        inicio = 0
        while True:
            resposta = (supabase.table('alunos')
                        .select('id,nome_completo,data_nascimento')
                        .eq('user_id', str(current_user.id))
                        .order('id')
                        .range(inicio, inicio + pagina - 1)
                        .execute())
            lote = resposta.data if hasattr(resposta, 'data') else resposta[1]
            alunos.extend(lote or [])
            if len(lote or []) < pagina:
                break
            inicio += pagina
        return jsonify(calcular_aniversarios(alunos, dias=int(periodo)))
    except Exception as exc:
        # Não registrar nomes, datas ou credenciais nos logs de produção.
        current_app.logger.warning('Falha na consulta de aniversários: %s',
                                   type(exc).__name__)
        return jsonify({'error': 'Não foi possível consultar os aniversários. Tente novamente.'}), 503


def _csrf_perfil():
    token = session.get('perfil_csrf_token')
    if not token:
        token = token_urlsafe(32)
        session['perfil_csrf_token'] = token
    return token


@perfil_bp.route('/perfil', methods=['GET', 'POST'])
@login_required
def perfil():
    """Mostra o Perfil e atualiza a senha somente após reautenticação."""
    csrf = _csrf_perfil()

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


@perfil_bp.route('/notificacoes')
@login_required
def pagina_notificacoes():
    return render_template('notificacoes.html', notification_user_id=str(current_user.id))


@perfil_bp.route('/configuracoes')
@login_required
def pagina_configuracoes():
    return render_template('configuracoes.html', email=current_user.email,
                           notification_user_id=str(current_user.id),
                           perfil_csrf_token=_csrf_perfil())


@perfil_bp.route('/sincronizacao')
@login_required
def pagina_sincronizacao():
    return render_template('sincronizacao.html', notification_user_id=str(current_user.id))


@perfil_bp.route('/api/offline/validar-senha', methods=['POST'])
@login_required
def validar_senha_cofre():
    """Confirma a senha online antes de derivar a chave local no navegador.

    Não emite tokens, não persiste senhas e não reutiliza a sessão Auth global.
    O verificador offline só será criado após esta confirmação explícita.
    """
    if not compare_digest(request.headers.get('X-CSRF-Token') or '', _csrf_perfil()):
        return jsonify({'error': 'Verificação de formulário inválida. Atualize Configurações.'}), 403
    dados = request.get_json(silent=True) or {}
    if not isinstance(dados, dict):
        return jsonify({'error': 'Formato de solicitação inválido.'}), 400
    senha = dados.get('senha', '')
    if not isinstance(senha, str) or not 8 <= len(senha) <= 256:
        return jsonify({'error': 'Informe a senha da sua conta (8 a 256 caracteres).'}), 400
    try:
        resposta = novo_cliente_supabase().auth.sign_in_with_password({
            'email': current_user.email, 'password': senha,
        })
        if not resposta.user or str(resposta.user.id) != str(current_user.id):
            return jsonify({'error': 'Senha de login incorreta.'}), 401
    except Exception:
        return jsonify({'error': 'Senha incorreta ou autenticação indisponível. Tente novamente.'}), 401
    return jsonify({'valida': True})
