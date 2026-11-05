import { supabase } from '../lib/supabase'
import { rangoDia } from '../lib/fechas'
import type { DatosOrden, EstadoOrden, ItemOrden, Orden } from '../types'

export interface FiltrosOrdenes {
  estado?: EstadoOrden | ''
  estados?: EstadoOrden[]
  fecha?: string
  guia?: string
}

const SELECT_ORDEN =
  '*, orden_items(producto_id, cantidad_pedida, productos(nombre))'

export async function listarOrdenes(filtros: FiltrosOrdenes = {}): Promise<Orden[]> {
  let q = supabase
    .from('ordenes')
    .select(SELECT_ORDEN)
    .order('creado_en', { ascending: false })

  if (filtros.estado) q = q.eq('estado', filtros.estado)
  if (filtros.estados && filtros.estados.length > 0) q = q.in('estado', filtros.estados)
  if (filtros.fecha) {
    const { desde, hasta } = rangoDia(filtros.fecha)
    q = q.gte('creado_en', desde).lt('creado_en', hasta)
  }
  if (filtros.guia?.trim()) q = q.ilike('numero_guia', `%${filtros.guia.trim()}%`)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Orden[]
}

export async function obtenerOrden(id: string): Promise<Orden> {
  const { data, error } = await supabase
    .from('ordenes')
    .select(SELECT_ORDEN)
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as Orden
}

/** true si ya existe otra orden con ese número de guía. */
export async function guiaExiste(guia: string, excluirId?: string): Promise<boolean> {
  let q = supabase
    .from('ordenes')
    .select('id', { count: 'exact', head: true })
    .eq('numero_guia', guia)
  if (excluirId) q = q.neq('id', excluirId)
  const { count, error } = await q
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

const MSG_GUIA_DUPLICADA = 'Ya existe una orden con ese número de guía.'

/**
 * Crea o actualiza una orden y reemplaza sus productos.
 * Nota: son varias llamadas; si más adelante se necesita atomicidad,
 * moverlo a una función SQL (rpc) en Supabase.
 */
export async function guardarOrden(
  datos: DatosOrden,
  items: ItemOrden[],
  id?: string,
): Promise<string> {
  let ordenId = id

  if (id) {
    const { error } = await supabase.from('ordenes').update(datos).eq('id', id)
    if (error) throw new Error(error.code === '23505' ? MSG_GUIA_DUPLICADA : error.message)

    const { error: errDel } = await supabase.from('orden_items').delete().eq('orden_id', id)
    if (errDel) throw new Error(errDel.message)
  } else {
    const { data, error } = await supabase
      .from('ordenes')
      .insert({ ...datos, estado: 'pendiente' })
      .select('id')
      .single()
    if (error) throw new Error(error.code === '23505' ? MSG_GUIA_DUPLICADA : error.message)
    ordenId = (data as { id: string }).id
  }

  const filas = items.map((i) => ({
    orden_id: ordenId,
    producto_id: i.producto_id,
    cantidad_pedida: i.cantidad,
  }))
  const { error: errIns } = await supabase.from('orden_items').insert(filas)
  if (errIns) throw new Error(errIns.message)

  return ordenId as string
}

/** Cancelar no borra: la orden queda en estado «cancelada» con motivo. */
export async function cancelarOrden(id: string, motivo: string): Promise<void> {
  const { error } = await supabase
    .from('ordenes')
    .update({ estado: 'cancelada', motivo_cancelacion: motivo })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Devuelve una orden fallida a pendiente para incluirla en una nueva ruta. */
export async function reprogramarOrden(id: string): Promise<void> {
  const { error } = await supabase.from('ordenes').update({ estado: 'pendiente' }).eq('id', id)
  if (error) throw new Error(error.message)
}
