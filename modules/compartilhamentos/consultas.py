# modules/compartilhamentos/consultas.py

from utils import supabase


def buscar_alunos_compartilhados(turma_id):
    alunos_res, _ = supabase.table("turmas_alunos") \
        .select("alunos(*)") \
        .eq("turma_id", turma_id) \
        .execute()

    alunos = []

    for item in alunos_res[1] or []:
        aluno = item.get("alunos")
        if aluno:
            alunos.append(aluno)

    alunos.sort(key=lambda a: a.get("nome_completo") or "")
    return alunos


def buscar_frequencia_resumo_compartilhada(turma_id):
    alunos = buscar_alunos_compartilhados(turma_id)

    freq_res, _ = supabase.table("frequencia") \
        .select("aluno_id, presente, data") \
        .eq("turma_id", turma_id) \
        .execute()

    mapa = {}

    for freq in freq_res[1] or []:
        aluno_id = freq.get("aluno_id")

        if aluno_id not in mapa:
            mapa[aluno_id] = {
                "presencas": 0,
                "faltas": 0,
                "total": 0
            }

        mapa[aluno_id]["total"] += 1

        if freq.get("presente") is True:
            mapa[aluno_id]["presencas"] += 1
        else:
            mapa[aluno_id]["faltas"] += 1

    resultado = []

    for aluno in alunos:
        aluno_id = aluno["id"]

        dados = mapa.get(aluno_id, {
            "presencas": 0,
            "faltas": 0,
            "total": 0
        })

        total = dados["total"]

        porcentagem = round(
            (dados["presencas"] / total) * 100,
            1
        ) if total > 0 else 0

        resultado.append({
            "aluno_id": aluno_id,
            "nome_completo": aluno.get("nome_completo"),
            "presencas": dados["presencas"],
            "faltas": dados["faltas"],
            "total": total,
            "porcentagem": porcentagem
        })

    return resultado


def nome_periodo_compartilhado(periodo_tipo, periodo_numero):
    mapa = {
        "avaliacao": "Avaliação",
        "bimestre": "Bimestre",
        "trimestre": "Trimestre",
        "semestre": "Semestre"
    }

    return f"{periodo_numero}ª {mapa.get(periodo_tipo, 'Avaliação')}"


def buscar_notas_resumo_compartilhadas(turma_id):
    alunos = buscar_alunos_compartilhados(turma_id)

    av_res, _ = supabase.table("avaliacoes") \
        .select("id, nome, nota_maxima, periodo_tipo, periodo_numero, categoria, peso") \
        .eq("turma_id", turma_id) \
        .execute()

    avaliacoes = av_res[1] or []

    if not avaliacoes:
        return []

    av_ids = [av["id"] for av in avaliacoes]

    notas_res, _ = supabase.table("notas") \
        .select("aluno_id, avaliacao_id, valor") \
        .in_("avaliacao_id", av_ids) \
        .execute()

    notas_map = {}

    for nota in notas_res[1] or []:
        aluno_id = nota.get("aluno_id")
        avaliacao_id = nota.get("avaliacao_id")

        if aluno_id not in notas_map:
            notas_map[aluno_id] = {}

        notas_map[aluno_id][avaliacao_id] = nota.get("valor")

    grupos = {}

    for av in avaliacoes:
        periodo_tipo = av.get("periodo_tipo") or "avaliacao"
        periodo_numero = av.get("periodo_numero") or 1
        chave = f"{periodo_tipo}_{periodo_numero}"

        if chave not in grupos:
            grupos[chave] = {
                "nome_periodo": nome_periodo_compartilhado(
                    periodo_tipo,
                    periodo_numero
                ),
                "avaliacoes": [],
                "alunos": []
            }

        grupos[chave]["avaliacoes"].append(av)

    for grupo in grupos.values():
        for aluno in alunos:
            soma_pesos = 0
            soma_ponderada = 0
            total_lancadas = 0

            for av in grupo["avaliacoes"]:
                nota = notas_map.get(aluno["id"], {}).get(av["id"])

                if nota is None:
                    continue

                nota_maxima = float(av.get("nota_maxima") or 10)
                peso = float(av.get("peso") or 1)

                if nota_maxima <= 0:
                    continue

                nota_normalizada = (float(nota) / nota_maxima) * 10

                soma_ponderada += nota_normalizada * peso
                soma_pesos += peso
                total_lancadas += 1

            media = round(
                soma_ponderada / soma_pesos,
                2
            ) if soma_pesos > 0 else None

            grupo["alunos"].append({
                "nome_completo": aluno.get("nome_completo"),
                "media": media,
                "total_lancadas": total_lancadas,
                "total_avaliacoes": len(grupo["avaliacoes"])
            })

    return list(grupos.values())


def buscar_diario_compartilhado(turma_id):
    res, _ = supabase.table("diario") \
        .select("titulo, conteudo, data_referencia, alunos(nome_completo)") \
        .eq("turma_id", turma_id) \
        .order("data_referencia", desc=False) \
        .execute()

    return res[1] or []