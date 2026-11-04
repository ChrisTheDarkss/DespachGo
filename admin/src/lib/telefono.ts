/**
 * Normaliza un teléfono chileno móvil al formato +569XXXXXXXX.
 * Devuelve null si no se puede interpretar.
 * (La tarea 5-04 del bot define la versión oficial; mantener ambas iguales.)
 */
export function normalizarTelefono(raw: string): string | null {
  let n = raw.replace(/\D/g, '')
  if (n.startsWith('56')) n = n.slice(2)
  if (n.length === 8) n = '9' + n
  if (n.length === 9 && n.startsWith('9')) return '+56' + n
  return null
}

export function formatearTelefono(tel: string): string {
  const m = /^\+56(9)(\d{4})(\d{4})$/.exec(tel)
  return m ? `+56 ${m[1]} ${m[2]} ${m[3]}` : tel
}
