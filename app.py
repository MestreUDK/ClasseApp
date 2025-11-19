# app.py

import os
from flask import Flask
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
from routes.perfil import perfil_bp # <-- NOVO IMPORT
from models import User 

app = Flask(__name__)

# CONFIGURAÇÃO DE SEGURANÇA
app.secret_key = os.environ.get("SECRET_KEY", "minha_chave_secreta_super_segura")

# Configura o Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'auth_bp.login' 

@login_manager.user_loader
def load_user(user_id):
    return User(id=user_id, email=None)

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
app.register_blueprint(auth_bp) 
app.register_blueprint(perfil_bp) # <-- NOVO REGISTRO (sem prefixo api)

if __name__ == "__main__":
    app.run()