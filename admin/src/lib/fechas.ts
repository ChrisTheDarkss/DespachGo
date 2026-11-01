/** Fecha local de hoy en formato YYYY-MM-DD. */
export function hoyLocal(): string {
  return new Date().toLocaleDateString('sv-SE')
}

/** Inicio del día local (ISO) y del día siguiente, para filtrar por created_at. */
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
