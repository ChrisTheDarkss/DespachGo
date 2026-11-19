import { useEffect, useState } from 'react'
import EstadoBadge from '../components/EstadoBadge'
import MapaRutasDia from '../components/MapaRutasDia'
import type { RutaEnMapa } from '../components/MapaRutasDia'
import { colorDeRuta } from '../lib/coloresRuta'
import { supabase } from '../lib/supabase'
import { hoyLocal } from '../lib/fechas'
import { listarRutasDelDia } from '../services/rutas'
import type { Ruta } from '../types'

export default function ResumenDia() {
  const [fecha, setFecha] = useState(hoyLocal())
  const [rutas, setRutas] = useState<Ruta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [seleccionada, setSeleccionada] = useState('')
  const [textoConductor, setTextoConductor] = useState('')
  const [envivo, setEnvivo] = useState(false)
  const [actualizado, setActualizado] = useState<Date | null>(null)

  // Carga inicial y al cambiar de fecha (con «Cargando…»).
  useEffect(() => {
    let activo = true
    setCargando(true)
    listarRutasDelDia(fecha)
      .then((r) => {
        if (!activo) return
        setRutas(r)
        setActualizado(new Date())
        setError(null)
      })
      .catch((e: Error) => activo && setError(e.message))
      .finally(() => activo && setCargando(false))
    return () => {
      activo = false
    }
  }, [fecha])

  // En vivo: recarga en silencio cuando cambia una parada o una ruta (Supabase Realtime)
  // y, por si Realtime no está activado en la base, cada 30 segundos.
  useEffect(() => {
    let activo = true
    let espera: ReturnType<typeof setTimeout> | undefined
    const recargar = () => {
      listarRutasDelDia(fecha)
        .then((r) => {
          if (!activo) return
          setRutas(r)
          setActualizado(new Date())
          setError(null)
        })
        .catch(() => {
          // se conserva lo que ya se ve; el próximo intento lo corrige
        })
    }
    // Varios cambios seguidos (p. ej. al cerrar una ruta) se juntan en una sola recarga.
    const programar = () => {
      clearTimeout(espera)
      espera = setTimeout(recargar, 400)
    }
    const canal = supabase
      .channel(`resumen-${fecha}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paradas' }, programar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rutas' }, programar)
      .subscribe((estado) => activo && setEnvivo(estado === 'SUBSCRIBED'))
    const intervalo = setInterval(recargar, 30_000)
    return () => {
      activo = false
      clearTimeout(espera)
      clearInterval(intervalo)
      supabase.removeChannel(canal)
    }
  }, [fecha])

  // Cada ruta del día tiene su color; el mismo en el mapa y en su tarjeta.
  const enMapa: RutaEnMapa[] = rutas.map((r, i) => ({
    id: r.id,
    color: colorDeRuta(i),
    puntos: (r.paradas ?? []).flatMap((p) => {
      const o = (p.parada_ordenes ?? []).map((po) => po.ordenes).find((x) => x?.latitud != null)
      return o && o.latitud != null && o.longitud != null
        ? [{ id: p.id, lat: o.latitud, lng: o.longitud, etiqueta: p.posicion_final ?? p.posicion_sugerida ?? 0 }]
        : []
    }),
  }))

  return (
    <div>
      <div className="encabezado">
        <h2>Resumen del día</h2>
        <span className={`en-vivo ${envivo ? 'activo' : ''}`} title="Se actualiza solo">
          <i /> {envivo ? 'En vivo' : 'Actualiza cada 30 s'}
          {actualizado && ` · ${actualizado.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
        </span>
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

      {rutas.length > 0 && (() => {
        // Una sola tabla: la del conductor elegido (por defecto, el primero de la lista).
        const indice = Math.max(0, rutas.findIndex((r) => r.id === seleccionada))
        const r = rutas[indice]
        const paradas = r.paradas ?? []
        const conteo = paradas.reduce<Record<string, number>>((acc, p) => {
          acc[p.estado] = (acc[p.estado] ?? 0) + 1
          return acc
        }, {})
        return (
          <>
            <section className="tarjeta ruta" style={{ borderLeft: `6px solid ${colorDeRuta(indice)}` }}>
              <div className="encabezado">
                <h3>
                  <i className="punto-ruta" style={{ background: colorDeRuta(indice) }} />
                  {r.perfiles?.nombre ?? 'Conductor'} <EstadoBadge estado={r.estado} />
                </h3>
                <span className="texto-suave">
                  {paradas.length} {paradas.length === 1 ? 'parada' : 'paradas'}
                  {Object.entries(conteo).map(([estado, n]) => ` · ${n} ${estado.replace('_', ' ')}`)}
                </span>
              </div>
              <MapaRutasDia rutas={enMapa.filter((m) => m.id === r.id)} />
              <div className="filtros">
                <label className="campo">
                  <span>Conductor (escribe para buscar)</span>
                  <input
                    list="lista-conductores"
                    value={textoConductor}
                    placeholder={r.perfiles?.nombre ?? 'Conductor'}
                    autoComplete="off"
                    onChange={(e) => {
                      const texto = e.target.value
                      setTextoConductor(texto)
                      const q = texto.trim().toLowerCase()
                      if (!q) return
                      // Coincidencia exacta, o única entre los conductores del día
                      const nombre = (x: Ruta) => (x.perfiles?.nombre ?? '').toLowerCase()
                      const exacta = rutas.find((x) => nombre(x) === q)
                      const parciales = rutas.filter((x) => nombre(x).includes(q))
                      const elegida = exacta ?? (parciales.length === 1 ? parciales[0] : null)
                      if (elegida) setSeleccionada(elegida.id)
                    }}
                    onBlur={() => setTextoConductor('')}
                  />
                  <datalist id="lista-conductores">
                    {rutas.map((x) => (
                      <option key={x.id} value={x.perfiles?.nombre ?? 'Conductor'} />
                    ))}
                  </datalist>
                  {textoConductor.trim() &&
                    !rutas.some((x) =>
                      (x.perfiles?.nombre ?? '').toLowerCase().includes(textoConductor.trim().toLowerCase()),
                    ) && <small className="error">Ningún conductor con ruta este día coincide.</small>}
                </label>
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
                  {paradas.length === 0 && (
                    <tr>
                      <td colSpan={5} className="texto-suave">
                        Esta ruta aún no tiene paradas.
                      </td>
                    </tr>
                  )}
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
          </>
        )
      })()}

      <p className="texto-suave">
        Próximamente: fotos de las guías (4-17) y mapa en vivo de los conductores (4-20).
      </p>
    </div>
  )
}
