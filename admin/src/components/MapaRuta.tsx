import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from '../lib/leaflet'
import type { LatLngBoundsExpression } from 'leaflet'

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

/** Mapa de solo lectura con pines numerados unidos por una línea. */
export default function MapaRuta({ puntos }: { puntos: PuntoMapa[] }) {
  return (
    <MapContainer center={CENTRO_TEMUCO} zoom={13} className="mapa">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Ajustar puntos={puntos} />
      {puntos.length > 1 && (
        <Polyline
          positions={puntos.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{ color: '#15803d', weight: 3, opacity: 0.6, dashArray: '6 6' }}
        />
      )}
      {puntos.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={icono(p.etiqueta)} />
      ))}
    </MapContainer>
  )
}
