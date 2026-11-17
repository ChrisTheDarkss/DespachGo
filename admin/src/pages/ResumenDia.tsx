import { useEffect, useState } from 'react'
import ConductoresEnVivo from '../components/ConductoresEnVivo'
import EstadoBadge from '../components/EstadoBadge'
import VisorFoto from '../components/VisorFoto'
import { hoyLocal } from '../lib/fechas'
import { fotosDeParadas } from '../services/fotos'
import type { FotosPorParada } from '../services/fotos'
import { listarRutasDelDia } from '../services/rutas'
import type { Ruta } from '../types'

interface FotoAbierta {
  titulo: string
  fotos: string[]
  inicio: number
}

export default function ResumenDia() {
  const [fecha, setFecha] = useState(hoyLocal())
  const [rutas, setRutas] = useState<Ruta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fotos, setFotos] = useState<FotosPorParada>({})
  const [errorFotos, setErrorFotos] = useState<string | null>(null)
  const [visor, setVisor] = useState<FotoAbierta | null>(null)

  useEffect(() => {
    let activo = true
    setCargando(true)
    setFotos({})
    setErrorFotos(null)
    listarRutasDelDia(fecha)
      .then((r) => {
        if (!activo) return
        setRutas(r)
        setError(null)
        // Las fotos se piden aparte: la tabla ya se ve y un fallo aquí no la rompe.
        const ids = r.flatMap((ruta) => (ruta.paradas ?? []).map((p) => p.id))
        fotosDeParadas(ids)
          .then((f) => activo && setFotos(f))
          .catch((e: Error) => activo && setErrorFotos(e.message))
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
      {errorFotos && (
        <p className="error">No se pudieron cargar las fotos de entrega: {errorFotos}</p>
      )}
      {cargando && <p className="cargando">Cargando…</p>}
      {!cargando && rutas.length === 0 && !error && (
        <p className="tarjeta texto-suave">No hay rutas para esta fecha.</p>
      )}

      {fecha === hoyLocal() && rutas.length > 0 && (
        <ConductoresEnVivo
          conductores={[
            ...new Map(
              rutas.map((r) => [r.conductor_id, r.perfiles?.nombre ?? 'Conductor'] as const),
            ),
          ].map(([id, nombre]) => ({ id, nombre }))}
        />
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
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Guía(s)</th>
                    <th>Cliente</th>
                    <th>Dirección</th>
                    <th>Estado</th>
                    <th>Foto de la entrega</th>
                  </tr>
                </thead>
                <tbody>
                  {paradas.map((p) => {
                    const ords = (p.parada_ordenes ?? []).map((po) => po.ordenes).filter(Boolean)
                    const fotosParada = fotos[p.id] ?? []
                    const titulo = `${ords.map((o) => o?.numero_guia).join(', ')} · ${ords[0]?.cliente_nombre ?? ''}`
                    return (
                      <tr key={p.id}>
                        <td>{p.posicion_final ?? p.posicion_sugerida}</td>
                        <td>{ords.map((o) => o?.numero_guia).join(', ')}</td>
                        <td>{ords[0]?.cliente_nombre}</td>
                        <td>{ords[0]?.direccion}</td>
                        <td>
                          <EstadoBadge estado={p.estado} />
                        </td>
                        <td>
                          {fotosParada.length > 0 ? (
                            <div className="miniaturas">
                              {fotosParada.map((url, i) => (
                                <button
                                  key={url}
                                  type="button"
                                  className="miniatura"
                                  title="Ver foto"
                                  onClick={() => setVisor({ titulo, fotos: fotosParada, inicio: i })}
                                >
                                  <img src={url} alt={`Foto de la entrega ${titulo}`} loading="lazy" />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="texto-suave">
                              {p.estado === 'entregada' || p.estado === 'parcial' ? 'Sin foto' : '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}

      {visor && (
        <VisorFoto
          titulo={visor.titulo}
          fotos={visor.fotos}
          inicio={visor.inicio}
          onCerrar={() => setVisor(null)}
        />
      )}
    </div>
  )
}
