# app.py

from flask import Flask

# Importa os blueprints de dentro da pasta 'routes'
from routes.pages import pages_bp
from routes.turmas import turmas_bp
from routes.alunos import alunos_bp
from routes.frequencia import frequencia_bp
from routes.search import search_bp
from routes.estatisticas import estatisticas_bp
from routes.exportar import exportar_bp
from routes.diario import diario_bp
from routes.dashboard import dashboard_bp

# Cria o aplicativo Flask
app = Flask(__name__)

# --- Registra os Blueprints (as lógicas separadas) ---

app.register_blueprint(pages_bp) 
app.register_blueprint(turmas_bp, url_prefix='/api')
app.register_blueprint(alunos_bp, url_prefix='/api')
app.register_blueprint(frequencia_bp, url_prefix='/api')
app.register_blueprint(search_bp, url_prefix='/api')
app.register_blueprint(estatisticas_bp, url_prefix='/api')
app.register_blueprint(exportar_bp, url_prefix='/api')
app.register_blueprint(diario_bp, url_prefix='/api')
app.register_blueprint(dashboard_bp, url_prefix='/api')

# --- Roda o Servidor ---
if __name__ == "__main__":
    app.run()