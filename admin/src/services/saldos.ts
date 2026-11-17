import { supabase } from '../lib/supabase'
import type { Orden } from '../types'
import { guardarOrden, guiaExiste } from './ordenes'

// ───────────────────────────────────────────────────────────────────────────────
// Orden con saldo (tarea 4-19).
// Cuando una entrega es parcial, se crea una orden NUEVA con lo que quedó sin entregar.
// El saldo = cantidad pedida (orden_items) − cantidad entregada (entrega_items).
//
// AJUSTAR SI NO COINCIDEN CON LA MIGRACIÓN 002:
//  - COLUMNAS_CANTIDAD: nombre de la columna de `entrega_items` con lo entregado.
// El enlace de `entrega_items` con la orden se detecta solo (orden_item_id o producto_id).
// ───────────────────────────────────────────────────────────────────────────────
const COLUMNAS_CANTIDAD = ['cantidad_entregada', 'cantidad_recibida', 'cantidad']

export interface ItemSaldo {
  producto_id: string
  nombre: string
  pedida: number
  entregada: number
  saldo: number
}

type Fila = Record<string, unknown>
const aLista = (x: unknown): Fila[] => (Array.isArray(x) ? x : x ? [x as Fila] : [])

export async function calcularSaldo(orden: Orden): Promise<ItemSaldo[]> {
  const { data: its, error: e1 } = await supabase
    .from('orden_items')
    .select('id, producto_id, cantidad_pedida, productos(nombre)')
    .eq('orden_id', orden.id)
  if (e1) throw new Error(e1.message)
  const pedidos = (its ?? []) as unknown as {
    id: string
    producto_id: string
    cantidad_pedida: number
    productos: { nombre: string } | null
  }[]

  // orden → paradas → entregas → entrega_items
  const { data, error } = await supabase
    .from('parada_ordenes')
    .select('parada_id, paradas(entregas(id, entrega_items(*)))')
    .eq('orden_id', orden.id)
  if (error) throw new Error(error.message)

  const filas: Fila[] = []
  for (const po of aLista(data)) {
    for (const par of aLista(po.paradas)) {
      for (const ent of aLista(par.entregas)) filas.push(...aLista(ent.entrega_items))
    }
  }

  const entregado = new Map<string, number>() // por producto_id
  if (filas.length > 0) {
    const columna = COLUMNAS_CANTIDAD.find((c) => c in filas[0])
    const porItem = 'orden_item_id' in filas[0]
    const porProducto = 'producto_id' in filas[0]
    if (!columna || (!porItem && !porProducto)) {
      throw new Error(
        `No se reconoce la tabla «entrega_items». Columnas encontradas: ${Object.keys(filas[0]).join(', ')}. ` +
          `Ajusta COLUMNAS_CANTIDAD en src/services/saldos.ts.`,
      )
    }
    const idsDeEstaOrden = new Map(pedidos.map((p) => [p.id, p.producto_id]))
    for (const f of filas) {
      const cant = Number(f[columna] ?? 0)
      let producto: string | undefined
      if (porItem) producto = idsDeEstaOrden.get(String(f.orden_item_id)) // ignora ítems de otras órdenes
      else if (!('orden_id' in f) || f.orden_id === orden.id) producto = String(f.producto_id)
      if (producto && Number.isFinite(cant)) entregado.set(producto, (entregado.get(producto) ?? 0) + cant)
    }
  }

  return pedidos
    .map((p) => {
      const ent = Math.min(entregado.get(p.producto_id) ?? 0, p.cantidad_pedida)
      return {
        producto_id: p.producto_id,
        nombre: p.productos?.nombre ?? p.producto_id,
        pedida: p.cantidad_pedida,
        entregada: ent,
        saldo: p.cantidad_pedida - ent,
      }
    })
    .filter((i) => i.saldo > 0)
}

/** Busca si ya se creó una orden de saldo para esta guía (guía-S1, guía-S2…). */
export async function guiaDeSaldo(guia: string): Promise<string | null> {
  const patron = guia.replace(/[\\%_]/g, (m) => `\\${m}`)
  const { data, error } = await supabase
    .from('ordenes')
    .select('numero_guia')
    .ilike('numero_guia', `${patron}-S%`)
    .neq('estado', 'cancelada')
    .limit(1)
  if (error) throw new Error(error.message)
  return (data?.[0] as { numero_guia: string } | undefined)?.numero_guia ?? null
}

/** Crea la orden nueva (guía «original-S1») con los productos del saldo. Devuelve su guía. */
export async function crearOrdenSaldo(
  orden: Orden,
  items: ItemSaldo[],
  fechaEntrega: string,
): Promise<string> {
  if (orden.latitud == null || orden.longitud == null) {
    throw new Error('La orden original no tiene ubicación en el mapa; no se puede copiar.')
  }
  let guia = ''
  for (let n = 1; n <= 20; n++) {
    const candidata = `${orden.numero_guia}-S${n}`
    if (!(await guiaExiste(candidata))) {
      guia = candidata
      break
    }
  }
  if (!guia) throw new Error('No se pudo generar un número de guía libre para el saldo.')
  if (guia.length > 40) throw new Error('El número de guía del saldo supera los 40 caracteres.')

  const notas = `Saldo de la orden ${orden.numero_guia}.${orden.notas ? ` ${orden.notas}` : ''}`.slice(0, 500)
  await guardarOrden(
    {
      numero_guia: guia,
      cliente_nombre: orden.cliente_nombre,
      cliente_telefono: orden.cliente_telefono,
      direccion: orden.direccion,
      notas,
      latitud: orden.latitud,
      longitud: orden.longitud,
      fecha_entrega: fechaEntrega,
    },
    items.map((i) => ({ producto_id: i.producto_id, cantidad: i.saldo })),
  )
  return guia
}
