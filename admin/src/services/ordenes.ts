import { supabase } from '../lib/supabase'
import type { DatosOrden, EstadoOrden, ItemOrden, Orden } from '../types'

export interface FiltrosOrdenes {
  estado?: EstadoOrden | ''
  estados?: EstadoOrden[]
  fecha?: string
  /** Solo órdenes con fecha de entrega anterior a esta (YYYY-MM-DD), p. ej. las atrasadas */
  entregaAntesDe?: string
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
  // Filtra por la fecha de entrega prevista (YYYY-MM-DD)
  if (filtros.fecha) q = q.eq('fecha_entrega', filtros.fecha)
  if (filtros.entregaAntesDe) q = q.lt('fecha_entrega', filtros.entregaAntesDe)
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
 * Crea o actualiza una orden y sus productos con la función SQL guardar_orden
 * (migración 007): una sola transacción, sin borrar filas desde el panel.
 * Solo se pueden editar órdenes pendientes.
 */
export async function guardarOrden(
  datos: DatosOrden,
  items: ItemOrden[],
  id?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('guardar_orden', {
    p_orden_id: id ?? null,
    p_datos: datos,
    p_items: items,
  })
  if (error) throw new Error(error.code === '23505' ? MSG_GUIA_DUPLICADA : error.message)
  return data as string
}

/** Cancelar no borra: la orden queda en estado «cancelada» con motivo. */
export async function cancelarOrden(id: string, motivo: string): Promise<void> {
  const { error } = await supabase
    .from('ordenes')
    .update({ estado: 'cancelada', motivo_cancelacion: motivo })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Devuelve una orden fallida a pendiente con una NUEVA fecha de entrega
 * (función SQL reprogramar_orden, migración 008).
 */
export async function reprogramarOrden(id: string, fechaEntrega: string): Promise<void> {
  const { error } = await supabase.rpc('reprogramar_orden', {
    p_orden: id,
    p_fecha: fechaEntrega,
  })
  if (error) throw new Error(error.message)
}

/**
 * Órdenes que quedaron en paradas «omitidas» (el conductor no llegó a visitarlas).
 * Solo se devuelven las que siguen sin resolver (pendientes o fallidas) y cuya fecha
 * de entrega no es futura; así no reaparecen las ya reprogramadas hacia adelante.
 */
export async function listarOmitidas(hoy: string): Promise<Orden[]> {
  const { data, error } = await supabase
    .from('paradas')
    .select('id, parada_ordenes(ordenes(*, orden_items(producto_id, cantidad_pedida, productos(nombre))))')
    .eq('estado', 'omitida')
  if (error) throw new Error(error.message)

  const vistas = new Map<string, Orden>()
  for (const p of (data ?? []) as unknown as { parada_ordenes: { ordenes: Orden | null }[] | null }[]) {
    for (const po of p.parada_ordenes ?? []) {
      const o = po.ordenes
      if (!o) continue
      const sinResolver = o.estado === 'pendiente' || o.estado === 'fallida'
      if (sinResolver && o.fecha_entrega <= hoy) vistas.set(o.id, o)
    }
  }
  return [...vistas.values()]
}
