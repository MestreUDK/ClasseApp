# routes/diario.py

from flask import Blueprint, jsonify, request
from datetime import date
from uuid import UUID
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

def _vinculos_validos(turma_id, aluno_id):
    """Confirma que os vínculos pertencem à conta autenticada."""
    for tabela, item_id in (("turmas", turma_id), ("alunos", aluno_id)):
        if not item_id:
            continue
        try:
            UUID(str(item_id))
        except (ValueError, TypeError, AttributeError):
            return False
        resultado = (supabase.table(tabela).select('id')
                     .eq('id', str(item_id)).eq('user_id', current_user.id)
                     .limit(1).execute())
        if not resultado.data:
            return False
    return True


def _dados_diario(dados):
    """Normaliza entrada do diário; rejeita campos inválidos e vínculos alheios."""
    titulo = dados.get('titulo')
    if not isinstance(titulo, str) or not titulo.strip():
        raise ValueError('O título é obrigatório.')
    conteudo = dados.get('conteudo')
    if conteudo is not None and not isinstance(conteudo, str):
        raise ValueError('Conteúdo inválido.')
    referencia = dados.get('data_referencia')
    if referencia is not None:
        try:
            date.fromisoformat(referencia)
        except (ValueError, TypeError):
            raise ValueError('Data de ocorrência inválida.') from None
    turma_id = dados.get('turma_id') or None
    aluno_id = dados.get('aluno_id') or None
    if not _vinculos_validos(turma_id, aluno_id):
        raise ValueError('Turma ou aluno não pertence à sua conta.')
    return {
        'titulo': titulo.strip(), 'conteudo': conteudo,
        'data_referencia': referencia, 'turma_id': turma_id,
        'aluno_id': aluno_id,
    }


@diario_bp.route('/diario', methods=['POST'])
@login_required
def create_nota():
    """Cria anotação; client_id permite reenvio offline sem duplicações."""
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict):
        return jsonify({'error': 'Dados inválidos.'}), 400
    try:
        registro = _dados_diario(dados)
        client_id = dados.get('client_id')
        if client_id is not None:
            try:
                client_id = str(UUID(str(client_id)))
            except (TypeError, ValueError, AttributeError):
                return jsonify({'error': 'Identificador local inválido.'}), 400
            # Um reenvio com o mesmo ID e os mesmos dados é idempotente.
            encontrados = (supabase.table('diario').select('*')
                          .eq('id', client_id).eq('user_id', current_user.id)
                          .limit(1).execute()).data or []
            if encontrados:
                existente = encontrados[0]
                if all(existente.get(k) == v for k, v in registro.items()):
                    return jsonify(existente), 200
                return jsonify({'error': 'Conflito: anotação já existe com outros dados.'}), 409
            registro['id'] = client_id
        criados = (supabase.table('diario').insert({
            **registro, 'user_id': current_user.id
        }).execute()).data or []
        if not criados:
            return jsonify({'error': 'Não foi possível criar anotação.'}), 500
        return jsonify(criados[0]), 201
    except ValueError as erro:
        return jsonify({'error': str(erro)}), 400
    except Exception as erro:
        if '23505' in str(erro) or 'duplicate key' in str(erro).lower():
            # Outro envio pode ter criado o mesmo UUID. Preserve a fila para
            # revisão; não confirmar cegamente uma gravação desconhecida.
            return jsonify({'error': 'Conflito: identificador já cadastrado.'}), 409
        return jsonify({'error': 'Não foi possível criar anotação.'}), 500


@diario_bp.route('/diario/<uuid:nota_id>', methods=['DELETE'])
@login_required
def delete_nota(nota_id):
    """Exclui a anotação somente se a revisão esperada ainda for atual."""
    dados = request.get_json(silent=True) or {}
    revisao = dados.get('revision')
    if not isinstance(revisao, int) or isinstance(revisao, bool) or revisao < 1:
        return jsonify({'error': 'Revisão obrigatória. Atualize a anotação.'}), 428
    try:
        resultado = (supabase.table('diario').delete()
                     .eq('id', str(nota_id)).eq('user_id', current_user.id)
                     .eq('revision', revisao).execute())
        if not resultado.data:
            return jsonify({'error': 'Conflito: anotação alterada ou já removida.'}), 409
        return jsonify({'message': 'Anotação excluída.'}), 200
    except Exception:
        return jsonify({'error': 'Não foi possível excluir a anotação.'}), 500


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
