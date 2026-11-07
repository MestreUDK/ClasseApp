# routes/auth.py

import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from flask import (
    Blueprint, flash, jsonify, make_response, redirect, render_template,
    request, session, url_for,
)
from flask_login import login_user, logout_user, login_required
from utils import supabase, SUPABASE_KEY, SUPABASE_URL
from models import User

auth_bp = Blueprint('auth_bp', __name__)

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')

        try:
            # Tenta logar no Supabase
            response = supabase.auth.sign_in_with_password({"email": email, "password": password})
            
            if response.user:
                user = User(id=response.user.id, email=response.user.email)
                login_user(user)
                
                # --- CORREÇÃO: Salva o email na sessão ---
                session['user_email'] = response.user.email 
                
                return redirect(url_for('pages_bp.home'))
            
        except Exception as e:
            flash(f"Erro ao entrar: {str(e)}", "error")
            
    return render_template('login.html')

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')

        try:
            response = supabase.auth.sign_up({"email": email, "password": password})
            
            if response.user:
                flash("Conta criada com sucesso! Faça login.", "success")
                return redirect(url_for('auth_bp.login'))
                
        except Exception as e:
            flash(f"Erro ao criar conta: {str(e)}", "error")

    return render_template('register.html')

@auth_bp.route('/logout')
@login_required
def logout():
    supabase.auth.sign_out()
    logout_user()
    session.pop('user_email', None) # Limpa o email da sessão ao sair
    return redirect(url_for('auth_bp.login'))

@auth_bp.route('/esqueci-senha', methods=['GET', 'POST'])
def forgot_password():
    """Solicita uma recuperação de senha usando o e-mail do Supabase Auth."""
    if request.method == 'POST':
        email = (request.form.get('email') or '').strip().lower()
        if not email or len(email) > 254 or '@' not in email:
            flash('Informe um e-mail válido.', 'error')
            return render_template('forgot_password.html'), 400

        # Não montar redirect_to a partir de um Host enviado pelo cliente.
        base_url = os.environ.get('APP_PUBLIC_URL', '').strip().rstrip('/')
        parsed = urlparse(base_url)
        is_local = parsed.hostname in ('localhost', '127.0.0.1')
        safe_scheme = parsed.scheme == 'https' or (is_local and parsed.scheme == 'http')
        if (
            not safe_scheme or not parsed.netloc or parsed.username
            or parsed.password or parsed.path not in ('', '/')
            or parsed.query or parsed.fragment
        ):
            flash('Recuperação indisponível. Configure APP_PUBLIC_URL no servidor.', 'error')
            return render_template('forgot_password.html'), 503

        reset_url = f'{base_url}{url_for("auth_bp.reset_password")}'
        try:
            supabase.auth.reset_password_for_email(
                email, {'redirect_to': reset_url}
            )
        except Exception as exc:
            # A resposta continua neutra quanto à existência da conta.
            # Mas um limite atingido precisa ser explicado ao usuário.
            details = str(exc).lower()
            if '429' in details or 'rate limit' in details or 'rate_limit' in details:
                flash('Limite de envio de e-mails atingido. Aguarde antes de tentar novamente.', 'warning')
                return redirect(url_for('auth_bp.forgot_password'))
            flash('Não foi possível solicitar a recuperação no momento. Tente mais tarde.', 'error')
            return redirect(url_for('auth_bp.forgot_password'))

        flash(
            'Se houver uma conta com esse e-mail, você receberá um link de recuperação. '
            'Verifique também a caixa de spam.',
            'success',
        )
        return redirect(url_for('auth_bp.forgot_password'))

    return render_template('forgot_password.html')


@auth_bp.route('/redefinir-senha', methods=['GET', 'POST'])
def reset_password():
    """Redefine a senha com o token temporário do link de recuperação."""
    if request.method == 'GET':
        response = make_response(render_template('reset_password.html'))
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Referrer-Policy'] = 'no-referrer'
        return response

    if not request.is_json:
        return jsonify({'error': 'Envie os dados em JSON.'}), 415

    data = request.get_json(silent=True) or {}
    token_hash = data.get('token_hash')
    token = data.get('access_token')
    password = data.get('password')

    # Um único tipo de credencial, sempre obtida de um link de recuperação.
    if bool(token_hash) == bool(token):
        return jsonify({'error': 'Link de recuperação inválido. Solicite outro.'}), 400
    if token_hash is not None and (
        not isinstance(token_hash, str) or not (20 <= len(token_hash) <= 2048)
    ):
        return jsonify({'error': 'Link de recuperação inválido. Solicite outro.'}), 400
    if token is not None and (
        not isinstance(token, str) or not (20 <= len(token) <= 8192)
    ):
        return jsonify({'error': 'Link de recuperação inválido. Solicite outro.'}), 400
    if not isinstance(password, str) or not (8 <= len(password) <= 256):
        return jsonify({'error': 'A senha deve ter entre 8 e 256 caracteres.'}), 400
    if not SUPABASE_URL or not SUPABASE_KEY:
        return jsonify({'error': 'Autenticação indisponível.'}), 503

    base_endpoint = SUPABASE_URL.rstrip('/') + '/auth/v1'
    common_headers = {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
    }

    if token_hash:
        # O modelo customizado envia diretamente o hash do OTP. A verificação
        # consome o token apenas quando o usuário confirma a nova senha,
        # evitando que scanners de e-mail consumam links ao pré-visualizá-los.
        verify_request = Request(
            base_endpoint + '/verify',
            data=json.dumps({
                'token_hash': token_hash,
                'type': 'recovery',
            }).encode('utf-8'),
            headers=common_headers,
            method='POST',
        )
        try:
            with urlopen(verify_request, timeout=12) as verify_response:
                verified = json.load(verify_response)
                token = verified.get('access_token') or (
                    verified.get('session') or {}
                ).get('access_token')
                if not token:
                    return jsonify({'error': 'Não foi possível confirmar o link de recuperação.'}), 502
        except HTTPError as exc:
            if exc.code in (400, 401, 403, 404, 422):
                return jsonify({'error': 'Link inválido, expirado ou já utilizado. Solicite outro.'}), 400
            if exc.code == 429:
                return jsonify({'error': 'Muitas tentativas. Aguarde antes de tentar novamente.'}), 429
            return jsonify({'error': 'Falha temporária na validação do link.'}), 503
        except (URLError, TimeoutError, OSError, ValueError, TypeError):
            return jsonify({'error': 'Não foi possível validar o link no Supabase.'}), 503

    # Altera a senha usando SOMENTE a sessão recém-validada (ou token de
    # recuperação legado); nunca usa o cliente Supabase global do Flask.
    update_request = Request(
        base_endpoint + '/user',
        data=json.dumps({'password': password}).encode('utf-8'),
        headers={**common_headers, 'Authorization': f'Bearer {token}'},
        method='PUT',
    )
    try:
        with urlopen(update_request, timeout=12) as update_response:
            if not (200 <= update_response.status < 300):
                return jsonify({'error': 'Não foi possível atualizar a senha.'}), 502
    except HTTPError as exc:
        if exc.code == 422:
            return jsonify({'error': 'O Supabase rejeitou a senha. Verifique os requisitos e solicite um novo link de recuperação.'}), 422
        if exc.code in (400, 401, 403):
            return jsonify({'error': 'Sessão de recuperação inválida ou expirada. Solicite outro link.'}), 400
        if exc.code == 429:
            return jsonify({'error': 'Muitas tentativas. Aguarde antes de tentar novamente.'}), 429
        return jsonify({'error': 'Falha temporária no serviço de autenticação.'}), 503
    except (URLError, TimeoutError, OSError):
        return jsonify({'error': 'Não foi possível contatar o serviço de autenticação.'}), 503

    resp = jsonify({'message': 'Senha atualizada! Entre usando sua nova senha.'})
    resp.headers['Cache-Control'] = 'no-store'
    return resp
