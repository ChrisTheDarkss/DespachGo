// Validación de la petición de optimizar-ruta. Código puro (se prueba con Node).
import type { Coordenada, Punto } from './ruta.ts'

export const MAX_PUNTOS = 100

export type EntradaOptimizar =
  | { ok: true; puntos: Punto[]; inicio: Coordenada | null }
  | { ok: false; error: string }

function enRango(x: unknown, min: number, max: number): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max
}

/** Lee la bodega desde los secretos BODEGA_LAT / BODEGA_LNG (texto). */
export function leerBodega(lat: string | undefined, lng: string | undefined): Coordenada | null {
  if (!lat || !lng) return null
  const la = Number(lat)
  const ln = Number(lng)
  return enRango(la, -90, 90) && enRango(ln, -180, 180) ? { lat: la, lng: ln } : null
}

/** Cuerpo esperado: { puntos: [{id, lat, lng}], inicio?: {lat, lng} } */
export function validarEntradaOptimizar(cuerpo: unknown, bodega: Coordenada | null = null): EntradaOptimizar {
  if (typeof cuerpo !== 'object' || cuerpo === null) {
    return { ok: false, error: 'El cuerpo debe ser un objeto JSON' }
  }
  const c = cuerpo as Record<string, unknown>
  if (!Array.isArray(c.puntos)) return { ok: false, error: 'Falta la lista "puntos"' }
  if (c.puntos.length < 1 || c.puntos.length > MAX_PUNTOS) {
    return { ok: false, error: `La lista "puntos" debe tener entre 1 y ${MAX_PUNTOS} elementos` }
  }

  const ids = new Set<string>()
  const puntos: Punto[] = []
  for (let i = 0; i < c.puntos.length; i++) {
    const p = c.puntos[i] as Record<string, unknown> | null
    if (!p || typeof p.id !== 'string' || p.id.length === 0) {
      return { ok: false, error: `El punto ${i + 1} no tiene id` }
    }
    if (ids.has(p.id)) return { ok: false, error: `El id "${p.id}" está repetido` }
    if (!enRango(p.lat, -90, 90) || !enRango(p.lng, -180, 180)) {
      return { ok: false, error: `El punto ${i + 1} tiene coordenadas inválidas` }
    }
    ids.add(p.id)
    puntos.push({ id: p.id, lat: p.lat, lng: p.lng })
  }

  let inicio: Coordenada | null = bodega
  if (c.inicio !== undefined && c.inicio !== null) {
    const s = c.inicio as Record<string, unknown>
    if (!enRango(s.lat, -90, 90) || !enRango(s.lng, -180, 180)) {
      return { ok: false, error: 'El punto de inicio tiene coordenadas inválidas' }
    }
    inicio = { lat: s.lat, lng: s.lng }
  }
  return { ok: true, puntos, inicio }
}
