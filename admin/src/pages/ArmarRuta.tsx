import { useEffect, useMemo, useState } from 'react'
import MapaRuta from '../components/MapaRuta'
import type { PuntoMapa } from '../components/MapaRuta'
import { hoyLocal } from '../lib/fechas'
import { formatearTelefono } from '../lib/telefono'
import { listarOrdenes } from '../services/ordenes'
import { optimizarOrden } from '../services/optimizacion'
import { asignarRuta, listarConductores } from '../services/rutas'
import type { Orden, Perfil } from '../types'

export default function ArmarRuta() {
  const [pendientes, setPendientes] = useState<Orden[]>([])
  const [conductores, setConductores] = useState<Perfil[]>([])
  const [seleccion, setSeleccion] = useState<string[]>([]) // ids en orden de visita
  const [fecha, setFecha] = useState(hoyLocal())
  const [conductorId, setConductorId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [optimizando, setOptimizando] = useState(false)
  const [asignando, setAsignando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [sugerido, setSugerido] = useState(false)

  async function cargar() {
    setCargando(true)
    try {
      const [ords, conds] = await Promise.all([
        listarOrdenes({ estado: 'pendiente' }),
        listarConductores(),
      ])
      setPendientes(ords)
      setConductores(conds)
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

  const porId = useMemo(() => new Map(pendientes.map((o) => [o.id, o])), [pendientes])

  const ordenesSeleccionadas = seleccion
    .map((id) => porId.get(id))
    .filter((o): o is Orden => !!o)

  const puntos: PuntoMapa[] = ordenesSeleccionadas
    .filter((o) => o.lat != null && o.lng != null)
    .map((o, i) => ({ id: o.id, lat: o.lat as number, lng: o.lng as number, etiqueta: i + 1 }))

  const filtradas = pendientes.filter((o) => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return true
    return (
      o.numero_guia.toLowerCase().includes(q) ||
      o.cliente_nombre.toLowerCase().includes(q) ||
      o.direccion.toLowerCase().includes(q)
    )
  })

  function alternar(id: string) {
    setExito(null)
    setSugerido(false)
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  function mover(indice: number, delta: -1 | 1) {
    const destino = indice + delta
    if (destino < 0 || destino >= seleccion.length) return
    const copia = [...seleccion]
    ;[copia[indice], copia[destino]] = [copia[destino], copia[indice]]
    setSeleccion(copia)
    setSugerido(false)
  }

  async function optimizar() {
    setError(null)
    setExito(null)
    if (puntos.length < 3) {
      setError('Selecciona al menos 3 órdenes para optimizar.')
      return
    }
    setOptimizando(true)
    try {
      const orden = await optimizarOrden(puntos.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng })))
      setSeleccion(orden)
      setSugerido(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOptimizando(false)
    }
  }

  async function asignar() {
    setError(null)
    setExito(null)
    if (!conductorId) return setError('Elige un conductor.')
    if (!fecha) return setError('Elige la fecha de la ruta.')
    if (seleccion.length === 0) return setError('Selecciona al menos una orden.')
    const conductor = conductores.find((c) => c.id === conductorId)
    if (
      !window.confirm(
        `¿Asignar ${seleccion.length} paradas a ${conductor?.nombre ?? 'el conductor'} para el ${fecha}?`,
      )
    ) {
      return
    }
    setAsignando(true)
    try {
      await asignarRuta(fecha, conductorId, seleccion)
      setExito(`Ruta asignada a ${conductor?.nombre ?? 'el conductor'} con ${seleccion.length} paradas.`)
      setSeleccion([])
      setSugerido(false)
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAsignando(false)
    }
  }

  return (
    <div>
      <div className="encabezado">
        <h2>Armar ruta</h2>
      </div>

      <div className="filtros tarjeta">
        <label className="campo">
          <span>Fecha de la ruta</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label className="campo">
          <span>Conductor</span>
          <select value={conductorId} onChange={(e) => setConductorId(e.target.value)}>
            <option value="">Elegir…</option>
            {conductores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {exito && <p className="exito">{exito}</p>}

      <div className="armar">
        <section className="tarjeta">
          <h3>Órdenes pendientes ({pendientes.length})</h3>
          <input
            className="buscador"
            placeholder="Buscar por guía, cliente o dirección"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <div className="lista-scroll">
            {cargando && <p className="texto-suave">Cargando…</p>}
            {!cargando && filtradas.length === 0 && (
              <p className="texto-suave">No hay órdenes pendientes.</p>
            )}
            {filtradas.map((o) => {
              const sinPin = o.lat == null || o.lng == null
              const marcada = seleccion.includes(o.id)
              return (
                <label key={o.id} className={`item-orden ${marcada ? 'marcada' : ''}`}>
                  <input
                    type="checkbox"
                    checked={marcada}
                    disabled={sinPin}
                    onChange={() => alternar(o.id)}
                  />
                  <div>
                    <strong>{o.numero_guia}</strong> · {o.cliente_nombre}
                    <br />
                    <small>
                      {o.direccion} · {formatearTelefono(o.telefono)}
                    </small>
                    {sinPin && <small className="error"> Sin ubicación: edita la orden.</small>}
                  </div>
                </label>
              )
            })}
          </div>
        </section>

        <section className="columna">
          <div className="tarjeta">
            <MapaRuta puntos={puntos} />
          </div>

          <div className="tarjeta">
            <h3>Orden de visita ({seleccion.length})</h3>
            {sugerido && (
              <p className="aviso">Orden sugerido por la optimización. Puedes ajustarlo antes de asignar.</p>
            )}
            {ordenesSeleccionadas.length === 0 && (
              <p className="texto-suave">Marca órdenes de la lista para armar la ruta.</p>
            )}
            <ol className="orden-visita">
              {ordenesSeleccionadas.map((o, i) => (
                <li key={o.id}>
                  <span className="num">{i + 1}</span>
                  <span className="grow">
                    <strong>{o.numero_guia}</strong> · {o.cliente_nombre}
                    <br />
                    <small>{o.direccion}</small>
                  </span>
                  <button
                    className="btn btn-icono"
                    onClick={() => mover(i, -1)}
                    disabled={i === 0}
                    aria-label="Subir"
                  >
                    ↑
                  </button>
                  <button
                    className="btn btn-icono"
                    onClick={() => mover(i, 1)}
                    disabled={i === ordenesSeleccionadas.length - 1}
                    aria-label="Bajar"
                  >
                    ↓
                  </button>
                  <button className="btn btn-icono" onClick={() => alternar(o.id)} aria-label="Quitar">
                    ✕
                  </button>
                </li>
              ))}
            </ol>
            <div className="acciones">
              <button
                className="btn btn-grande"
                onClick={optimizar}
                disabled={optimizando || asignando || puntos.length < 3}
              >
                {optimizando ? 'Optimizando…' : 'Optimizar'}
              </button>
              <button
                className="btn btn-primario btn-grande"
                onClick={asignar}
                disabled={asignando || optimizando || seleccion.length === 0}
              >
                {asignando ? 'Asignando…' : 'Asignar'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
