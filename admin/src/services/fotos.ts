import { supabase } from '../lib/supabase'

/** Bucket privado de Supabase Storage donde el conductor sube las fotos de entrega. */
const BUCKET = 'entregas'
/** Los enlaces temporales duran 1 hora (el bucket es privado). */
const SEGUNDOS_ENLACE = 3600

export interface FotoEntrega {
  id: string
  url: string
}

export interface EntregaDeParada {
  id: string
  resultado: string
  motivo: string | null
  comentario: string | null
  recibido_por: string | null
  fotos: FotoEntrega[]
}

type Fila = Record<string, unknown>

/**
 * Ruta del archivo dentro del bucket (`entrega_fotos.ruta_archivo`). Si alguna vez guardan
 * una URL completa, se queda con lo que va después del nombre del bucket.
 */
function rutaDelArchivo(foto: Fila): string | null {
  const v = foto.ruta_archivo
  if (typeof v !== 'string' || !v) return null
  const i = v.indexOf(`/${BUCKET}/`)
  return i >= 0 ? v.slice(i + BUCKET.length + 2).split('?')[0] : v
}

/**
 * Entregas (con sus fotos) de un conjunto de paradas, indexadas por parada.
 * Las fotos se piden con enlaces temporales firmados.
 */
export async function obtenerEntregas(
  paradaIds: string[],
): Promise<Record<string, EntregaDeParada>> {
  if (paradaIds.length === 0) return {}
  const { data, error } = await supabase
    .from('entregas')
    .select('id, parada_id, resultado, motivo, comentario, recibido_por, entrega_fotos(*)')
    .in('parada_id', paradaIds)
  if (error) throw new Error(error.message)

  const filas = (data ?? []) as unknown as (Fila & { entrega_fotos?: Fila[] })[]
  const pedidas = filas.flatMap((e) =>
    (e.entrega_fotos ?? []).flatMap((f) => {
      const ruta = rutaDelArchivo(f)
      return ruta ? [{ entrega: e, id: String(f.id), ruta }] : []
    }),
  )

  // Una sola llamada para firmar todas las rutas.
  const firmadas = new Map<string, string>()
  if (pedidas.length > 0) {
    const { data: urls } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(pedidas.map((p) => p.ruta), SEGUNDOS_ENLACE)
    for (const u of urls ?? []) if (u.signedUrl && !u.error) firmadas.set(u.path ?? '', u.signedUrl)
  }

  const resultado: Record<string, EntregaDeParada> = {}
  for (const e of filas) {
    const fotos: FotoEntrega[] = pedidas
      .filter((p) => p.entrega === e && firmadas.has(p.ruta))
      .map((p) => ({ id: p.id, url: firmadas.get(p.ruta) as string }))
    resultado[String(e.parada_id)] = {
      id: String(e.id),
      resultado: String(e.resultado),
      motivo: (e.motivo as string | null) ?? null,
      comentario: (e.comentario as string | null) ?? null,
      recibido_por: (e.recibido_por as string | null) ?? null,
      fotos,
    }
  }
  return resultado
}
