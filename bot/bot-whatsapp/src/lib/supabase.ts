
import "dotenv/config";

import {
  createClient,
  type SupabaseClient
} from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

export function obtenerSupabase(): SupabaseClient {
  if (cliente) {
    return cliente;
  }

  const url = process.env.SUPABASE_URL;
  const clave = process.env.SUPABASE_SECRET_KEY;

  if (!url || !clave) {
    throw new Error(
      "Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env"
    );
  }

  cliente = createClient(url, clave, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return cliente;
}
