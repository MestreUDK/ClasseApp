# app.py

import os
import secrets
import warnings
from datetime import datetime
from urllib.parse import urlparse
from flask import Flask, flash, jsonify, redirect, request, session, url_for
from flask_login import LoginManager, current_user, logout_user

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
from utils import ErroSessaoSupabase, cliente_supabase_requisicao

app = Flask(__name__)

# ==========================================
# --- NOVO: CONFIGURAÇÃO DE VERSÃO ---
# ==========================================
app.config['VERSION'] = '2.2.26'

# Context Processor para injetar a variável em todos os templates HTML
@app.context_processor
def inject_version():
    return dict(app_version=app.config['VERSION'], current_year=datetime.now().year)

# Segurança da sessão: não usar chave conhecida/publicada no repositório.
# Em produção, configure SECRET_KEY com valor aleatório e estável na hospedagem.
segredo_sessao = os.environ.get('SECRET_KEY', '').strip()
if not segredo_sessao or segredo_sessao == 'minha_chave_secreta_super_segura':
    warnings.warn(
        'SECRET_KEY ausente ou insegura: usando chave temporária aleatória. '
        'Configure SECRET_KEY na hospedagem; caso contrário, logins serão '
        'invalidados sempre que o processo reiniciar.',
        RuntimeWarning,
        stacklevel=1,
    )
    segredo_sessao = secrets.token_urlsafe(48)
app.secret_key = segredo_sessao

# Cookies da sessão protegidos por HTTPOnly e SameSite. Secure é ativado na
# hospedagem HTTPS definida por APP_PUBLIC_URL, preservando testes locais HTTP.
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=(
        urlparse(os.environ.get('APP_PUBLIC_URL', '')).scheme == 'https'
    ),
)

# Configura o Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'auth_bp.login' 
login_manager.login_message = 'Faça login para acessar esta página.'
login_manager.login_message_category = 'info'


@login_manager.unauthorized_handler
def nao_autorizado():
    """APIs devolvem 401 JSON, sem redirecionar uma sincronização para HTML.

    As páginas normais continuam enviando o visitante para a tela de login.
    """
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Sessão ausente ou expirada. Faça login novamente.'}), 401
    flash(login_manager.login_message, login_manager.login_message_category)
    return redirect(url_for(login_manager.login_view))


@app.after_request
def proteger_respostas(response):
    """Impede cache HTTP privado e reduz vazamento de dados pelo navegador.

    A página pública /offline e os recursos /static são excluídos da regra de
    no-store, pois precisam estar disponíveis no Service Worker sem internet.
    """
    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    response.headers.setdefault('Referrer-Policy', 'no-referrer')
    if request.path.startswith('/api/') or request.path in (
        '/login', '/register', '/logout', '/perfil',
        '/esqueci-senha', '/redefinir-senha',
    ) or (current_user.is_authenticated and request.path not in (
        '/offline', '/sw.js', '/demonstracao', '/health',
    ) and not request.path.startswith('/static/')):
        response.headers['Cache-Control'] = 'no-store'
    return response

@login_manager.user_loader
def load_user(user_id):
    # Cookies antigos sem credenciais Supabase devem efetuar novo login.
    if not session.get('supabase_access_token') or not session.get('supabase_refresh_token'):
        return None
    return User(id=user_id, email=session.get('user_email'))

# Restaurar Auth por requisição impede que contas diferentes compartilhem
# o estado mutável de uma única instância do SDK Supabase.
@app.before_request
def verificar_sessao_supabase():
    if not current_user.is_authenticated:
        return None

    # O logout e as páginas públicas não dependem da disponibilidade do Auth.
    if request.endpoint in {
        'auth_bp.login', 'auth_bp.register', 'auth_bp.forgot_password',
        'auth_bp.reset_password', 'auth_bp.logout',
        'pages_bp.page_offline', 'pages_bp.page_demonstracao',
        'pages_bp.serve_sw', 'pages_bp.health_check',
    } or request.path.startswith('/static/'):
        return None

    try:
        cliente_supabase_requisicao()
    except ErroSessaoSupabase as exc:
        if exc.invalida:
            logout_user()
            session.clear()
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Sessão expirada. Faça login novamente.'}), 401
            flash('Sua sessão expirou. Entre novamente.', 'warning')
            return redirect(url_for('auth_bp.login'))
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Autenticação temporariamente indisponível. Tente novamente.'}), 503
        return 'Autenticação temporariamente indisponível. Tente novamente.', 503
    return None


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