<div align="center">

# 📚 ClasseApp

**Gestão de turmas, alunos, avaliações e frequência escolar em um só lugar.**

Aplicação web responsiva, com recursos offline e compartilhamento controlado, voltada à rotina de professores.

**Versão:** `2.2.28` · **Idioma:** Português (Brasil) · **Licença:** MIT

</div>

---

## ✨ Funcionalidades

| Área | Recursos |
| --- | --- |
| **Turmas e alunos** | Cadastro, edição, vínculo de alunos a turmas, disciplinas e busca. |
| **Frequência** | Chamada por data, histórico e estatísticas, incluindo marcação offline. |
| **Avaliações e notas** | Avaliações, lançamento de notas, recuperação e cálculo de rendimento. |
| **Diário de Bordo** | Registros de aula, edição e exclusão, com suporte a alterações locais. |
| **Relatórios** | Exportações de frequência, notas e mapa final de rendimento escolar. |
| **Compartilhamento** | Compartilhamento de turmas por código, permissões de visualização e cópia seletiva. |
| **Sincronização** | Central de comparação entre cópia local e nuvem, resolução de conflitos e envio de pendências. |
| **Histórico local** | Pacotes nomeados das alterações ainda não enviadas, com retenção configurável de 3 a 10 versões. |
| **Notificações** | Aniversários dos alunos (7 ou 30 dias) e status das frequências pendentes; indicador no sino do menu. |
| **Personalização** | Temas claro/escuro/automático, layouts Clássico/Estúdio e cores de destaque. |

Há ainda uma **demonstração pública com dados fictícios**, separada das contas reais.

## 🔔 Como funcionam os aniversários

1. No cadastro ou edição do aluno, preencha **Data de Nascimento**.
2. Abra **🔔 Notificações** para consultar os aniversários de hoje e dos próximos **7 ou 30 dias**.
3. Quando houver aniversários nos próximos 7 dias, o sino no menu mostra um **contador**.
4. É possível **dispensar** um aviso para o ano corrente neste dispositivo. O aviso volta a ser gerado no próximo ano.

Os aniversários são calculados segundo o fuso da escola (`APP_TIMEZONE`, por padrão `America/Fortaleza`). O caso de nascimento em **29/02** é considerado em **28/02** nos anos não bissextos. Cada usuário consulta apenas os alunos vinculados à própria conta. Alunos sem data cadastrada não geram avisos.

**Limite atual:** são **avisos dentro do ClasseApp**, consultados ao acessar o sistema; não são notificações push do Android nem mensagens enviadas fora do aplicativo. O contador é atualizado periodicamente e não exige manter a página de Notificações aberta.

## 🔐 Privacidade e uso offline

- O login e a autenticação utilizam **Supabase Auth**; dados escolares são acessados pelas APIs Flask.
- Cópias e pendências offline ficam **no navegador/dispositivo**, organizadas por conta e protegidas por criptografia AES-GCM com chave derivada da senha configurada para acesso offline.
- Para ativar o acesso local, utilize a **mesma senha de login**; a senha em texto puro não é salva. Quem usava uma senha local antiga precisa migrar o cofre uma vez.
- A sincronização com a nuvem é **separada** do histórico de pacotes: restaurar um pacote altera apenas o estado local pendente.
- Conflitos de revisão exigem análise; o aplicativo não deve sobrescrever silenciosamente alterações mais recentes.
- O Service Worker mantém recursos estáticos necessários ao modo offline, **não** armazena páginas autenticadas nem respostas privadas da API no cache.

> **Atenção:** não limpe os dados do site, não desinstale o navegador e não apague o armazenamento local enquanto houver alterações offline pendentes sem backup e sincronização. O acesso offline não substitui o login online.

## 🧰 Tecnologias

- **Backend:** Python, Flask, Flask-Login e Gunicorn.
- **Autenticação e banco:** Supabase Auth, PostgreSQL e SDK Python do Supabase.
- **Interface:** HTML, CSS e JavaScript sem framework, adaptada para celular.
- **Offline:** PWA, Service Worker, IndexedDB e Web Crypto API.
- **Relatórios:** OpenPyXL e renderização de relatórios na aplicação.

## 🚀 Execução local (desenvolvimento)

**Pré-requisitos:** Python 3 compatível com as dependências, pip e um projeto Supabase **já configurado com o esquema de tabelas e as políticas RLS utilizadas pelo ClasseApp**. Instalar as dependências não cria automaticamente esse esquema.

```bash
# Criar ambiente virtual
python -m venv .venv

# Ativar no Windows
.venv\Scripts\activate

# No Linux/macOS, use: source .venv/bin/activate
pip install -r requirements.txt
```

Crie um arquivo `.env` **somente no ambiente local** (não publique no GitHub):

```dotenv
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_KEY=SUA_CHAVE_PUBLICAVEL_OU_ANON
SECRET_KEY=SUA_CHAVE_ALEATORIA_ESTAVEL_DO_FLASK
APP_PUBLIC_URL=http://localhost:8080
# Opcional: APP_TIMEZONE=America/Fortaleza
```

Gere uma `SECRET_KEY` para o Flask com:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Inicie localmente:

```bash
python app.py
```

Abra `http://localhost:8080` (porta padrão do `app.py`). Para testar com servidor WSGI, execute:

```bash
gunicorn --bind 0.0.0.0:8080 --workers 1 --threads 4 --timeout 60 app:app
```

> No Windows, use o Flask para testes locais; o Gunicorn é indicado para hospedagem Linux. Nunca publique os segredos no código-fonte. Evite usar uma chave Supabase `service_role` para o fluxo normal de usuários; mantenha RLS ativada e testada no projeto Supabase.

## ☁️ Publicação na Discloud

O repositório possui `discloud.config`, contendo um comando `START` com **Gunicorn**, além de `AUTORESTART` e a memória atribuída à aplicação. A configuração atualmente prevista é de **1024 MB**; ajuste de acordo com os recursos disponíveis.

1. Conecte o repositório GitHub à aplicação na Discloud.
2. No painel da Discloud, configure as variáveis `SUPABASE_URL`, `SUPABASE_KEY`, `SECRET_KEY` e `APP_PUBLIC_URL` (URL pública HTTPS da aplicação).
3. Atualize os arquivos no GitHub e faça o rebuild/deploy.
4. Confirme o endpoint `/health`, efetue login e teste os módulos essenciais.
5. Monitore uso de **RAM/CPU**, respostas HTTP e logs da Discloud durante o uso.

O arquivo `.env`, chaves JKS e segredos do Android **não** devem ser enviados ao repositório. A `SECRET_KEY` do Flask **não** é a chave de assinatura do APK.

## 🧪 Testes

```bash
python -m pytest -q
```

Alguns testes de interface e lógica offline podem ser executados com Node.js, sem navegador, a partir da pasta do projeto:

```bash
node tests/test_pacotes_offline.js
node tests/test_tela_senha_offline.js
node tests/test_notificacoes.js
```

Os testes automatizados não substituem testes reais no dispositivo: valide login, frequências, dados offline, sincronização e permissões usando contas de teste antes de liberar uma versão.

## 📁 Estrutura resumida

```text
ClasseApp-main/
├── app.py                   # Aplicação Flask e registro de rotas
├── routes/                  # APIs e páginas (Auth, alunos, notas, etc.)
├── modules/                 # Regras de negócio, relatórios e aniversários
├── templates/               # Páginas HTML/Jinja2
├── static/
│   ├── js/                  # Interface, cofre offline e sincronização
│   ├── sw.js                # Service Worker
│   └── manifest.json        # Manifesto PWA
├── tests/                   # Testes automatizados
├── requirements.txt         # Dependências Python
├── discloud.config          # Hospedagem
└── README.md
```

## 🗺️ Próximas etapas

- Estabilização e acompanhamento de consumo de RAM em produção.
- Revisão das políticas **RLS** e testes de acesso entre contas.
- Melhorias contínuas na experiência móvel e na sincronização offline.
- Preparação do **APK Android** e assinatura por keystore JKS (etapa futura).

## 📄 Licença

Distribuído sob a licença **MIT**. Consulte [`LICENSE`](LICENSE). Autor original: **MestreUDK**.
