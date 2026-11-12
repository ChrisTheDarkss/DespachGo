/** Fecha de hoy en Santiago (la misma que usa la base de datos), formato YYYY-MM-DD. */
export function hoyLocal(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' })
}

/** Formatea una fecha YYYY-MM-DD (sin hora) como dd/mm/aaaa, sin desfases de zona horaria. */
export function formatearFecha(fecha: string): string {
  const [a, m, d] = fecha.split('-')
  return `${d}/${m}/${a}`
}

/** Inicio del día local (ISO) y del día siguiente, para filtrar por creado_en. */
export function rangoDia(fecha: string): { desde: string; hasta: string } {
  const inicio = new Date(`${fecha}T00:00:00`)
  const fin = new Date(inicio)
  fin.setDate(fin.getDate() + 1)
  return { desde: inicio.toISOString(), hasta: fin.toISOString() }
}

export function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
