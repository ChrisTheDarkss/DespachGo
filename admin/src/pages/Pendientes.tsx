import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EstadoBadge from '../components/EstadoBadge'
import FechaDialog from '../components/FechaDialog'
import MotivoDialog from '../components/MotivoDialog'
import { useAviso } from '../hooks/useAviso'
import { formatearFecha, hoyLocal } from '../lib/fechas'
import { cancelarOrden, listarOrdenes, reprogramarOrden } from '../services/ordenes'
import type { Orden } from '../types'

export default function Pendientes() {
  const { avisar } = useAviso()
  const [ordenes, setOrdenes] = useState<Orden[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aCancelar, setACancelar] = useState<Orden | null>(null)
  const [aReprogramar, setAReprogramar] = useState<Orden | null>(null)

  async function cargar() {
    setCargando(true)
    try {
      const [resueltas, atrasadas] = await Promise.all([
        listarOrdenes({ estados: ['fallida', 'entregada_parcial'] }),
        // Pendientes cuya fecha de entrega ya pasó: hay que reagendarlas
        listarOrdenes({ estado: 'pendiente', entregaAntesDe: hoyLocal() }),
      ])
      atrasadas.sort((a, b) => a.fecha_entrega.localeCompare(b.fecha_entrega))
      setOrdenes([...atrasadas, ...resueltas])
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

  async function confirmarReprogramacion(fecha: string) {
    if (!aReprogramar) return
    try {
      await reprogramarOrden(aReprogramar.id, fecha)
      avisar(
        'exito',
        `Orden ${aReprogramar.numero_guia} reprogramada para el ${formatearFecha(fecha)}.`,
      )
      setAReprogramar(null)
      await cargar()
    } catch (e) {
      setAReprogramar(null)
      setError((e as Error).message)
      avisar('error', (e as Error).message)
    }
  }

  async function confirmarCancelacion(motivo: string) {
    if (!aCancelar) return
    try {
      await cancelarOrden(aCancelar.id, motivo)
      avisar('exito', `Orden ${aCancelar.numero_guia} cancelada.`)
      setACancelar(null)
      await cargar()
    } catch (e) {
      setACancelar(null)
      setError((e as Error).message)
      avisar('error', (e as Error).message)
    }
  }

  return (
    <div>
      <div className="encabezado">
        <h2>Pendientes de resolver</h2>
      </div>
      <p className="texto-suave">
        Aquí aparecen las órdenes fallidas, las entregas parciales y las pendientes cuya fecha de
        entrega ya pasó (por ejemplo, paradas omitidas). Para las fallidas y las atrasadas puedes
        elegir una nueva fecha de entrega con «Reprogramar».
      </p>

      {error && <p className="error">{error}</p>}

      <div className="tarjeta tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th>Guía</th>
              <th>Cliente</th>
              <th>Dirección</th>
              <th>Entrega</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={6} className="texto-suave">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && ordenes.length === 0 && (
              <tr>
                <td colSpan={6} className="texto-suave">
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
                    {formatearFecha(o.fecha_entrega)}
                    {o.estado === 'pendiente' && <small className="error"> atrasada</small>}
                  </td>
                  <td>
                    <EstadoBadge estado={o.estado} />
                  </td>
                  <td>
                    {o.estado === 'fallida' || o.estado === 'pendiente' ? (
                      <div className="acciones">
                        <button
                          className="btn btn-primario"
                          onClick={() => setAReprogramar(o)}
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

      {aReprogramar && (
        <FechaDialog
          titulo={`Reprogramar orden ${aReprogramar.numero_guia}`}
          descripcion="La orden queda «pendiente» con la nueva fecha de entrega y podrás incluirla en una ruta."
          textoConfirmar="Reprogramar"
          onConfirmar={confirmarReprogramacion}
          onCerrar={() => setAReprogramar(null)}
        />
      )}

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
