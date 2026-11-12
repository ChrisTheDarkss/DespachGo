import { useEffect, useMemo, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'
import MapaRuta from '../components/MapaRuta'
import type { PuntoMapa } from '../components/MapaRuta'
import { useAviso } from '../hooks/useAviso'
import { formatearFecha, hoyLocal } from '../lib/fechas'
import { formatearTelefono } from '../lib/telefono'
import { validarFechaRuta } from '../lib/validaciones'
import { listarOrdenes } from '../services/ordenes'
import { optimizarOrden } from '../services/optimizacion'
import { asignarRuta, listarConductores } from '../services/rutas'
import type { Orden, Perfil } from '../types'

/**
 * Misma regla que usa asignar_ruta en la base de datos: las órdenes con el mismo
 * teléfono y la misma dirección (sin importar mayúsculas) forman una sola parada.
 */
function claveDeParada(o: Orden): string {
  return `${o.cliente_telefono}|${o.direccion.trim().toLowerCase()}`
}

/** Vista previa: número de parada que tendría cada orden, en el orden recibido. */
function calcularParadas(ordenes: Orden[], agrupar: boolean) {
  const mapa = new Map<string, number>()
  let n = 0
  return ordenes.map((o) => {
    const clave = claveDeParada(o)
    const existente = mapa.get(clave)
    if (agrupar && existente !== undefined) return { numero: existente, repetida: true }
    n += 1
    if (agrupar) mapa.set(clave, n)
    return { numero: n, repetida: false }
  })
}

export default function ArmarRuta() {
  const { avisar } = useAviso()
  const [confirmando, setConfirmando] = useState<{
    nombre: string
    resumen: string
    adelantadas: number
  } | null>(null)
  const [pendientes, setPendientes] = useState<Orden[]>([])
  const [conductores, setConductores] = useState<Perfil[]>([])
  const [seleccion, setSeleccion] = useState<string[]>([]) // ids en orden de visita
  const [fecha, setFecha] = useState(hoyLocal())
  const [conductorId, setConductorId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [agrupar, setAgrupar] = useState(true)
  const [verProgramadas, setVerProgramadas] = useState(false)
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
      // Primero las que se entregan antes (las atrasadas quedan arriba)
      ords.sort(
        (a, b) =>
          a.fecha_entrega.localeCompare(b.fecha_entrega) ||
          a.numero_guia.localeCompare(b.numero_guia),
      )
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

  const paradas = calcularParadas(ordenesSeleccionadas, agrupar)
  const totalParadas = paradas.length > 0 ? paradas[paradas.length - 1].numero : 0

  const puntos: PuntoMapa[] = ordenesSeleccionadas
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.latitud != null && o.longitud != null)
    .map(({ o, i }) => ({
      id: o.id,
      lat: o.latitud as number,
      lng: o.longitud as number,
      etiqueta: paradas[i].numero,
    }))

  // Órdenes programadas para después de la fecha de la ruta (se ocultan salvo que se pida verlas)
  const programadasDespues = pendientes.filter((o) => o.fecha_entrega > fecha).length

  const filtradas = pendientes.filter((o) => {
    if (!verProgramadas && o.fecha_entrega > fecha && !seleccion.includes(o.id)) return false
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
      avisar('exito', 'Ruta optimizada. Revisa el orden sugerido y ajústalo si hace falta.')
    } catch (e) {
      setError((e as Error).message)
      avisar('error', (e as Error).message)
    } finally {
      setOptimizando(false)
    }
  }

  const errorFecha = validarFechaRuta(fecha)

  /** Paso 1: valida y, si todo está bien, pide confirmación. */
  function pedirAsignacion() {
    setError(null)
    setExito(null)
    if (errorFecha) return setError(errorFecha)
    if (!conductorId) return setError('Elige un conductor.')
    if (seleccion.length === 0) return setError('Selecciona al menos una orden.')
    if (ordenesSeleccionadas.length !== seleccion.length) {
      return setError('Alguna orden seleccionada ya no está pendiente. Recarga la página.')
    }
    const conductor = conductores.find((c) => c.id === conductorId)
    if (!conductor) return setError('El conductor elegido ya no está disponible. Elige otro.')
    setConfirmando({
      nombre: conductor.nombre,
      resumen: `${seleccion.length} ${seleccion.length === 1 ? 'orden' : 'órdenes'} en ${totalParadas} ${totalParadas === 1 ? 'parada' : 'paradas'}`,
      adelantadas: ordenesSeleccionadas.filter((o) => o.fecha_entrega > fecha).length,
    })
  }

  /** Paso 2: el usuario confirmó; se crea la ruta. */
  async function confirmarAsignacion() {
    if (!confirmando) return
    const { nombre, resumen } = confirmando
    setAsignando(true)
    try {
      await asignarRuta(fecha, conductorId, seleccion, agrupar)
      setConfirmando(null)
      avisar('exito', `Ruta asignada a ${nombre} para el ${formatearFecha(fecha)}: ${resumen}.`)
      setSeleccion([])
      setSugerido(false)
      await cargar()
    } catch (e) {
      setConfirmando(null)
      setError((e as Error).message)
      avisar('error', (e as Error).message)
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
          <input
            type="date"
            value={fecha}
            min={hoyLocal()}
            aria-invalid={!!errorFecha}
            onChange={(e) => setFecha(e.target.value)}
          />
          {errorFecha && <small className="error">{errorFecha}</small>}
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
          <h3>Órdenes pendientes ({filtradas.length})</h3>
          <input
            className="buscador"
            placeholder="Buscar por guía, cliente o dirección"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {programadasDespues > 0 && (
            <label className="check">
              <input
                type="checkbox"
                checked={verProgramadas}
                onChange={(e) => setVerProgramadas(e.target.checked)}
              />
              <span>
                Mostrar también las programadas para después del {formatearFecha(fecha)} (
                {programadasDespues})
              </span>
            </label>
          )}
          <div className="lista-scroll">
            {cargando && <p className="texto-suave">Cargando…</p>}
            {!cargando && filtradas.length === 0 && (
              <p className="texto-suave">No hay órdenes pendientes para esta fecha.</p>
            )}
            {filtradas.map((o) => {
              const sinPin = o.latitud == null || o.longitud == null
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
                      {o.direccion} · {formatearTelefono(o.cliente_telefono)}
                    </small>
                    <br />
                    {o.fecha_entrega < fecha && (
                      <small className="error">
                        Atrasada: era para el {formatearFecha(o.fecha_entrega)}
                      </small>
                    )}
                    {o.fecha_entrega === fecha && (
                      <small className="texto-suave">Entrega el {formatearFecha(o.fecha_entrega)}</small>
                    )}
                    {o.fecha_entrega > fecha && (
                      <small className="texto-suave">
                        Programada para el {formatearFecha(o.fecha_entrega)}
                      </small>
                    )}
                    {sinPin && <small className="error"> · Sin ubicación: edita la orden.</small>}
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
            <label className="check">
              <input
                type="checkbox"
                checked={agrupar}
                onChange={(e) => setAgrupar(e.target.checked)}
              />
              <span>
                Agrupar órdenes del mismo cliente y dirección en una sola parada (recomendado)
              </span>
            </label>
            {seleccion.length > 0 && (
              <p className="texto-suave">
                {seleccion.length} {seleccion.length === 1 ? 'orden' : 'órdenes'} en {totalParadas}{' '}
                {totalParadas === 1 ? 'parada' : 'paradas'}
                {agrupar && totalParadas < seleccion.length
                  ? ` (se agrupan ${seleccion.length - totalParadas})`
                  : ''}
                .
              </p>
            )}
            {sugerido && (
              <p className="aviso">Orden sugerido por la optimización. Puedes ajustarlo antes de asignar.</p>
            )}
            {ordenesSeleccionadas.length === 0 && (
              <p className="texto-suave">Marca órdenes de la lista para armar la ruta.</p>
            )}
            <ol className="orden-visita">
              {ordenesSeleccionadas.map((o, i) => (
                <li key={o.id}>
                  <span className="num">{paradas[i].numero}</span>
                  <span className="grow">
                    <strong>{o.numero_guia}</strong> · {o.cliente_nombre}
                    <br />
                    <small>{o.direccion}</small>
                    {paradas[i].repetida && (
                      <>
                        <br />
                        <small className="texto-suave">
                          Mismo cliente y dirección: se entrega en la parada {paradas[i].numero}
                        </small>
                      </>
                    )}
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
                onClick={pedirAsignacion}
                disabled={asignando || optimizando || seleccion.length === 0 || !!errorFecha}
              >
                {asignando ? 'Asignando…' : 'Asignar'}
              </button>
            </div>
          </div>
        </section>
      </div>

      {confirmando && (
        <ConfirmDialog
          titulo="Asignar ruta"
          descripcion={
            <>
              <p>
                ¿Asignar {confirmando.resumen} a <strong>{confirmando.nombre}</strong> para el{' '}
                {formatearFecha(fecha)}?
              </p>
              {confirmando.adelantadas > 0 && (
                <p className="aviso">
                  {confirmando.adelantadas}{' '}
                  {confirmando.adelantadas === 1
                    ? 'orden tiene fecha de entrega posterior'
                    : 'órdenes tienen fecha de entrega posterior'}{' '}
                  al {formatearFecha(fecha)}.
                </p>
              )}
            </>
          }
          textoConfirmar="Asignar ruta"
          onConfirmar={confirmarAsignacion}
          onCerrar={() => setConfirmando(null)}
        />
      )}
    </div>
  )
}
