import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from '../lib/leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import { escucharPosiciones, ultimasPosiciones } from '../services/ubicaciones'
import type { EstadoConexion, Posicion } from '../services/ubicaciones'

const CENTRO_TEMUCO: [number, number] = [-38.7359, -72.5904]
const MINUTOS_DESACTUALIZADA = 10

export interface ConductorRuta {
  id: string
  nombre: string
}

function hace(hora: string | null, ahora: number): { texto: string; viejo: boolean } {
  if (!hora) return { texto: 'sin hora', viejo: false }
  const min = Math.max(0, Math.round((ahora - new Date(hora).getTime()) / 60000))
  return {
    texto: min < 1 ? 'ahora' : min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h`,
    viejo: min >= MINUTOS_DESACTUALIZADA,
  }
}

function icono(nombre: string, viejo: boolean) {
  return L.divIcon({
    className: `pin-cond${viejo ? ' pin-cond-viejo' : ''}`,
    html: `<span>${nombre.replace(/[<>&"]/g, '')}</span>`,
    iconSize: [0, 0],
  })
}

function Ajustar({ posiciones }: { posiciones: Posicion[] }) {
  const map = useMap()
  // Solo reajusta el zoom cuando aparece un conductor nuevo, no en cada movimiento.
  const clave = posiciones.map((p) => p.conductor_id).sort().join('|')
  useEffect(() => {
    if (posiciones.length === 0) return
    map.fitBounds(posiciones.map((p) => [p.lat, p.lng]) as LatLngBoundsExpression, {
      padding: [50, 50],
      maxZoom: 15,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, map])
  return null
}

/** Mapa con la última posición de cada conductor del día, actualizado en vivo. */
export default function ConductoresEnVivo({ conductores }: { conductores: ConductorRuta[] }) {
  const [posiciones, setPosiciones] = useState<Record<string, Posicion>>({})
  const [conexion, setConexion] = useState<EstadoConexion>('conectando')
  const [error, setError] = useState<string | null>(null)
  const [ahora, setAhora] = useState(Date.now())

  const clave = conductores.map((c) => c.id).sort().join('|')

  useEffect(() => {
    const ids = conductores.map((c) => c.id)
    let activo = true
    setConexion('conectando')
    ultimasPosiciones(ids)
      .then((p) => activo && (setPosiciones(p), setError(null)))
      .catch((e: Error) => activo && setError(e.message))
    const parar = escucharPosiciones(
      ids,
      (p) => activo && setPosiciones((prev) => ({ ...prev, [p.conductor_id]: p })),
      (e) => activo && setConexion(e),
    )
    const reloj = setInterval(() => setAhora(Date.now()), 30000)
    return () => {
      activo = false
      parar()
      clearInterval(reloj)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  const conPosicion = useMemo(
    () => conductores.filter((c) => posiciones[c.id]),
    [conductores, posiciones],
  )
  const sinPosicion = conductores.filter((c) => !posiciones[c.id])

  return (
    <section className="tarjeta">
      <div className="encabezado">
        <h3>Conductores en vivo</h3>
        <span className={`estado-vivo estado-${conexion}`}>
          {conexion === 'en_vivo' ? '● En vivo' : conexion === 'caida' ? '● Sin conexión' : '● Conectando…'}
        </span>
      </div>

      {error && <p className="error">No se pudieron cargar las ubicaciones: {error}</p>}

      <MapContainer center={CENTRO_TEMUCO} zoom={13} className="mapa">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Ajustar posiciones={conPosicion.map((c) => posiciones[c.id])} />
        {conPosicion.map((c) => {
          const p = posiciones[c.id]
          const { viejo } = hace(p.hora, ahora)
          return <Marker key={c.id} position={[p.lat, p.lng]} icon={icono(c.nombre, viejo)} />
        })}
      </MapContainer>

      <ul className="lista-vivo">
        {conductores.map((c) => {
          const p = posiciones[c.id]
          const h = p ? hace(p.hora, ahora) : null
          return (
            <li key={c.id}>
              <strong>{c.nombre}</strong>{' '}
              <span className={h?.viejo ? 'error' : 'texto-suave'}>
                {h ? `· ${h.texto}${h.viejo ? ' (posición desactualizada)' : ''}` : '· sin ubicación todavía'}
              </span>
            </li>
          )
        })}
      </ul>
      {sinPosicion.length === conductores.length && !error && (
        <p className="texto-suave">
          Aún no hay ubicaciones de hoy. Aparecerán cuando el conductor inicie la ruta en la app.
        </p>
      )}
    </section>
  )
}
