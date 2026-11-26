// Edge Function: optimizar-ruta
// Recibe  { puntos: [{id, lat, lng}], inicio?: {lat, lng} }
// Devuelve { orden: [id, id, ...], metodo: 'openrouteservice' | 'local', aviso?: string }
//
// 1) Intenta con OpenRouteService (secreto ORS_API_KEY).
// 2) Si falla, no hay clave o supera el límite diario, ordena por cercanía (plan B).
// Solo administradores. Desplegar con:  supabase functions deploy optimizar-ruta --no-verify-jwt
import { exigirAdmin } from '../_shared/auth.ts'
import { json, preflight } from '../_shared/cors.ts'
import { construirSolicitudORS, ordenDesdeORS } from '../_shared/ors.ts'
import { ordenarLocal, type Coordenada, type Punto } from '../_shared/ruta.ts'
import { leerBodega, validarEntradaOptimizar } from '../_shared/validacion.ts'

const ORS_URL = 'https://api.openrouteservice.org/optimization'

async function optimizarConORS(clave: string, puntos: Punto[], inicio: Coordenada | null): Promise<string[]> {
  const respuesta = await fetch(ORS_URL, {
    method: 'POST',
    headers: { Authorization: clave, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(construirSolicitudORS(puntos, inicio)),
    signal: AbortSignal.timeout(15_000),
  })
  if (!respuesta.ok) throw new Error(`OpenRouteService respondió HTTP ${respuesta.status}`)
  return ordenDesdeORS(await respuesta.json(), puntos)
}

Deno.serve(async (req) => {
  const previa = preflight(req)
  if (previa) return previa
  if (req.method !== 'POST') return json({ error: 'Usa el método POST' }, 405)

  const auth = await exigirAdmin(req)
  if (!auth.ok) return json({ error: auth.mensaje }, auth.status)

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return json({ error: 'El cuerpo debe ser JSON' }, 400)
  }

  const bodega = leerBodega(Deno.env.get('BODEGA_LAT'), Deno.env.get('BODEGA_LNG'))
  const entrada = validarEntradaOptimizar(cuerpo, bodega)
  if (!entrada.ok) return json({ error: entrada.error }, 400)
  const { puntos, inicio } = entrada

  if (puntos.length === 1) return json({ orden: [puntos[0].id], metodo: 'local' })

  let aviso: string
  const clave = Deno.env.get('ORS_API_KEY')
  if (clave) {
    try {
      const orden = await optimizarConORS(clave, puntos, inicio)
      return json({ orden, metodo: 'openrouteservice' })
    } catch (e) {
      console.error('OpenRouteService falló:', e instanceof Error ? e.message : String(e))
      aviso = 'OpenRouteService no estuvo disponible: se ordenó por cercanía.'
    }
  } else {
    aviso = 'Falta configurar ORS_API_KEY: se ordenó por cercanía.'
  }

  const ordenados = ordenarLocal(puntos, inicio)
  return json({ orden: ordenados.map((p) => p.id), metodo: 'local', aviso })
})
