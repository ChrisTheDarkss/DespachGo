import { useEffect, useState } from 'react'
import EstadoBadge from '../components/EstadoBadge'
import { hoyLocal } from '../lib/fechas'
import { listarRutasDelDia } from '../services/rutas'
import type { Ruta } from '../types'

export default function ResumenDia() {
  const [fecha, setFecha] = useState(hoyLocal())
  const [rutas, setRutas] = useState<Ruta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    setCargando(true)
    listarRutasDelDia(fecha)
      .then((r) => {
        if (!activo) return
        setRutas(r)
        setError(null)
      })
      .catch((e: Error) => activo && setError(e.message))
      .finally(() => activo && setCargando(false))
    return () => {
      activo = false
    }
  }, [fecha])

  return (
    <div>
      <div className="encabezado">
        <h2>Resumen del día</h2>
        <label className="campo campo-fila">
          <span>Fecha</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {cargando && <p className="cargando">Cargando…</p>}
      {!cargando && rutas.length === 0 && !error && (
        <p className="tarjeta texto-suave">No hay rutas para esta fecha.</p>
      )}

      {rutas.map((r) => {
        const paradas = r.paradas ?? []
        const conteo = paradas.reduce<Record<string, number>>((acc, p) => {
          acc[p.estado] = (acc[p.estado] ?? 0) + 1
          return acc
        }, {})
        return (
          <section className="tarjeta ruta" key={r.id}>
            <div className="encabezado">
              <h3>
                {r.perfiles?.nombre ?? 'Conductor'} <EstadoBadge estado={r.estado} />
              </h3>
              <span className="texto-suave">
                {paradas.length} paradas
                {Object.entries(conteo).map(([estado, n]) => ` · ${n} ${estado}`)}
              </span>
            </div>
            <table className="tabla">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Guía(s)</th>
                  <th>Cliente</th>
                  <th>Dirección</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {paradas.map((p) => {
                  const ords = (p.parada_ordenes ?? []).map((po) => po.ordenes).filter(Boolean)
                  return (
                    <tr key={p.id}>
                      <td>{p.posicion_final ?? p.posicion_sugerida}</td>
                      <td>{ords.map((o) => o?.numero_guia).join(', ')}</td>
                      <td>{ords[0]?.cliente_nombre}</td>
                      <td>{ords[0]?.direccion}</td>
                      <td>
                        <EstadoBadge estado={p.estado} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      })}

      <p className="texto-suave">
        Próximamente: fotos de las guías (4-17) y mapa en vivo de los conductores (4-20).
      </p>
    </div>
  )
}
