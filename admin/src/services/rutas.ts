import { supabase } from '../lib/supabase'
import type { Perfil, Ruta } from '../types'

export async function listarConductores(): Promise<Perfil[]> {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, rol, activo')
    .eq('rol', 'conductor')
    .eq('activo', true)
    .order('nombre', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Perfil[]
}

/**
 * Llama a la función SQL asignar_ruta (migración 005): crea la ruta y las paradas
 * en el orden recibido y pasa las órdenes a «asignada».
 * Parámetros: p_fecha, p_conductor, p_ordenes (uuid[] en orden de visita) y
 * p_agrupar: si es true, las órdenes del mismo teléfono y dirección forman una
 * sola parada con varias guías.
 */
export async function asignarRuta(
  fecha: string,
  conductorId: string,
  ordenIds: string[],
  agrupar = true,
): Promise<void> {
  const { error } = await supabase.rpc('asignar_ruta', {
    p_fecha: fecha,
    p_conductor: conductorId,
    p_ordenes: ordenIds,
    p_agrupar: agrupar,
  })
  if (error) throw new Error(error.message)
}

export async function listarRutasDelDia(fecha: string): Promise<Ruta[]> {
  const { data, error } = await supabase
    .from('rutas')
    .select(
      '*, perfiles(nombre), paradas(id, posicion_sugerida, posicion_final, estado, parada_ordenes(ordenes(numero_guia, cliente_nombre, direccion)))',
    )
    .eq('fecha', fecha)
    .order('creado_en', { ascending: true })
  if (error) throw new Error(error.message)
  const rutas = (data ?? []) as unknown as Ruta[]
  // La posición efectiva es posicion_final; si aún no existe, se usa la sugerida.
  const pos = (p: { posicion_final: number | null; posicion_sugerida: number | null }) =>
    p.posicion_final ?? p.posicion_sugerida ?? 0
  for (const r of rutas) r.paradas?.sort((a, b) => pos(a) - pos(b))
  return rutas
}
