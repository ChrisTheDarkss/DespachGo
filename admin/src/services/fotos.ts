import { supabase } from '../lib/supabase'

// ───────────────────────────────────────────────────────────────────────────────
// Fotos de entrega (tarea 4-17).
//
// Las fotos viven en la tabla `entrega_fotos` (varias por entrega) y los archivos en
// un bucket PRIVADO de Storage, al que se accede con enlaces temporales.
//
// AJUSTAR SI NO COINCIDEN CON LA MIGRACIÓN 002 / EL STORAGE DE SUPABASE:
//  - COLUMNAS_ARCHIVO: posibles nombres de la columna de `entrega_fotos` con la ruta
//                      o URL del archivo (se usa la primera que exista).
//  - BUCKETS_FOTOS:    bucket(s) de Storage donde se suben las fotos (se prueba en orden).
// Si algo no coincide, el Resumen del día muestra el error con las columnas reales.
// ───────────────────────────────────────────────────────────────────────────────
const COLUMNAS_ARCHIVO = [
  'ruta_archivo',
  'storage_path',
  'path',
  'ruta',
  'foto_path',
  'foto_url',
  'url',
  'archivo',
  'nombre_archivo',
]
const BUCKETS_FOTOS = ['fotos-entregas', 'fotos', 'entregas', 'fotos_entregas', 'entrega-fotos', 'guias']

/** Los enlaces firmados caducan: la foto es privada y el enlace dura solo este tiempo. */
const SEGUNDOS_VIGENCIA = 60 * 60

/** parada_id → enlaces listos para mostrar (una parada puede tener varias entregas y fotos). */
export type FotosPorParada = Record<string, string[]>

const esUrl = (v: string) => /^https?:\/\//i.test(v)

/** Pide enlaces temporales probando los buckets posibles hasta que uno responda. */
async function firmar(rutas: string[]): Promise<Map<string, string>> {
  const errores: string[] = []
  for (const bucket of BUCKETS_FOTOS) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(rutas, SEGUNDOS_VIGENCIA)
    if (error) {
      errores.push(`${bucket}: ${error.message}`)
      continue
    }
    const mapa = new Map<string, string>()
    for (const u of data ?? []) if (u.path && u.signedUrl) mapa.set(u.path, u.signedUrl)
    if (mapa.size > 0) return mapa
    errores.push(`${bucket}: no encontró los archivos`)
  }
  throw new Error(
    `No se pudieron firmar las fotos (bucket distinto o falta permiso de lectura). ` +
      `Ejemplo de ruta guardada: «${rutas[0]}». Intentos → ${errores.join(' | ')}. ` +
      `Ajusta BUCKETS_FOTOS en src/services/fotos.ts.`,
  )
}

/**
 * Devuelve las fotos de entrega de las paradas indicadas.
 * Si el valor guardado es una URL se usa tal cual; si es una ruta dentro del bucket,
 * se pide un enlace temporal (URL firmada) a Storage.
 */
export async function fotosDeParadas(paradaIds: string[]): Promise<FotosPorParada> {
  if (paradaIds.length === 0) return {}

  const { data, error } = await supabase
    .from('entregas')
    .select('id, parada_id, entrega_fotos(*)')
    .in('parada_id', paradaIds)
  if (error) throw new Error(error.message)

  type Fila = { parada_id: string; entrega_fotos: Record<string, unknown>[] | null }
  const entregas = (data ?? []) as unknown as Fila[]

  const fotos = entregas.flatMap((e) =>
    (e.entrega_fotos ?? []).map((f) => ({ paradaId: e.parada_id, fila: f })),
  )
  if (fotos.length === 0) return {}

  // Detecta qué columna trae el archivo. Si ninguna existe, avisa con las columnas reales.
  const columna = COLUMNAS_ARCHIVO.find((c) => c in fotos[0].fila)
  if (!columna) {
    throw new Error(
      `La tabla «entrega_fotos» no tiene una columna de archivo conocida. ` +
        `Columnas encontradas: ${Object.keys(fotos[0].fila).join(', ')}. ` +
        `Ajusta COLUMNAS_ARCHIVO en src/services/fotos.ts.`,
    )
  }

  const pendientes: { paradaId: string; valor: string }[] = []
  for (const { paradaId, fila } of fotos) {
    const valor = fila[columna]
    if (typeof valor === 'string' && valor.trim()) {
      pendientes.push({ paradaId, valor: valor.trim() })
    }
  }

  const porFirmar = [...new Set(pendientes.filter((p) => !esUrl(p.valor)).map((p) => p.valor))]
  const firmadas = porFirmar.length > 0 ? await firmar(porFirmar) : new Map<string, string>()

  const resultado: FotosPorParada = {}
  for (const { paradaId, valor } of pendientes) {
    const url = esUrl(valor) ? valor : firmadas.get(valor)
    if (!url) continue
    ;(resultado[paradaId] ??= []).push(url)
  }
  return resultado
}
