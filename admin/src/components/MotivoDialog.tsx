import { useState } from 'react'
import { LIMITES, validarMotivo } from '../lib/validaciones'

interface Props {
  titulo: string
  descripcion?: string
  textoConfirmar: string
  onConfirmar: (motivo: string) => void | Promise<void>
  onCerrar: () => void
}

/** Diálogo que obliga a escribir un motivo válido (cancelaciones). */
export default function MotivoDialog({
  titulo,
  descripcion,
  textoConfirmar,
  onConfirmar,
  onCerrar,
}: Props) {
  const [motivo, setMotivo] = useState('')
  const [tocado, setTocado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const error = validarMotivo(motivo)

  async function confirmar() {
    setTocado(true)
    if (error || enviando) return
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
            maxLength={LIMITES.motivo}
            value={motivo}
            aria-invalid={tocado && !!error}
            onChange={(e) => setMotivo(e.target.value)}
            onBlur={() => setTocado(true)}
          />
          <small className={tocado && error ? 'error' : 'texto-suave'}>
            {tocado && error ? error : `${motivo.trim().length}/${LIMITES.motivo}`}
          </small>
        </label>
        <div className="acciones acciones-fin">
          <button className="btn" onClick={onCerrar} disabled={enviando}>
            Volver
          </button>
          <button className="btn btn-peligro" onClick={confirmar} disabled={enviando}>
            {enviando ? 'Guardando…' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
