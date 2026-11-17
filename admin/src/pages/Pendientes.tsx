import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import EstadoBadge from '../components/EstadoBadge'
import FechaDialog from '../components/FechaDialog'
import MotivoDialog from '../components/MotivoDialog'
import SaldoDialog from '../components/SaldoDialog'
import { useAviso } from '../hooks/useAviso'
import { formatearFecha, hoyLocal } from '../lib/fechas'
import { cancelarOrden, listarOmitidas, listarOrdenes, reprogramarOrden } from '../services/ordenes'
import { crearOrdenSaldo, guiaDeSaldo } from '../services/saldos'
import type { ItemSaldo } from '../services/saldos'
import type { Orden } from '../types'

export default function Pendientes() {
  const { avisar } = useAviso()
  const [ordenes, setOrdenes] = useState<Orden[]>([])
  const [omitidas, setOmitidas] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [avisoOmitidas, setAvisoOmitidas] = useState<string | null>(null)
  const [aCancelar, setACancelar] = useState<Orden | null>(null)
  const [aReprogramar, setAReprogramar] = useState<Orden | null>(null)
  const [conSaldo, setConSaldo] = useState<Orden | null>(null)

  async function cargar() {
    setCargando(true)
    setAvisoOmitidas(null)
    try {
      const hoy = hoyLocal()
      const [resueltas, atrasadas, deOmitidas] = await Promise.all([
        listarOrdenes({ estados: ['fallida', 'entregada_parcial'] }),
        // Pendientes cuya fecha de entrega ya pasó: hay que reagendarlas
        listarOrdenes({ estado: 'pendiente', entregaAntesDe: hoy }),
        // Órdenes de paradas omitidas; si falla, el resto de la pantalla igual se ve
        listarOmitidas(hoy).catch((e: Error) => {
          setAvisoOmitidas(e.message)
          return [] as Orden[]
        }),
      ])

      // Las parciales cuyo saldo ya se creó dejan de estar pendientes
      const parciales = resueltas.filter((o) => o.estado === 'entregada_parcial')
      const yaResueltas = new Set<string>()
      await Promise.all(
        parciales.map(async (o) => {
          try {
            if (await guiaDeSaldo(o.numero_guia)) yaResueltas.add(o.id)
          } catch {
            /* si no se puede comprobar, se deja la orden visible */
          }
        }),
      )

      atrasadas.sort((a, b) => a.fecha_entrega.localeCompare(b.fecha_entrega))
      const vistos = new Set<string>()
      const lista: Orden[] = []
      for (const o of [...atrasadas, ...deOmitidas, ...resueltas]) {
        if (vistos.has(o.id) || yaResueltas.has(o.id)) continue
        vistos.add(o.id)
        lista.push(o)
      }
      setOmitidas(new Set(deOmitidas.map((o) => o.id)))
      setOrdenes(lista)
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

  async function confirmarSaldo(fecha: string, items: ItemSaldo[]) {
    if (!conSaldo) return
    try {
      const guia = await crearOrdenSaldo(conSaldo, items, fecha)
      avisar(
        'exito',
        `Orden ${guia} creada con el saldo de ${conSaldo.numero_guia} para el ${formatearFecha(fecha)}.`,
      )
      setConSaldo(null)
      await cargar()
    } catch (e) {
      avisar('error', (e as Error).message)
    }
  }

  return (
    <div>
      <div className="encabezado">
        <h2>Pendientes de resolver</h2>
      </div>
      <p className="texto-suave">
        Aquí aparecen las órdenes fallidas, las omitidas, las pendientes con fecha vencida y las
        entregas parciales. Para las fallidas, omitidas y atrasadas puedes elegir una nueva fecha con
        «Reprogramar» o cancelarlas. En las parciales, «Crear orden con saldo» genera una orden
        nueva con lo que faltó entregar.
      </p>

      {error && <p className="error">{error}</p>}
      {avisoOmitidas && (
        <p className="error">No se pudieron buscar las paradas omitidas: {avisoOmitidas}</p>
      )}

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
                    {o.estado === 'pendiente' && o.fecha_entrega < hoyLocal() && (
                      <small className="error"> atrasada</small>
                    )}
                  </td>
                  <td>
                    <EstadoBadge estado={o.estado} />
                    {omitidas.has(o.id) && <small className="texto-suave"> · omitida</small>}
                  </td>
                  <td>
                    {o.estado === 'fallida' || o.estado === 'pendiente' ? (
                      <div className="acciones">
                        <button className="btn btn-primario" onClick={() => setAReprogramar(o)}>
                          Reprogramar
                        </button>
                        <button className="btn btn-peligro" onClick={() => setACancelar(o)}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="acciones">
                        <button className="btn btn-primario" onClick={() => setConSaldo(o)}>
                          Crear orden con saldo
                        </button>
                        <Link className="btn" to={`/ordenes/${o.id}`}>
                          Ver
                        </Link>
                      </div>
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

      {conSaldo && (
        <SaldoDialog orden={conSaldo} onConfirmar={confirmarSaldo} onCerrar={() => setConSaldo(null)} />
      )}
    </div>
  )
}
