import { useState } from 'react'

interface Props {
  titulo: string
  descripcion?: string
  textoConfirmar: string
  onConfirmar: (motivo: string) => void | Promise<void>
  onCerrar: () => void
}

/** Diálogo que obliga a escribir un motivo (cancelaciones). */
export default function MotivoDialog({
  titulo,
  descripcion,
  textoConfirmar,
  onConfirmar,
  onCerrar,
}: Props) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function confirmar() {
    if (!motivo.trim() || enviando) return
    setEnviando(true)
    try {
      await onConfirmar(motivo.trim())
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
          <span>Motivo (obligatorio)</span>
          <textarea
            autoFocus
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </label>
        <div className="acciones">
          <button className="btn" onClick={onCerrar} disabled={enviando}>
            Volver
          </button>
          <button
            className="btn btn-peligro"
            onClick={confirmar}
            disabled={!motivo.trim() || enviando}
          >
            {enviando ? 'Guardando…' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
