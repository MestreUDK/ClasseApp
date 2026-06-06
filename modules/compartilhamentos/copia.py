# modules/compartilhamentos/copia.py

from utils import supabase


def buscar_copia_existente(compartilhamento_id, user_id):
    copia_existente_res, _ = supabase.table("compartilhamento_copias") \
        .select("nova_turma_id") \
        .eq("compartilhamento_id", compartilhamento_id) \
        .eq("copiado_por", user_id) \
        .limit(1) \
        .execute()

    copia_existente = copia_existente_res[1] or []

    if copia_existente:
        return copia_existente[0]["nova_turma_id"]

    return None


def copiar_turma_base(turma_original, user_id):
    nova_turma_res, _ = supabase.table("turmas").insert({
        "nome": f"{turma_original.get('nome')} (cópia)",
        "descricao": turma_original.get("descricao"),
        "disciplina_id": None,
        "user_id": user_id
    }).execute()

    return nova_turma_res[1][0]


def copiar_alunos(turma_original_id, nova_turma_id, user_id):
    mapa_alunos = {}

    alunos_res, _ = supabase.table("turmas_alunos") \
        .select("alunos(*)") \
        .eq("turma_id", turma_original_id) \
        .execute()

    for item in alunos_res[1] or []:
        aluno = item.get("alunos")

        if not aluno:
            continue

        novo_aluno_res, _ = supabase.table("alunos").insert({
            "nome_completo": aluno.get("nome_completo"),
            "matricula": None,
            "telefone": aluno.get("telefone"),
            "email": aluno.get("email"),
            "data_nascimento": aluno.get("data_nascimento"),
            "detalhes": aluno.get("detalhes"),
            "user_id": user_id
        }).execute()

        novo_aluno = novo_aluno_res[1][0]
        mapa_alunos[aluno["id"]] = novo_aluno["id"]

        supabase.table("turmas_alunos").insert({
            "turma_id": nova_turma_id,
            "aluno_id": novo_aluno["id"]
        }).execute()

    return mapa_alunos


def copiar_frequencia(turma_original_id, nova_turma_id, mapa_alunos):
    if not mapa_alunos:
        return

    freq_res, _ = supabase.table("frequencia") \
        .select("*") \
        .eq("turma_id", turma_original_id) \
        .execute()

    for freq in freq_res[1] or []:
        aluno_antigo_id = freq.get("aluno_id")
        novo_aluno_id = mapa_alunos.get(aluno_antigo_id)

        if not novo_aluno_id:
            continue

        supabase.table("frequencia").upsert({
            "turma_id": nova_turma_id,
            "aluno_id": novo_aluno_id,
            "data": freq.get("data"),
            "presente": freq.get("presente")
        }, on_conflict="data, aluno_id, turma_id").execute()


def copiar_notas(turma_original_id, nova_turma_id, mapa_alunos, user_id):
    if not mapa_alunos:
        return

    avaliacoes_res, _ = supabase.table("avaliacoes") \
        .select("*") \
        .eq("turma_id", turma_original_id) \
        .execute()

    mapa_avaliacoes = {}

    for av in avaliacoes_res[1] or []:
        nova_av_res, _ = supabase.table("avaliacoes").insert({
            "nome": av.get("nome"),
            "data": av.get("data"),
            "nota_maxima": av.get("nota_maxima"),
            "periodo_tipo": av.get("periodo_tipo"),
            "periodo_numero": av.get("periodo_numero"),
            "categoria": av.get("categoria"),
            "peso": av.get("peso"),
            "turma_id": nova_turma_id,
            "user_id": user_id
        }).execute()

        nova_av = nova_av_res[1][0]
        mapa_avaliacoes[av["id"]] = nova_av["id"]

    if not mapa_avaliacoes:
        return

    notas_res, _ = supabase.table("notas") \
        .select("*") \
        .in_("avaliacao_id", list(mapa_avaliacoes.keys())) \
        .execute()

    for nota in notas_res[1] or []:
        novo_aluno_id = mapa_alunos.get(nota.get("aluno_id"))
        nova_avaliacao_id = mapa_avaliacoes.get(nota.get("avaliacao_id"))

        if not novo_aluno_id or not nova_avaliacao_id:
            continue

        supabase.table("notas").upsert({
            "avaliacao_id": nova_avaliacao_id,
            "aluno_id": novo_aluno_id,
            "valor": nota.get("valor"),
            "user_id": user_id
        }, on_conflict="avaliacao_id, aluno_id").execute()


def copiar_diario(turma_original_id, nova_turma_id, mapa_alunos, user_id):
    diario_res, _ = supabase.table("diario") \
        .select("*") \
        .eq("turma_id", turma_original_id) \
        .execute()

    for nota in diario_res[1] or []:
        aluno_antigo_id = nota.get("aluno_id")
        novo_aluno_id = mapa_alunos.get(aluno_antigo_id) if aluno_antigo_id else None

        supabase.table("diario").insert({
            "titulo": nota.get("titulo"),
            "conteudo": nota.get("conteudo"),
            "data_referencia": nota.get("data_referencia"),
            "turma_id": nova_turma_id,
            "aluno_id": novo_aluno_id,
            "user_id": user_id
        }).execute()


def registrar_historico_copia(
    compartilhamento,
    turma_original_id,
    nova_turma_id,
    user_id
):
    supabase.table("compartilhamento_copias").insert({
        "compartilhamento_id": compartilhamento["id"],
        "dono_id": compartilhamento["dono_id"],
        "copiado_por": user_id,
        "turma_original_id": turma_original_id,
        "nova_turma_id": nova_turma_id
    }).execute()


def copiar_compartilhamento_turma(compartilhamento, user_id):
    turma_original_id = compartilhamento["recurso_id"]

    turma_res, _ = supabase.table("turmas") \
        .select("*") \
        .eq("id", turma_original_id) \
        .single() \
        .execute()

    turma_original = turma_res[1]

    if not turma_original:
        return None

    nova_turma = copiar_turma_base(turma_original, user_id)
    nova_turma_id = nova_turma["id"]

    mapa_alunos = {}

    if compartilhamento.get("compartilhar_alunos"):
        mapa_alunos = copiar_alunos(
            turma_original_id,
            nova_turma_id,
            user_id
        )

    if compartilhamento.get("compartilhar_frequencia"):
        copiar_frequencia(
            turma_original_id,
            nova_turma_id,
            mapa_alunos
        )

    if compartilhamento.get("compartilhar_notas"):
        copiar_notas(
            turma_original_id,
            nova_turma_id,
            mapa_alunos,
            user_id
        )

    if compartilhamento.get("compartilhar_diario"):
        copiar_diario(
            turma_original_id,
            nova_turma_id,
            mapa_alunos,
            user_id
        )

    registrar_historico_copia(
        compartilhamento,
        turma_original_id,
        nova_turma_id,
        user_id
    )

    return nova_turma