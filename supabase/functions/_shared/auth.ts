// Solo un ADMINISTRADOR con sesión puede usar estas funciones.
//
// Se despliegan con --no-verify-jwt porque la verificación de la plataforma no
// distingue usuarios (una clave anon/publishable pública también pasa). Por eso la
// comprobación se hace aquí: se llama a la función SQL es_admin() con la sesión
// del usuario que hizo la petición.
import { createClient } from 'npm:@supabase/supabase-js@2'

export type ResultadoAuth = { ok: true } | { ok: false; status: number; mensaje: string }

export async function exigirAdmin(req: Request): Promise<ResultadoAuth> {
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, mensaje: 'Debes iniciar sesión' }
  }

  const url = Deno.env.get('SUPABASE_URL')
  // La clave pública viaja en la cabecera apikey que envía supabase-js
  const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!url || !apikey) {
    return { ok: false, status: 500, mensaje: 'La función no tiene configurada la conexión a Supabase' }
  }

  const db = createClient(url, apikey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })

  const { data, error } = await db.rpc('es_admin')
  if (error) return { ok: false, status: 401, mensaje: 'Sesión inválida o vencida' }
  if (data !== true) return { ok: false, status: 403, mensaje: 'Solo un administrador puede usar esta función' }
  return { ok: true }
}
