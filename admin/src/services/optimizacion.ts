import { supabase } from '../lib/supabase'
import { optimizarConOrs, orsDisponible } from './ors'

export interface PuntoRuta {
  id: string
  lat: number
  lng: number
}

/**
 * Pide a la Edge Function `optimizar-ruta` (tareas 5-12 / 5-17) el orden sugerido.
 * Espera: { puntos: [{id, lat, lng}] } y responde { orden: [id, id, ...] }.
 */
export async function optimizarOrden(puntos: PuntoRuta[]): Promise<string[]> {
  // Con clave de OpenRouteService en el .env se optimiza directo; si no, Edge Function.
  if (orsDisponible) return optimizarConOrs(puntos)
  const { data, error } = await supabase.functions.invoke('optimizar-ruta', {
    body: { puntos },
  })
  if (error) throw new Error('No se pudo optimizar la ruta. Ordena las paradas a mano.')
  const orden = (data as { orden?: string[] } | null)?.orden
  if (!Array.isArray(orden) || orden.length !== puntos.length) {
    throw new Error('La optimización devolvió una respuesta inválida. Ordena las paradas a mano.')
  }
  return orden
}
