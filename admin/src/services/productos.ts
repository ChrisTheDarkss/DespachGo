import { supabase } from '../lib/supabase'
import type { Producto } from '../types'

export async function listarProductos(): Promise<Producto[]> {
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, activo')
    .order('nombre', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Producto[]).filter((p) => p.activo !== false)
}
