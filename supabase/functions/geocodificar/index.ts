// Edge Function: geocodificar
// Recibe  { direccion: "Av. Alemania 0671" }
// Devuelve { lat, lng, nombre }  (404 si no encuentra la dirección)
//
// Usa Nominatim (OpenStreetMap) limitado a Temuco y Padre Las Casas. Cumple su
// política de uso: máximo 1 consulta por segundo, User-Agent que identifica la
// aplicación (secreto NOMINATIM_CONTACTO = correo de contacto) y caché de resultados.
// Solo administradores. Desplegar con:  supabase functions deploy geocodificar --no-verify-jwt
import { exigirAdmin } from '../_shared/auth.ts'
import { json, preflight } from '../_shared/cors.ts'

// Caja aproximada de Temuco y Padre Las Casas: izquierda, arriba, derecha, abajo
const VIEWBOX = '-72.70,-38.68,-72.48,-38.80'
const CONTACTO = Deno.env.get('NOMINATIM_CONTACTO') ?? ''
const ESPERA_MIN_MS = 1100

interface Resultado {
  lat: number
  lng: number
  nombre: string | null
}

const cache = new Map<string, Resultado>()
let ultimaConsulta = 0

async function respetarLimite(): Promise<void> {
  const espera = ultimaConsulta + ESPERA_MIN_MS - Date.now()
  if (espera > 0) await new Promise((r) => setTimeout(r, espera))
  ultimaConsulta = Date.now()
}

Deno.serve(async (req) => {
  const previa = preflight(req)
  if (previa) return previa
  if (req.method !== 'POST') return json({ error: 'Usa el método POST' }, 405)

  const auth = await exigirAdmin(req)
  if (!auth.ok) return json({ error: auth.mensaje }, auth.status)

  let direccion = ''
  try {
    const cuerpo = await req.json()
    direccion = String(cuerpo?.direccion ?? '').trim()
  } catch {
    return json({ error: 'El cuerpo debe ser JSON' }, 400)
  }
  if (direccion.length < 5 || direccion.length > 200) {
    return json({ error: 'Escribe una dirección válida (entre 5 y 200 caracteres)' }, 400)
  }

  const clave = direccion.toLowerCase().replace(/\s+/g, ' ')
  const guardado = cache.get(clave)
  if (guardado) return json(guardado)

  const params = new URLSearchParams({
    format: 'jsonv2',
    q: `${direccion}, Temuco, Chile`,
    viewbox: VIEWBOX,
    bounded: '1',
    countrycodes: 'cl',
    limit: '1',
  })

  await respetarLimite()
  let respuesta: Response
  try {
    respuesta = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        'User-Agent': `DespachGo/1.0${CONTACTO ? ` (${CONTACTO})` : ''}`,
        'Accept-Language': 'es',
      },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return json({ error: 'El servicio de direcciones no respondió' }, 502)
  }
  if (!respuesta.ok) return json({ error: 'El servicio de direcciones no respondió' }, 502)

  const filas = await respuesta.json()
  if (!Array.isArray(filas) || filas.length === 0) {
    return json({ error: 'No se encontró la dirección. Ubica el pin a mano en el mapa.' }, 404)
  }

  const lat = Number(filas[0].lat)
  const lng = Number(filas[0].lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ error: 'El servicio de direcciones devolvió una respuesta inválida' }, 502)
  }

  const resultado: Resultado = { lat, lng, nombre: filas[0].display_name ?? null }
  if (cache.size >= 200) cache.delete(cache.keys().next().value as string)
  cache.set(clave, resultado)
  return json(resultado)
})
