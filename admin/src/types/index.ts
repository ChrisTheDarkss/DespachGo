// Nombres de columnas y estados: alinear con el documento de acuerdos (tarea 1-02).

export type EstadoOrden =
  | 'pendiente'
  | 'asignada'
  | 'entregada'
  | 'parcial'
  | 'fallida'
  | 'cancelada'

export const ESTADOS_ORDEN: EstadoOrden[] = [
  'pendiente',
  'asignada',
  'entregada',
  'parcial',
  'fallida',
  'cancelada',
]

export interface Producto {
  id: string
  nombre: string
  activo?: boolean | null
}

export interface ItemOrden {
  producto_id: string
  cantidad: number
}

export interface Orden {
  id: string
  numero_guia: string
  cliente_nombre: string
  telefono: string
  direccion: string
  notas: string | null
  lat: number | null
  lng: number | null
  estado: EstadoOrden
  motivo_cancelacion: string | null
  created_at: string
  orden_items?: {
    producto_id: string
    cantidad: number
    productos?: { nombre: string } | null
  }[]
}

export interface DatosOrden {
  numero_guia: string
  cliente_nombre: string
  telefono: string
  direccion: string
  notas: string | null
  lat: number
  lng: number
}

export interface Perfil {
  id: string
  nombre: string
  rol: 'admin' | 'conductor'
}

export interface Coordenadas {
  lat: number
  lng: number
}

export interface Parada {
  id: string
  posicion: number
  estado: string
  parada_ordenes?: {
    ordenes?: {
      numero_guia: string
      cliente_nombre: string
      direccion: string
    } | null
  }[]
}

export interface Ruta {
  id: string
  fecha: string
  estado: string
  conductor_id: string
  perfiles?: { nombre: string } | null
  paradas?: Parada[]
}
