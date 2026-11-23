// Solicitud y lectura de respuesta de OpenRouteService (API /optimization, basada
// en VROOM). Código puro (se prueba con Node).
import type { Coordenada, Punto } from './ruta.ts'

/**
 * Un vehículo que parte de la bodega (o, si no hay bodega, del primer punto) y
 * visita todas las paradas. Las coordenadas van como [longitud, latitud].
 */
export function construirSolicitudORS(puntos: Punto[], inicio: Coordenada | null) {
  const arranque = inicio ?? puntos[0]
  return {
    jobs: puntos.map((p, i) => ({ id: i + 1, location: [p.lng, p.lat] })),
    vehicles: [{ id: 1, profile: 'driving-car', start: [arranque.lng, arranque.lat] }],
  }
}

/** Devuelve los ids de los puntos en el orden de visita. Lanza un error si la ruta no está completa. */
export function ordenDesdeORS(respuesta: unknown, puntos: Punto[]): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = respuesta as any
  if (!Array.isArray(r?.routes) || r.routes.length === 0) {
    throw new Error('OpenRouteService no devolvió ninguna ruta')
  }
  if (Array.isArray(r.unassigned) && r.unassigned.length > 0) {
    throw new Error('OpenRouteService no pudo asignar todos los puntos')
  }
  const pasos = r.routes[0]?.steps
  if (!Array.isArray(pasos)) throw new Error('La respuesta de OpenRouteService no trae pasos')

  const indices: number[] = pasos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((s: any) => s?.type === 'job')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => Number(s.id))

  const completo =
    indices.length === puntos.length &&
    new Set(indices).size === puntos.length &&
    indices.every((i) => Number.isInteger(i) && i >= 1 && i <= puntos.length)
  if (!completo) throw new Error('La ruta de OpenRouteService quedó incompleta')

  return indices.map((i) => puntos[i - 1].id)
}
