import { supabase } from '../lib/supabase'
import type { Coordenadas } from '../types'

// Caja aproximada de Temuco: izquierda, arriba, derecha, abajo (lon/lat).
const VIEWBOX_TEMUCO = '-72.70,-38.68,-72.48,-38.80'

/**
 * Convierte una dirección de Temuco en coordenadas.
 * 1) Intenta la Edge Function `geocodificar` (tarea 5-11).
 * 2) Si no existe o falla, consulta Nominatim directamente (solo para desarrollo/respaldo).
 * Devuelve null si no encuentra nada: el admin debe ubicar el pin a mano.
 */
export async function geocodificar(direccion: string): Promise<Coordenadas | null> {
  try {
    const { data, error } = await supabase.functions.invoke('geocodificar', {
      body: { direccion },
    })
    if (!error && data && typeof data.lat === 'number' && typeof data.lng === 'number') {
      return { lat: data.lat, lng: data.lng }
    }
  } catch {
    // seguimos con el respaldo
  }

  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      q: `${direccion}, Temuco, Chile`,
      viewbox: VIEWBOX_TEMUCO,
      bounded: '1',
      countrycodes: 'cl',
      limit: '1',
    })
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
    if (!resp.ok) return null
    const filas = (await resp.json()) as { lat: string; lon: string }[]
    if (filas.length === 0) return null
    return { lat: parseFloat(filas[0].lat), lng: parseFloat(filas[0].lon) }
  } catch {
    return null
  }
}
