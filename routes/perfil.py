# routes/perfil.py

from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_required, current_user
from utils import supabase

perfil_bp = Blueprint('perfil_bp', __name__)

@perfil_bp.route('/perfil', methods=['GET', 'POST'])
@login_required
def perfil():
    if request.method == 'POST':
        nova_senha = request.form.get('password')
        
        if nova_senha:
            try:
                # Atualiza a senha no Supabase
                attributes = {"password": nova_senha}
                supabase.auth.update_user(attributes)
                flash("Senha alterada com sucesso!", "success")
            except Exception as e:
                flash(f"Erro ao alterar senha: {str(e)}", "error")
        else:
            flash("Digite uma nova senha para alterar.", "error")

    return render_template('perfil.html', email=current_user.email)