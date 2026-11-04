import type { ItemOrden, Producto } from '../types'

interface Props {
  catalogo: Producto[]
  items: ItemOrden[]
  onChange: (items: ItemOrden[]) => void
  deshabilitado?: boolean
}

/** Los productos se eligen siempre del catálogo, nunca se escriben a mano. */
export default function SelectorProductos({ catalogo, items, onChange, deshabilitado }: Props) {
  function actualizar(indice: number, parcial: Partial<ItemOrden>) {
    onChange(items.map((it, i) => (i === indice ? { ...it, ...parcial } : it)))
  }

  function quitar(indice: number) {
    onChange(items.filter((_, i) => i !== indice))
  }

  function agregar() {
    const usados = new Set(items.map((i) => i.producto_id))
    const libre = catalogo.find((p) => !usados.has(p.id))
    if (!libre) return
    onChange([...items, { producto_id: libre.id, cantidad: 1 }])
  }

  const hayLibres = catalogo.some((p) => !items.some((i) => i.producto_id === p.id))

  return (
    <div className="selector-productos">
      {items.length === 0 && <p className="texto-suave">Aún no hay productos en la orden.</p>}
      {items.map((it, i) => (
        <div className="fila-producto" key={i}>
          <select
            value={it.producto_id}
            onChange={(e) => actualizar(i, { producto_id: e.target.value })}
            disabled={deshabilitado}
          >
            {catalogo
              .filter(
                (p) => p.id === it.producto_id || !items.some((o) => o.producto_id === p.id),
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </select>
          <input
            type="number"
            min={1}
            step={1}
            value={Number.isFinite(it.cantidad) ? it.cantidad : ''}
            onChange={(e) => actualizar(i, { cantidad: parseInt(e.target.value, 10) })}
            disabled={deshabilitado}
            aria-label="Cantidad"
          />
          <button
            type="button"
            className="btn btn-icono"
            onClick={() => quitar(i)}
            disabled={deshabilitado}
            aria-label="Quitar producto"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={agregar}
        disabled={deshabilitado || !hayLibres || catalogo.length === 0}
      >
        + Agregar producto
      </button>
    </div>
  )
}
