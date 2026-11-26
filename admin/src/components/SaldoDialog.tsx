import { useEffect, useState } from 'react'
import { hoyLocal } from '../lib/fechas'
import { calcularSaldo } from '../services/saldos'
import type { ItemSaldo } from '../services/saldos'
import type { Orden } from '../types'

interface Props {
  orden: Orden
  onConfirmar: (fecha: string, items: ItemSaldo[]) => void | Promise<void>
  onCerrar: () => void
}

/** Muestra lo que quedó sin entregar de una orden parcial y crea una orden nueva con ese saldo. */
export default function SaldoDialog({ orden, onConfirmar, onCerrar }: Props) {
  const [items, setItems] = useState<ItemSaldo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fecha, setFecha] = useState(hoyLocal())
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let activo = true
    calcularSaldo(orden)
      .then((i) => activo && setItems(i))
      .catch((e: Error) => activo && setError(e.message))
    return () => {
      activo = false
    }
  }, [orden])

  const fechaValida = fecha !== '' && fecha >= hoyLocal()
  const puede = !!items && items.length > 0 && fechaValida && !enviando

  async function confirmar() {
    if (!puede || !items) return
    setEnviando(true)
    try {
      await onConfirmar(fecha, items)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="dialogo">
        <h3>Orden con saldo — {orden.numero_guia}</h3>
        <p className="texto-suave">
          Se crea una orden nueva con lo que no se entregó. La orden original queda como está.
        </p>

        {!items && !error && <p className="cargando">Calculando saldo…</p>}
        {error && <p className="error">{error}</p>}
        {items && items.length === 0 && (
          <p className="texto-suave">No quedan productos por entregar en esta orden.</p>
        )}
        {items && items.length > 0 && (
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Pedido</th>
                <th>Entregado</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.producto_id}>
                  <td>{i.nombre}</td>
                  <td>{i.pedida}</td>
                  <td>{i.entregada}</td>
                  <td>
                    <strong>{i.saldo}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <label className="campo">
          <span>Fecha de entrega del saldo</span>
          <input type="date" min={hoyLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        {!fechaValida && <small className="error">Elige una fecha desde hoy en adelante.</small>}

        <div className="acciones">
          <button className="btn" onClick={onCerrar} disabled={enviando}>
            Volver
          </button>
          <button className="btn btn-primario" onClick={confirmar} disabled={!puede}>
            {enviando ? 'Creando…' : 'Crear orden con saldo'}
          </button>
        </div>
      </div>
    </div>
  )
}
