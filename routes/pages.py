# routes/pages.py

from flask import Blueprint, render_template, request, send_from_directory, jsonify # <-- ADICIONEI jsonify AQUI
import os

pages_bp = Blueprint('pages_bp', __name__)

@pages_bp.route('/')
def home():
    return render_template('index.html')

@pages_bp.route('/alunos')
def page_alunos():
    return render_template('alunos.html')

@pages_bp.route('/turma/<uuid:turma_id>')
def page_turma_detalhe(turma_id):
    return render_template('turma_detalhe.html', turma_id=turma_id)

@pages_bp.route('/turma/<uuid:turma_id>/frequencia')
def page_frequencia(turma_id):
    return render_template('frequencia.html')

@pages_bp.route('/aluno/editar/<uuid:aluno_id>')
def page_editar_aluno(aluno_id):
    return render_template('editar_aluno.html')

@pages_bp.route('/turma/editar/<uuid:turma_id>')
def page_editar_turma(turma_id):
    return render_template('editar_turma.html')

@pages_bp.route('/search')
def page_search_results():
    query = request.args.get('q', '')
    return render_template('search.html', query=query)

@pages_bp.route('/offline')
def page_offline():
    return render_template('offline.html')

@pages_bp.route('/sw.js')
def serve_sw():
    static_dir = os.path.join(pages_bp.root_path, '..', 'static')
    return send_from_directory(static_dir, 'sw.js')

# --- ESTATÍSTICA ---
@pages_bp.route('/turma/<uuid:turma_id>/estatisticas')
def page_estatisticas(turma_id):
    return render_template('estatisticas.html')

# --- DIÁRIO ---
@pages_bp.route('/diario')
def page_diario():
    return render_template('diario.html')

# --- RELATORIOS ---
@pages_bp.route('/relatorios')
def page_relatorios():
    return render_template('relatorios.html')

# --- HEALTH CHECK (PARA CRON-JOB) ---
@pages_bp.route('/health')
def health_check():
    """ 
    Rota leve para manter o site acordado.
    Retorna JSON 200 OK.
    """
    return jsonify({"status": "online", "message": "ClasseApp is running"}), 200