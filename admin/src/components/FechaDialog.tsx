import { useState } from 'react'
import { hoyLocal } from '../lib/fechas'

interface Props {
  titulo: string
  descripcion?: string
  textoConfirmar: string
  fechaInicial?: string
  onConfirmar: (fecha: string) => void | Promise<void>
  onCerrar: () => void
}

/** Diálogo para elegir una fecha (no anterior a hoy), por ejemplo al reprogramar. */
export default function FechaDialog({
  titulo,
  descripcion,
  textoConfirmar,
  fechaInicial,
  onConfirmar,
  onCerrar,
}: Props) {
  const [fecha, setFecha] = useState(fechaInicial ?? hoyLocal())
  const [enviando, setEnviando] = useState(false)
  const valida = fecha !== '' && fecha >= hoyLocal()

  async function confirmar() {
    if (!valida || enviando) return
    setEnviando(true)
    try {
      await onConfirmar(fecha)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="dialogo">
        <h3>{titulo}</h3>
        {descripcion && <p className="texto-suave">{descripcion}</p>}
        <label className="campo">
          <span>Nueva fecha de entrega</span>
          <input
            type="date"
            autoFocus
            min={hoyLocal()}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>
        {!valida && <small className="error">Elige una fecha desde hoy en adelante.</small>}
        <div className="acciones">
          <button className="btn" onClick={onCerrar} disabled={enviando}>
            Volver
          </button>
          <button className="btn btn-primario" onClick={confirmar} disabled={!valida || enviando}>
            {enviando ? 'Guardando…' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
