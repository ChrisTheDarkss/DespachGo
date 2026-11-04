import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EstadoBadge from '../components/EstadoBadge'
import { formatearFechaHora } from '../lib/fechas'
import { formatearTelefono } from '../lib/telefono'
import { listarOrdenes } from '../services/ordenes'
import { ESTADOS_ORDEN } from '../types'
import type { EstadoOrden, Orden } from '../types'

export default function Ordenes() {
  const [estado, setEstado] = useState<EstadoOrden | ''>('')
  const [fecha, setFecha] = useState('')
  const [guia, setGuia] = useState('')
  const [ordenes, setOrdenes] = useState<Orden[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    setCargando(true)
    // Pequeña espera para no consultar en cada tecla al buscar por guía.
    const t = setTimeout(() => {
      listarOrdenes({ estado, fecha, guia })
        .then((d) => {
          if (!activo) return
          setOrdenes(d)
          setError(null)
        })
        .catch((e: Error) => activo && setError(e.message))
        .finally(() => activo && setCargando(false))
    }, 300)
    return () => {
      activo = false
      clearTimeout(t)
    }
  }, [estado, fecha, guia])

  const hayFiltros = estado !== '' || fecha !== '' || guia !== ''

  return (
    <div>
      <div className="encabezado">
        <h2>Órdenes</h2>
        <Link to="/ordenes/nueva" className="btn btn-primario btn-grande">
          + Nueva orden
        </Link>
      </div>

      <div className="filtros tarjeta">
        <label className="campo">
          <span>Buscar por guía</span>
          <input value={guia} onChange={(e) => setGuia(e.target.value)} placeholder="N.º de guía" />
        </label>
        <label className="campo">
          <span>Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoOrden | '')}>
            <option value="">Todos</option>
            {ESTADOS_ORDEN.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Fecha de creación</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        {hayFiltros && (
          <button
            className="btn"
            onClick={() => {
              setEstado('')
              setFecha('')
              setGuia('')
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="tarjeta tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Guía</th>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th>Dirección</th>
              <th>Productos</th>
              <th>Estado</th>
              <th>Creada</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={8} className="texto-suave">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && ordenes.length === 0 && (
              <tr>
                <td colSpan={8} className="texto-suave">
                  No hay órdenes con estos filtros.
                </td>
              </tr>
            )}
            {!cargando &&
              ordenes.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.numero_guia}</strong>
                  </td>
                  <td>{o.cliente_nombre}</td>
                  <td>{formatearTelefono(o.telefono)}</td>
                  <td>{o.direccion}</td>
                  <td>
                    {(o.orden_items ?? [])
                      .map((i) => `${i.cantidad} × ${i.productos?.nombre ?? '?'}`)
                      .join(', ')}
                  </td>
                  <td>
                    <EstadoBadge estado={o.estado} />
                  </td>
                  <td>{formatearFechaHora(o.created_at)}</td>
                  <td>
                    <Link to={`/ordenes/${o.id}`} className="btn">
                      Ver / editar
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
