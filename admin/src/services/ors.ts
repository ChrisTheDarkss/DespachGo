import type { Coordenadas } from '../types'

/**
 * OpenRouteService (https://openrouteservice.org). Las coordenadas de ORS van como
 * [longitud, latitud]; Leaflet usa [latitud, longitud]. La clave se lee de `key_rutas`
 * en el .env (ver vite.config.ts, que expone las variables con prefijo `key_`).
 */
const BASE = 'https://api.openrouteservice.org'
const PERFIL = 'driving-car'
/** Máximo de puntos por consulta de direcciones en el plan gratuito. */
export const MAX_PUNTOS_RUTA = 50

const clave = import.meta.env.key_rutas as string | undefined

export const orsDisponible = Boolean(clave)

function cabeceras(): HeadersInit {
  if (!clave) throw new Error('Falta key_rutas en el .env (clave de OpenRouteService).')
  return { Authorization: clave, 'Content-Type': 'application/json' }
}

async function leerError(resp: Response): Promise<string> {
  if (resp.status === 401 || resp.status === 403) return 'La clave de OpenRouteService no es válida.'
  if (resp.status === 429) return 'Se superó el límite de consultas de OpenRouteService. Espera un momento.'
  try {
    const j = (await resp.json()) as { error?: { message?: string } | string }
    const m = typeof j.error === 'string' ? j.error : j.error?.message
    if (m) return `OpenRouteService: ${m}`
  } catch {
    // sin cuerpo legible
  }
  return `OpenRouteService respondió con error ${resp.status}.`
}

export interface RutaCalculada {
  /** Línea siguiendo las calles, como [lat, lng] para Leaflet. */
  linea: [number, number][]
  /** La misma línea partida en tramos: el tramo i va de la parada i a la parada i+1. */
  tramos: [number, number][][]
  distanciaM: number
  duracionS: number
}

/** Ruta por calles que pasa por los puntos en el orden recibido. */
export async function calcularRuta(
  puntos: Coordenadas[],
  signal?: AbortSignal,
): Promise<RutaCalculada> {
  if (puntos.length < 2) throw new Error('Se necesitan al menos 2 puntos.')
  if (puntos.length > MAX_PUNTOS_RUTA) {
    throw new Error(`OpenRouteService admite hasta ${MAX_PUNTOS_RUTA} paradas por ruta.`)
  }
  const resp = await fetch(`${BASE}/v2/directions/${PERFIL}/geojson`, {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({
      coordinates: puntos.map((p) => [p.lng, p.lat]),
      instructions: false,
    }),
    signal,
  })
  if (!resp.ok) throw new Error(await leerError(resp))
  const data = (await resp.json()) as {
    features?: {
      geometry: { coordinates: [number, number][] }
      properties: { summary: { distance: number; duration: number }; way_points?: number[] }
    }[]
  }
  const f = data.features?.[0]
  if (!f) throw new Error('OpenRouteService no devolvió una ruta.')
  const linea = f.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])
  // way_points: índice de cada parada dentro de la línea; sirve para cortarla por tramos.
  const wp = f.properties.way_points
  const tramos: [number, number][][] = []
  if (wp && wp.length === puntos.length) {
    for (let i = 0; i < wp.length - 1; i++) tramos.push(linea.slice(wp[i], wp[i + 1] + 1))
  } else {
    tramos.push(linea)
  }
  return {
    linea,
    tramos,
    distanciaM: f.properties.summary.distance,
    duracionS: f.properties.summary.duration,
  }
}

export interface PuntoOptimizar {
  id: string
  lat: number
  lng: number
}

/**
 * Ordena las paradas con el endpoint /optimization (VROOM). La primera parada se toma
 * como punto de partida y las demás se reordenan; el plan gratuito admite 50 trabajos.
 */
export async function optimizarConOrs(puntos: PuntoOptimizar[]): Promise<string[]> {
  if (puntos.length < 3) throw new Error('Se necesitan al menos 3 puntos.')
  const [inicio, ...resto] = puntos
  const resp = await fetch(`${BASE}/optimization`, {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({
      vehicles: [{ id: 1, profile: PERFIL, start: [inicio.lng, inicio.lat] }],
      jobs: resto.map((p, i) => ({ id: i, location: [p.lng, p.lat] })),
    }),
  })
  if (!resp.ok) throw new Error(await leerError(resp))
  const data = (await resp.json()) as {
    routes?: { steps: { type: string; id?: number }[] }[]
    unassigned?: unknown[]
  }
  const pasos = data.routes?.[0]?.steps.filter((s) => s.type === 'job') ?? []
  if (pasos.length !== resto.length || (data.unassigned?.length ?? 0) > 0) {
    throw new Error('OpenRouteService no pudo ordenar todas las paradas.')
  }
  return [inicio.id, ...pasos.map((s) => resto[s.id as number].id)]
}
