# routes/diario.py

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user # <-- IMPORTAR
from utils import supabase 

diario_bp = Blueprint('diario_bp', __name__)

# --- GET: Listar SUAS Notas ---
@diario_bp.route('/diario', methods=['GET'])
@login_required
def get_notas():
    try:
        # Busca APENAS as suas notas
        data, count = supabase.table('diario') \
            .select('*, turmas(nome), alunos(nome_completo)') \
            .eq('user_id', current_user.id) \
            .order('created_at', desc=True) \
            .execute()

        return jsonify(data[1])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- POST: Criar Nota ---
@diario_bp.route('/diario', methods=['POST'])
@login_required
def create_nota():
    try:
        dados = request.get_json()
        if not dados or 'titulo' not in dados:
            return jsonify({"error": "O título é obrigatório."}), 400

        turma_id = dados.get('turma_id') or None
        aluno_id = dados.get('aluno_id') or None

        # ==========================================
        # --- NOVO: DATA DE REFERÊNCIA INSERIDA ---
        # ==========================================
        # Salva vinculando ao seu usuário
        data, count = supabase.table('diario').insert({
            'titulo': dados.get('titulo'),
            'conteudo': dados.get('conteudo'),
            'turma_id': turma_id,
            'aluno_id': aluno_id,
            'data_referencia': dados.get('data_referencia'), # <-- ADICIONADO
            'user_id': current_user.id # <-- VÍNCULO DE PROPRIEDADE
        }).execute()

        return jsonify(data[1][0]), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- DELETE: Excluir Nota SUA ---
@diario_bp.route('/diario/<uuid:nota_id>', methods=['DELETE'])
@login_required
def delete_nota(nota_id):
    try:
        # Só deleta se for sua
        data, count = supabase.table('diario')\
            .delete()\
            .eq('id', nota_id)\
            .eq('user_id', current_user.id)\
            .execute()

        if count and count[1] == 0:
             return jsonify({"error": "Nota não encontrada ou acesso negado."}), 404

        return jsonify({"message": "Nota excluída."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@diario_bp.route('/diario/<uuid:nota_id>', methods=['PUT'])
@login_required
def atualizar_nota(nota_id):
    """Atualiza apenas anotações pertencentes ao usuário autenticado."""
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict):
        return jsonify({"error": "Dados inválidos."}), 400

    titulo = dados.get('titulo')
    if not isinstance(titulo, str) or not titulo.strip():
        return jsonify({"error": "O título é obrigatório."}), 400

    from datetime import date
    referencia = dados.get('data_referencia')
    try:
        date.fromisoformat(referencia)
    except (TypeError, ValueError):
        return jsonify({"error": "Data de ocorrência inválida."}), 400

    conteudo = dados.get('conteudo')
    if conteudo is not None and not isinstance(conteudo, str):
        return jsonify({"error": "Conteúdo inválido."}), 400

    turma_id = dados.get('turma_id') or None
    aluno_id = dados.get('aluno_id') or None
    try:
        # Confirma os vínculos para impedir referências a dados de outros usuários.
        if turma_id:
            turma = (supabase.table('turmas').select('id')
                     .eq('id', turma_id).eq('user_id', current_user.id)
                     .limit(1).execute())
            if not turma.data:
                return jsonify({"error": "Turma não encontrada."}), 400
        if aluno_id:
            aluno = (supabase.table('alunos').select('id')
                     .eq('id', aluno_id).eq('user_id', current_user.id)
                     .limit(1).execute())
            if not aluno.data:
                return jsonify({"error": "Aluno não encontrado."}), 400

        revisao = dados.get('revision')
        if not isinstance(revisao, int) or isinstance(revisao, bool) or revisao < 1:
            return jsonify({'error': 'Revisão obrigatória. Recarregue o diário.'}), 428

        resultado = (supabase.table('diario').update({
            'titulo': titulo.strip(),
            'conteudo': conteudo,
            'data_referencia': referencia,
            'turma_id': turma_id,
            'aluno_id': aluno_id,
        }).eq('id', str(nota_id)).eq('user_id', current_user.id)
            .eq('revision', revisao).execute())
        if not resultado.data:
            return jsonify({"error": "Conflito: anotação alterada ou removida. Recarregue o diário."}), 409
        return jsonify(resultado.data[0]), 200
    except Exception:
        return jsonify({"error": "Não foi possível atualizar a anotação."}), 500
