import { useEffect, useState } from 'react'

interface Props {
  titulo: string
  fotos: string[]
  inicio?: number
  onCerrar: () => void
}

/** Muestra una foto de entrega a tamaño grande. Esc o clic fuera para cerrar; ← → para cambiar. */
export default function VisorFoto({ titulo, fotos, inicio = 0, onCerrar }: Props) {
  const [i, setI] = useState(inicio)
  const [fallo, setFallo] = useState(false)
  const hay = fotos.length

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar()
      if (e.key === 'ArrowRight') setI((n) => (n + 1) % hay)
      if (e.key === 'ArrowLeft') setI((n) => (n - 1 + hay) % hay)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [hay, onCerrar])

  useEffect(() => setFallo(false), [i])

  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onCerrar}>
      <div className="visor" onClick={(e) => e.stopPropagation()}>
        <div className="visor-cabecera">
          <strong>{titulo}</strong>
          <span className="texto-suave">{hay > 1 ? `Foto ${i + 1} de ${hay}` : ''}</span>
          <button className="btn btn-icono" onClick={onCerrar} aria-label="Cerrar" autoFocus>
            ✕
          </button>
        </div>

        {fallo ? (
          <p className="error">
            No se pudo cargar la foto. El enlace puede haber caducado: recarga la página.
          </p>
        ) : (
          <img
            className="visor-img"
            src={fotos[i]}
            alt={`Foto de la entrega — ${titulo}`}
            onError={() => setFallo(true)}
          />
        )}

        <div className="acciones acciones-fin">
          {hay > 1 && (
            <>
              <button className="btn" onClick={() => setI((i - 1 + hay) % hay)}>
                ← Anterior
              </button>
              <button className="btn" onClick={() => setI((i + 1) % hay)}>
                Siguiente →
              </button>
            </>
          )}
          <a className="btn" href={fotos[i]} target="_blank" rel="noreferrer">
            Abrir en pestaña nueva
          </a>
        </div>
      </div>
    </div>
  )
}
