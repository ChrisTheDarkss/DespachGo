// Nombres de columnas y estados: alinear con el documento de acuerdos (tarea 1-02).

// Estados de `ordenes` según el esquema de Supabase.
// (`parcial` existe solo en paradas y entregas; en órdenes es `entregada_parcial`.)
export type EstadoOrden =
  | 'pendiente'
  | 'asignada'
  | 'en_ruta'
  | 'entregada'
  | 'entregada_parcial'
  | 'fallida'
  | 'cancelada'

export const ESTADOS_ORDEN: EstadoOrden[] = [
  'pendiente',
  'asignada',
  'en_ruta',
  'entregada',
  'entregada_parcial',
  'fallida',
  'cancelada',
]

export interface Producto {
  id: string
  nombre: string
  activo?: boolean | null
}

/** Producto de una orden tal como lo usa el formulario (cantidad que se pide). */
export interface ItemOrden {
  producto_id: string
  cantidad: number
}

export interface Orden {
  id: string
  numero_guia: string
  cliente_nombre: string
  cliente_telefono: string
  direccion: string
  notas: string | null
  latitud: number | null
  longitud: number | null
  estado: EstadoOrden
  motivo_cancelacion: string | null
  creado_en: string
  orden_items?: {
    producto_id: string
    cantidad_pedida: number
    productos?: { nombre: string } | null
  }[]
}

export interface DatosOrden {
  numero_guia: string
  cliente_nombre: string
  cliente_telefono: string
  direccion: string
  notas: string | null
  latitud: number
  longitud: number
}

export interface Perfil {
  id: string
  nombre: string
  rol: 'admin' | 'conductor'
  activo?: boolean
}

export interface Coordenadas {
  lat: number
  lng: number
}

export interface Parada {
  id: string
  posicion_sugerida: number | null
  posicion_final: number | null
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
