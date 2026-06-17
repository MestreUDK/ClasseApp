# app.py

import os
from flask import Flask, session # <-- IMPORTAR SESSION
from flask_login import LoginManager

# Importa os blueprints
from routes.pages import pages_bp
from routes.turmas import turmas_bp
from routes.alunos import alunos_bp
from routes.frequencia import frequencia_bp
from routes.search import search_bp
from routes.estatisticas import estatisticas_bp
from routes.exportar import exportar_bp
from routes.diario import diario_bp
from routes.auth import auth_bp 
from routes.dashboard import dashboard_bp 
from routes.disciplinas import disciplinas_bp
from routes.compartilhamentos import compartilhamentos_bp
from routes.perfil import perfil_bp 
from routes.notas import notas_bp
from models import User 

app = Flask(__name__)

# ==========================================
# --- NOVO: CONFIGURAÇÃO DE VERSÃO ---
# ==========================================
app.config['VERSION'] = '2.1'

# Context Processor para injetar a variável em todos os templates HTML
@app.context_processor
def inject_version():
    return dict(app_version=app.config['VERSION'])

# CONFIGURAÇÃO DE SEGURANÇA
app.secret_key = os.environ.get("SECRET_KEY", "minha_chave_secreta_super_segura")

# Configura o Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'auth_bp.login' 

@login_manager.user_loader
def load_user(user_id):
    # --- CORREÇÃO: Tenta pegar o email da sessão ---
    user_email = session.get('user_email') 
    return User(id=user_id, email=user_email)

# Registra Blueprints
app.register_blueprint(pages_bp) 
app.register_blueprint(turmas_bp, url_prefix='/api')
app.register_blueprint(alunos_bp, url_prefix='/api')
app.register_blueprint(frequencia_bp, url_prefix='/api')
app.register_blueprint(search_bp, url_prefix='/api')
app.register_blueprint(estatisticas_bp, url_prefix='/api')
app.register_blueprint(exportar_bp, url_prefix='/api')
app.register_blueprint(diario_bp, url_prefix='/api')
app.register_blueprint(dashboard_bp, url_prefix='/api')
app.register_blueprint(disciplinas_bp, url_prefix='/api')
app.register_blueprint(compartilhamentos_bp, url_prefix='/api')
app.register_blueprint(auth_bp) 
app.register_blueprint(perfil_bp)
app.register_blueprint(notas_bp, url_prefix='/api') 

if __name__ == "__main__":
    # O Discloud fornece a porta correta através das variáveis de ambiente
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)