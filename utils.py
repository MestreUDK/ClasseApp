# utils.py
import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Carrega o .env
load_dotenv()

# Carrega as chaves do meu arquivo .env
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Cria o cliente Supabase e o exporta para outros arquivos usarem
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
