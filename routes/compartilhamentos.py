# routes/compartilhamentos.py

import random
import string

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from utils import supabase

compartilhamentos_bp = Blueprint(
    'compartilhamentos_bp',
    __name__
)


# =========================================
# HELPERS
# =========================================

def gerar_codigo_compartilhamento(tamanho=8):
    caracteres = string.ascii_uppercase + string.digits

    while True:
        codigo = ''.join(random.choice(caracteres) for _ in range(tamanho))

        res, _ = supabase.table('compartilhamentos') \
            .select('id') \
            .eq('codigo', codigo) \
            .execute()

        if not res[1]:
            return codigo


def verificar_dono_turma(turma_id):
    res, _ = supabase.table('turmas') \
        .select('id') \
        .eq('id', str(turma_id)) \
        .eq('user_id', current_user.id) \
        .execute()

    return len(res[1]) > 0


# =========================================
# CRIAR COMPARTILHAMENTO
# =========================================

@compartilhamentos_bp.route(
    '/compartilhamentos/turma/<uuid:turma_id>',
    methods=['POST']
)
@login_required
def criar_compartilhamento_turma(turma_id):
    try:
        if not verificar_dono_turma(turma_id):
            return jsonify({
                "error": "Acesso negado."
            }), 403

        dados = request.get_json() or {}

        codigo = gerar_codigo_compartilhamento()

        compartilhamento = {
            "codigo": codigo,
            "dono_id": current_user.id,

            "tipo": "turma",
            "recurso_id": str(turma_id),

            "permissao": dados.get("permissao", "visualizar"),

            "permite_copia": bool(
                dados.get("permite_copia", False)
            ),

            "compartilhar_alunos": bool(
                dados.get("compartilhar_alunos", True)
            ),

            "compartilhar_frequencia": bool(
                dados.get("compartilhar_frequencia", False)
            ),

            "compartilhar_notas": bool(
                dados.get("compartilhar_notas", False)
            ),

            "compartilhar_diario": bool(
                dados.get("compartilhar_diario", False)
            ),

            "ativo": True
        }

        res, _ = supabase.table('compartilhamentos') \
            .insert(compartilhamento) \
            .execute()

        return jsonify({
            "message": "Compartilhamento criado.",
            "codigo": codigo,
            "dados": res[1][0]
        }), 201

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


# =========================================
# LISTAR COMPARTILHAMENTOS
# =========================================

@compartilhamentos_bp.route(
    '/compartilhamentos',
    methods=['GET']
)
@login_required
def listar_compartilhamentos():
    try:
        res, _ = supabase.table('compartilhamentos') \
            .select('*') \
            .eq('dono_id', current_user.id) \
            .order('created_at', desc=True) \
            .execute()

        return jsonify(res[1] or [])

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


# =========================================
# DESATIVAR COMPARTILHAMENTO
# =========================================

@compartilhamentos_bp.route(
    '/compartilhamentos/<uuid:comp_id>/desativar',
    methods=['POST']
)
@login_required
def desativar_compartilhamento(comp_id):
    try:
        res, _ = supabase.table('compartilhamentos') \
            .update({
                "ativo": False
            }) \
            .eq('id', str(comp_id)) \
            .eq('dono_id', current_user.id) \
            .execute()

        if not res[1]:
            return jsonify({
                "error": "Compartilhamento não encontrado."
            }), 404

        return jsonify({
            "message": "Compartilhamento desativado."
        })

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


# =========================================
# VISUALIZAR COMPARTILHAMENTO
# =========================================

@compartilhamentos_bp.route(
    '/compartilhamentos/codigo/<codigo>',
    methods=['GET']
)
@login_required
def visualizar_compartilhamento(codigo):
    try:
        comp_res, _ = supabase.table('compartilhamentos') \
            .select('*') \
            .eq('codigo', codigo.upper()) \
            .eq('ativo', True) \
            .single() \
            .execute()

        compartilhamento = comp_res[1]

        if not compartilhamento:
            return jsonify({
                "error": "Código inválido."
            }), 404

        if compartilhamento['tipo'] != 'turma':
            return jsonify({
                "error": "Tipo de compartilhamento não suportado."
            }), 400

        turma_id = compartilhamento['recurso_id']

        turma_res, _ = supabase.table('turmas') \
            .select('*') \
            .eq('id', turma_id) \
            .single() \
            .execute()

        turma = turma_res[1]

        if not turma:
            return jsonify({
                "error": "Turma não encontrada."
            }), 404

        resposta = {
            "compartilhamento": compartilhamento,
            "turma": turma
        }

        # =================================
        # ALUNOS
        # =================================

        if compartilhamento.get('compartilhar_alunos'):
            alunos_res, _ = supabase.table('turmas_alunos') \
                .select('alunos(*)') \
                .eq('turma_id', turma_id) \
                .execute()

            alunos = []

            for item in alunos_res[1] or []:
                aluno = item.get('alunos')

                if aluno:
                    alunos.append(aluno)

            resposta["alunos"] = alunos

        return jsonify(resposta)

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500