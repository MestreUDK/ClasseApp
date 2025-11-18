# utils.py
import os
from supabase import create_client, Client

# Pega as chaves do Supabase das Variáveis de Ambiente
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# Cria o cliente Supabase e o exporta para outros arquivos usarem
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)