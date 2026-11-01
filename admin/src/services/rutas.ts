import { supabase } from '../lib/supabase'
import type { Perfil, Ruta } from '../types'

export async function listarConductores(): Promise<Perfil[]> {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, rol')
    .eq('rol', 'conductor')
    .order('nombre', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Perfil[]
}

/**
 * Llama a la función SQL asignar_ruta (tarea 1-10): crea la ruta y las paradas
 * en el orden recibido y pasa las órdenes a «asignada».
 * Parámetros esperados: p_fecha, p_conductor_id, p_orden_ids (uuid[] en orden de visita).
 */
export async function asignarRuta(
  fecha: string,
  conductorId: string,
  ordenIds: string[],
): Promise<void> {
  const { error } = await supabase.rpc('asignar_ruta', {
    p_fecha: fecha,
    p_conductor_id: conductorId,
    p_orden_ids: ordenIds,
  })
  if (error) throw new Error(error.message)
}

export async function listarRutasDelDia(fecha: string): Promise<Ruta[]> {
  const { data, error } = await supabase
    .from('rutas')
    .select(
      '*, perfiles(nombre), paradas(id, posicion, estado, parada_ordenes(ordenes(numero_guia, cliente_nombre, direccion)))',
    )
    .eq('fecha', fecha)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  const rutas = (data ?? []) as unknown as Ruta[]
  for (const r of rutas) r.paradas?.sort((a, b) => a.posicion - b.posicion)
  return rutas
}
