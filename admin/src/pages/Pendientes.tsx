import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EstadoBadge from '../components/EstadoBadge'
import MotivoDialog from '../components/MotivoDialog'
import { cancelarOrden, listarOrdenes, reprogramarOrden } from '../services/ordenes'
import type { Orden } from '../types'

export default function Pendientes() {
  const [ordenes, setOrdenes] = useState<Orden[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aCancelar, setACancelar] = useState<Orden | null>(null)
  const [ocupada, setOcupada] = useState<string | null>(null)

  async function cargar() {
    setCargando(true)
    try {
      setOrdenes(await listarOrdenes({ estados: ['fallida', 'parcial'] }))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  async function reprogramar(o: Orden) {
    setOcupada(o.id)
    try {
      await reprogramarOrden(o.id)
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupada(null)
    }
  }

  async function confirmarCancelacion(motivo: string) {
    if (!aCancelar) return
    try {
      await cancelarOrden(aCancelar.id, motivo)
      setACancelar(null)
      await cargar()
    } catch (e) {
      setACancelar(null)
      setError((e as Error).message)
    }
  }

  return (
    <div>
      <div className="encabezado">
        <h2>Pendientes de resolver</h2>
      </div>
      <p className="texto-suave">
        Las paradas omitidas vuelven solas a «pendiente» al finalizar la ruta y aparecen en Órdenes
        y en Armar ruta.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="tarjeta tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Guía</th>
              <th>Cliente</th>
              <th>Dirección</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={5} className="texto-suave">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && ordenes.length === 0 && (
              <tr>
                <td colSpan={5} className="texto-suave">
                  No hay nada por resolver.
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
                  <td>{o.direccion}</td>
                  <td>
                    <EstadoBadge estado={o.estado} />
                  </td>
                  <td>
                    {o.estado === 'fallida' ? (
                      <div className="acciones">
                        <button
                          className="btn btn-primario"
                          onClick={() => reprogramar(o)}
                          disabled={ocupada === o.id}
                        >
                          Reprogramar
                        </button>
                        <button className="btn btn-peligro" onClick={() => setACancelar(o)}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <span className="texto-suave">
                        Entrega parcial: el saldo se gestionará con «orden con saldo» (4-19).{' '}
                        <Link to={`/ordenes/${o.id}`}>Ver</Link>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {aCancelar && (
        <MotivoDialog
          titulo={`Cancelar orden ${aCancelar.numero_guia}`}
          descripcion="La orden no se borra: queda como «cancelada» con el motivo."
          textoConfirmar="Cancelar orden"
          onConfirmar={confirmarCancelacion}
          onCerrar={() => setACancelar(null)}
        />
      )}
    </div>
  )
}
