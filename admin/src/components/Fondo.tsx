import { useMemo } from 'react'
import type { CSSProperties } from 'react'

// Generador pseudo-aleatorio con semilla: así las torres no cambian al renderizar de nuevo.
function azar(semilla: number) {
  let x = semilla
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296
    return x / 4294967296
  }
}

/** Fondo decorativo: columnas azules translúcidas que flotan sobre un degradado oscuro. */
export default function Fondo() {
  const torres = useMemo(() => {
    const r = azar(2000)
    return Array.from({ length: 34 }, (_, i) => ({
      key: i,
      style: {
        left: `${(i / 34) * 100 + (r() - 0.5) * 2}%`,
        width: `${10 + r() * 26}px`,
        height: `${25 + r() * 55}%`,
        '--dur': `${9 + r() * 12}s`,
        '--delay': `-${r() * 20}s`,
      } as CSSProperties,
    }))
  }, [])

  return (
    <>
      <div className="fondo-torres" aria-hidden="true">
        {torres.map((t) => (
          <span key={t.key} className="torre" style={t.style} />
        ))}
      </div>
      <div className="fondo-neblina" aria-hidden="true" />
    </>
  )
}
