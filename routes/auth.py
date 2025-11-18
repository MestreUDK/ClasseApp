# routes/auth.py

from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_user, logout_user, login_required
from utils import supabase
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
                # Cria o objeto User para o Flask-Login
                user = User(id=response.user.id, email=response.user.email)
                login_user(user)
                return redirect(url_for('pages_bp.home'))
            
        except Exception as e:
            # Captura erro do Supabase (ex: senha errada)
            flash(f"Erro ao entrar: {str(e)}", "error")
            
    return render_template('login.html')

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')

        try:
            # Tenta criar usuário no Supabase
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
    supabase.auth.sign_out() # Logout no Supabase
    logout_user() # Logout no Flask
    return redirect(url_for('auth_bp.login'))