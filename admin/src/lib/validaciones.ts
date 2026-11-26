import { hoyLocal } from './fechas'
import { normalizarTelefono } from './telefono'
import type { ItemOrden } from '../types'

/** Límites de los campos (evitan datos absurdos y cortes en la base). */
export const LIMITES = {
  guia: 40,
  clienteMin: 2,
  cliente: 100,
  direccionMin: 5,
  direccion: 200,
  notas: 500,
  motivoMin: 5,
  motivo: 300,
  cantidadMax: 9999,
}

export type CampoOrden =
  | 'guia'
  | 'cliente'
  | 'telefono'
  | 'direccion'
  | 'fechaEntrega'
  | 'notas'
  | 'pin'
  | 'items'

export type ErroresOrden = Partial<Record<CampoOrden, string>>

export interface DatosFormularioOrden {
  guia: string
  cliente: string
  telefono: string
  direccion: string
  fechaEntrega: string
  /** Fecha que ya tenía la orden al editarla (una atrasada puede conservarla). */
  fechaOriginal: string | null
  notas: string
  hayPin: boolean
  pinValidado: boolean
  items: ItemOrden[]
}

function fechaValida(f: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f))
}

/** Valida el formulario de orden. Devuelve un objeto vacío si todo está bien. */
export function validarOrden(d: DatosFormularioOrden): ErroresOrden {
  const e: ErroresOrden = {}

  const guia = d.guia.trim()
  if (!guia) e.guia = 'El número de guía es obligatorio.'
  else if (guia.length > LIMITES.guia) e.guia = `Máximo ${LIMITES.guia} caracteres.`

  const cliente = d.cliente.trim()
  if (!cliente) e.cliente = 'Escribe el nombre del cliente.'
  else if (cliente.length < LIMITES.clienteMin) e.cliente = 'El nombre es demasiado corto.'
  else if (cliente.length > LIMITES.cliente) e.cliente = `Máximo ${LIMITES.cliente} caracteres.`

  if (!normalizarTelefono(d.telefono)) {
    e.telefono = 'Teléfono no válido. Usa un móvil chileno, por ejemplo +56 9 1234 5678.'
  }

  const direccion = d.direccion.trim()
  if (!direccion) e.direccion = 'Escribe la dirección.'
  else if (direccion.length < LIMITES.direccionMin) {
    e.direccion = `La dirección es muy corta (mínimo ${LIMITES.direccionMin} caracteres).`
  } else if (direccion.length > LIMITES.direccion) {
    e.direccion = `Máximo ${LIMITES.direccion} caracteres.`
  }

  if (!d.fechaEntrega) e.fechaEntrega = 'Elige la fecha de entrega.'
  else if (!fechaValida(d.fechaEntrega)) e.fechaEntrega = 'La fecha de entrega no es válida.'
  else if (d.fechaEntrega !== d.fechaOriginal && d.fechaEntrega < hoyLocal()) {
    e.fechaEntrega = 'La fecha de entrega no puede ser anterior a hoy.'
  }

  if (d.notas.trim().length > LIMITES.notas) e.notas = `Máximo ${LIMITES.notas} caracteres.`

  if (!d.hayPin) e.pin = 'Ubica el pin de la dirección en el mapa.'
  else if (!d.pinValidado) e.pin = 'Confirma que el pin está en el lugar correcto.'

  if (d.items.length === 0) e.items = 'Agrega al menos un producto.'
  else if (
    d.items.some(
      (i) => !Number.isInteger(i.cantidad) || i.cantidad < 1 || i.cantidad > LIMITES.cantidadMax,
    )
  ) {
    e.items = `Las cantidades deben ser números enteros entre 1 y ${LIMITES.cantidadMax}.`
  }

  return e
}

/** Valida el motivo de una cancelación. Devuelve el error, o null si está bien. */
export function validarMotivo(texto: string): string | null {
  const t = texto.trim()
  if (!t) return 'Escribe el motivo.'
  if (t.length < LIMITES.motivoMin) return `Explica un poco más (mínimo ${LIMITES.motivoMin} caracteres).`
  if (t.length > LIMITES.motivo) return `Máximo ${LIMITES.motivo} caracteres.`
  return null
}

/** Valida la fecha de una ruta. Devuelve el error, o null si está bien. */
export function validarFechaRuta(fecha: string): string | null {
  if (!fecha) return 'Elige la fecha de la ruta.'
  if (!fechaValida(fecha)) return 'La fecha de la ruta no es válida.'
  if (fecha < hoyLocal()) return 'La fecha de la ruta no puede ser anterior a hoy.'
  return null
}
