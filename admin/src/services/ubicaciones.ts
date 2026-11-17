import { supabase } from '../lib/supabase'

// ───────────────────────────────────────────────────────────────────────────────
// Mapa en vivo de conductores (tarea 4-20) con Supabase Realtime.
//
// Requisitos en Supabase (una sola vez):
//   alter publication supabase_realtime add table ubicaciones_conductor;
// y una política RLS que permita al admin leer `ubicaciones_conductor`.
//
// AJUSTAR SI NO COINCIDEN CON LA MIGRACIÓN 003:
//  - COLUMNAS_HORA: columna con la hora de cada posición (se usa la primera que exista).
// La latitud/longitud se leen de `latitud`/`longitud` (o `lat`/`lng`) y el conductor de `conductor_id`.
// ───────────────────────────────────────────────────────────────────────────────
const TABLA = 'ubicaciones_conductor'
const COLUMNAS_HORA = ['creado_en', 'registrado_en', 'capturado_en', 'tomado_en', 'created_at']

export interface Posicion {
  conductor_id: string
  lat: number
  lng: number
  hora: string | null
}

export type EstadoConexion = 'conectando' | 'en_vivo' | 'caida'

function aPosicion(fila: Record<string, unknown>): Posicion | null {
  const lat = Number(fila.latitud ?? fila.lat)
  const lng = Number(fila.longitud ?? fila.lng)
  const id = fila.conductor_id
  if (typeof id !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const col = COLUMNAS_HORA.find((c) => typeof fila[c] === 'string')
  return { conductor_id: id, lat, lng, hora: col ? (fila[col] as string) : null }
}

/** Última posición conocida de cada conductor. */
export async function ultimasPosiciones(ids: string[]): Promise<Record<string, Posicion>> {
  if (ids.length === 0) return {}
  let ultimoError = ''
  for (const col of COLUMNAS_HORA) {
    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .in('conductor_id', ids)
      .order(col, { ascending: false })
      .limit(500)
    if (error) {
      ultimoError = error.message
      continue
    }
    const res: Record<string, Posicion> = {}
    for (const f of (data ?? []) as Record<string, unknown>[]) {
      const p = aPosicion(f)
      if (p && !res[p.conductor_id]) res[p.conductor_id] = p // la primera es la más reciente
    }
    return res
  }
  throw new Error(`${ultimoError}. Ajusta COLUMNAS_HORA en src/services/ubicaciones.ts.`)
}

/** Escucha posiciones nuevas en tiempo real. Devuelve la función para dejar de escuchar. */
export function escucharPosiciones(
  ids: string[],
  alRecibir: (p: Posicion) => void,
  alCambiarEstado: (e: EstadoConexion) => void,
): () => void {
  const permitidos = new Set(ids)
  const canal = supabase
    .channel(`ubicaciones-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLA }, (payload) => {
      if (payload.eventType === 'DELETE') return
      const p = aPosicion(payload.new as Record<string, unknown>)
      if (p && permitidos.has(p.conductor_id)) alRecibir(p)
    })
    .subscribe((estado) => {
      if (estado === 'SUBSCRIBED') alCambiarEstado('en_vivo')
      else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED')
        alCambiarEstado('caida')
    })
  return () => {
    supabase.removeChannel(canal)
  }
}
