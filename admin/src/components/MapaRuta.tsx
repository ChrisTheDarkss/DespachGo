import { useEffect, useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from '../lib/leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import { colorDeTramo, pesoDeTramo } from '../lib/coloresRuta'
import { MAX_PUNTOS_RUTA, calcularRuta, orsDisponible } from '../services/ors'
import type { RutaCalculada } from '../services/ors'

const CENTRO_TEMUCO: [number, number] = [-38.7359, -72.5904]

export interface PuntoMapa {
  id: string
  lat: number
  lng: number
  etiqueta: number
}

function Ajustar({ puntos }: { puntos: PuntoMapa[] }) {
  const map = useMap()
  const clave = puntos.map((p) => `${p.id}:${p.lat}:${p.lng}`).join('|')
  useEffect(() => {
    if (puntos.length === 0) return
    map.fitBounds(puntos.map((p) => [p.lat, p.lng]) as LatLngBoundsExpression, {
      padding: [40, 40],
      maxZoom: 16,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, map])
  return null
}

function icono(n: number) {
  return L.divIcon({
    className: 'pin-num',
    html: `<span>${n}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function formatearDuracion(seg: number): string {
  const min = Math.round(seg / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

/**
 * Mapa de OpenStreetMap con pines numerados. Si hay clave de OpenRouteService (key_rutas),
 * dibuja la ruta real por calles en el orden de los pines; si no, o si falla, une los
 * pines con una línea punteada.
 */
export default function MapaRuta({ puntos }: { puntos: PuntoMapa[] }) {
  const [ruta, setRuta] = useState<RutaCalculada | null>(null)
  const [cargando, setCargando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const clave = puntos.map((p) => `${p.lat},${p.lng}`).join('|')

  useEffect(() => {
    setRuta(null)
    setAviso(null)
    if (!orsDisponible || puntos.length < 2) return
    if (puntos.length > MAX_PUNTOS_RUTA) {
      setAviso(`Ruta por calles disponible hasta ${MAX_PUNTOS_RUTA} paradas.`)
      return
    }
    const ctl = new AbortController()
    setCargando(true)
    // Espera breve: al reordenar con las flechas no se consulta en cada clic.
    const t = setTimeout(() => {
      calcularRuta(
        puntos.map((p) => ({ lat: p.lat, lng: p.lng })),
        ctl.signal,
      )
        .then(setRuta)
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setAviso(`${e.message} Se muestra la línea recta.`)
        })
        .finally(() => !ctl.signal.aborted && setCargando(false))
    }, 400)
    return () => {
      clearTimeout(t)
      ctl.abort()
      setCargando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  return (
    <>
      <MapContainer center={CENTRO_TEMUCO} zoom={13} className="mapa">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Rutas &copy; <a href="https://openrouteservice.org">openrouteservice</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Ajustar puntos={puntos} />
        {(ruta
          ? ruta.tramos.map((t, i) => ({ i, positions: t, recto: false }))
          : puntos.slice(1).map((p, i) => ({
              i,
              positions: [
                [puntos[i].lat, puntos[i].lng],
                [p.lat, p.lng],
              ] as [number, number][],
              recto: true,
            }))
        )
          .reverse() // primero los de menor prioridad: los primeros tramos quedan encima
          .flatMap((t) => [
            <Polyline
              key={`${t.i}-borde`}
              positions={t.positions}
              pathOptions={{ color: '#fff', weight: pesoDeTramo(t.i) + 3, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
            />,
            <Polyline
              key={t.i}
              positions={t.positions}
              pathOptions={{
                color: colorDeTramo(t.i),
                weight: pesoDeTramo(t.i),
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round',
                ...(t.recto ? { dashArray: '2 8' } : {}),
              }}
            />,
          ])}
        {puntos.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={icono(p.etiqueta)} />
        ))}
      </MapContainer>
      {cargando && <p className="texto-suave">Calculando ruta por calles…</p>}
      {ruta && (
        <p className="texto-suave">
          Recorrido: {(ruta.distanciaM / 1000).toFixed(1)} km · {formatearDuracion(ruta.duracionS)}{' '}
          (sin contar el tiempo en cada parada)
        </p>
      )}
      {aviso && <p className="aviso">{aviso}</p>}
    </>
  )
}
