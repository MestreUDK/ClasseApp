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
        except Exception:
            # Não revelar se um e-mail está cadastrado ou não.
            # O provedor controla os limites e o envio de mensagens.
            pass

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
    token = data.get('access_token')
    password = data.get('password')
    if not isinstance(token, str) or not (20 <= len(token) <= 8192):
        return jsonify({'error': 'Link inválido ou expirado. Solicite outro.'}), 400
    if not isinstance(password, str) or not (8 <= len(password) <= 256):
        return jsonify({'error': 'A senha deve conter ao menos 8 caracteres.'}), 400
    if not SUPABASE_URL or not SUPABASE_KEY:
        return jsonify({'error': 'Autenticação indisponível.'}), 503

    # Autentica *somente esta operação* com o token de recuperação recebido.
    # Não use supabase.auth.update_user() no cliente global, pois seu estado
    # de sessão é compartilhado entre requisições do servidor Flask.
    endpoint = SUPABASE_URL.rstrip('/') + '/auth/v1/user'
    req = Request(
        endpoint,
        data=json.dumps({'password': password}).encode('utf-8'),
        headers={
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        },
        method='PUT',
    )
    try:
        with urlopen(req, timeout=12) as response:
            if not (200 <= response.status < 300):
                return jsonify({'error': 'Não foi possível atualizar a senha.'}), 502
    except HTTPError as exc:
        if exc.code in (400, 401, 403, 422):
            return jsonify({'error': 'Link inválido, expirado ou senha não aceita. Solicite um novo link.'}), 400
        return jsonify({'error': 'Falha temporária no serviço de autenticação.'}), 503
    except (URLError, TimeoutError, OSError):
        return jsonify({'error': 'Não foi possível contatar o serviço de autenticação.'}), 503

    resp = jsonify({'message': 'Senha atualizada! Entre usando sua nova senha.'})
    resp.headers['Cache-Control'] = 'no-store'
    return resp
