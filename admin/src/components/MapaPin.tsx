import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { Marker as LeafletMarker } from 'leaflet'
import '../lib/leaflet'
import type { Coordenadas } from '../types'

const CENTRO_TEMUCO: [number, number] = [-38.7359, -72.5904]

function Clicks({ onPick }: { onPick: (c: Coordenadas) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

function Enfocar({ destino }: { destino: Coordenadas | null | undefined }) {
  const map = useMap()
  useEffect(() => {
    if (destino) map.setView([destino.lat, destino.lng], 17)
  }, [destino, map])
  return null
}

interface Props {
  pos: Coordenadas | null
  /** Al cambiar este valor el mapa se centra ahí (p. ej. tras buscar una dirección). */
  enfocar?: Coordenadas | null
  onChange: (c: Coordenadas) => void
  deshabilitado?: boolean
}

/** Mapa con un pin que se puede arrastrar o mover haciendo clic. */
export default function MapaPin({ pos, enfocar, onChange, deshabilitado }: Props) {
  const markerRef = useRef<LeafletMarker | null>(null)

  const handlers = useMemo(
    () => ({
      dragend() {
        const m = markerRef.current
        if (m) {
          const p = m.getLatLng()
          onChange({ lat: p.lat, lng: p.lng })
        }
      },
    }),
    [onChange],
  )

  return (
    <MapContainer
      center={pos ? [pos.lat, pos.lng] : CENTRO_TEMUCO}
      zoom={pos ? 17 : 13}
      className="mapa"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {!deshabilitado && <Clicks onPick={onChange} />}
      <Enfocar destino={enfocar} />
      {pos && (
        <Marker
          position={[pos.lat, pos.lng]}
          draggable={!deshabilitado}
          eventHandlers={handlers}
          ref={markerRef}
        />
      )}
    </MapContainer>
  )
}
