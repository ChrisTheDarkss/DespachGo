import { useState } from 'react'
import type { ReactNode } from 'react'

interface Props {
  titulo: string
  descripcion?: ReactNode
  textoConfirmar: string
  /** Usa el estilo rojo para acciones que no se pueden deshacer. */
  peligro?: boolean
  onConfirmar: () => void | Promise<void>
  onCerrar: () => void
}

/** Diálogo de confirmación antes de ejecutar una acción importante. */
export default function ConfirmDialog({
  titulo,
  descripcion,
  textoConfirmar,
  peligro,
  onConfirmar,
  onCerrar,
}: Props) {
  const [enviando, setEnviando] = useState(false)

  async function confirmar() {
    if (enviando) return
    setEnviando(true)
    try {
      await onConfirmar()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="dialogo">
        <h3>{titulo}</h3>
        {descripcion && <div className="texto-suave">{descripcion}</div>}
        <div className="acciones acciones-fin">
          <button className="btn" onClick={onCerrar} disabled={enviando} autoFocus>
            Volver
          </button>
          <button
            className={peligro ? 'btn btn-peligro' : 'btn btn-primario'}
            onClick={confirmar}
            disabled={enviando}
          >
            {enviando ? 'Procesando…' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
