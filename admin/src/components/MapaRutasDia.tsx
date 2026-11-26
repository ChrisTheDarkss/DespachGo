import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from '../lib/leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import { colorDeTramo, ordenarPorPrioridad, pesoDeTramo } from '../lib/coloresRuta'
import type { TramoDibujable } from '../lib/coloresRuta'
import { MAX_PUNTOS_RUTA, calcularRuta, orsDisponible } from '../services/ors'
import type { PuntoMapa } from './MapaRuta'

const CENTRO_TEMUCO: [number, number] = [-38.7359, -72.5904]

export interface RutaEnMapa {
  id: string
  color: string
  puntos: PuntoMapa[]
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

function icono(n: number, color: string) {
  return L.divIcon({
    className: 'pin-num',
    html: `<span style="background:${color}">${n}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

/** Mapa con todas las rutas del día; cada tramo entre dos paradas tiene su color (calles reales si hay key_rutas). */
export default function MapaRutasDia({ rutas }: { rutas: RutaEnMapa[] }) {
  const [lineas, setLineas] = useState<Record<string, [number, number][][]>>({})

  const clave = rutas.map((r) => `${r.id}:${r.puntos.map((p) => `${p.lat},${p.lng}`).join(';')}`).join('|')
  const todos = useMemo(() => rutas.flatMap((r) => r.puntos), [clave]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLineas({})
    if (!orsDisponible) return
    const ctl = new AbortController()
    for (const r of rutas) {
      if (r.puntos.length < 2 || r.puntos.length > MAX_PUNTOS_RUTA) continue
      calcularRuta(
        r.puntos.map((p) => ({ lat: p.lat, lng: p.lng })),
        ctl.signal,
      )
        .then((c) => setLineas((l) => ({ ...l, [r.id]: c.tramos })))
        .catch(() => {
          // se queda la línea recta de esa ruta
        })
    }
    return () => ctl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  // Todos los tramos de todas las rutas; el color depende del orden de visita (prioridad).
  const tramos: TramoDibujable[] = rutas.flatMap((r, ri): TramoDibujable[] =>
    lineas[r.id]
      ? lineas[r.id].map((t, i) => ({ clave: `${r.id}-${i}`, orden: i, ruta: ri, puntos: t, recto: false }))
      : r.puntos.slice(1).map((p, i) => ({
          clave: `${r.id}-${i}`,
          orden: i,
          ruta: ri,
          puntos: [
            [r.puntos[i].lat, r.puntos[i].lng],
            [p.lat, p.lng],
          ] as [number, number][],
          recto: true,
        })),
  )

  return (
    <MapContainer center={CENTRO_TEMUCO} zoom={13} className="mapa">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Rutas &copy; <a href="https://openrouteservice.org">openrouteservice</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Ajustar puntos={todos} />
      {ordenarPorPrioridad(tramos).flatMap((t) => {
        const peso = pesoDeTramo(t.orden)
        return [
          // Borde blanco: separa cada línea del mapa y de las demás
          <Polyline
            key={`${t.clave}-borde`}
            positions={t.puntos}
            pathOptions={{ color: '#fff', weight: peso + 3, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
          />,
          <Polyline
            key={t.clave}
            positions={t.puntos}
            pathOptions={{
              color: colorDeTramo(t.orden),
              weight: peso,
              opacity: 1,
              lineCap: 'round',
              lineJoin: 'round',
              ...(t.recto ? { dashArray: '2 8' } : {}),
            }}
          />,
        ]
      })}
      {rutas.flatMap((r) =>
        r.puntos.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={icono(p.etiqueta, r.color)} />
        )),
      )}
    </MapContainer>
  )
}
