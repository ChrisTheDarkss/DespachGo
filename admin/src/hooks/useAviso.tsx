import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type Tipo = 'exito' | 'error' | 'info'

interface Aviso {
  id: number
  tipo: Tipo
  texto: string
}

interface AvisoContextValue {
  /** Muestra un aviso breve: éxito, error o información. */
  avisar: (tipo: Tipo, texto: string) => void
}

const AvisoContext = createContext<AvisoContextValue | null>(null)

/** Avisos flotantes que informan el resultado de cada acción (se cierran solos). */
export function AvisoProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const contador = useRef(0)

  const cerrar = useCallback((id: number) => {
    setAvisos((lista) => lista.filter((a) => a.id !== id))
  }, [])

  const avisar = useCallback(
    (tipo: Tipo, texto: string) => {
      contador.current += 1
      const id = contador.current
      setAvisos((lista) => [...lista.slice(-3), { id, tipo, texto }])
      setTimeout(() => cerrar(id), tipo === 'error' ? 8000 : 4500)
    },
    [cerrar],
  )

  const valor = useMemo(() => ({ avisar }), [avisar])

  return (
    <AvisoContext.Provider value={valor}>
      {children}
      <div className="avisos" aria-live="polite">
        {avisos.map((a) => (
          <div
            key={a.id}
            className={`aviso-flotante aviso-${a.tipo}`}
            role={a.tipo === 'error' ? 'alert' : 'status'}
          >
            <span>{a.texto}</span>
            <button type="button" aria-label="Cerrar aviso" onClick={() => cerrar(a.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </AvisoContext.Provider>
  )
}

export function useAviso(): AvisoContextValue {
  const ctx = useContext(AvisoContext)
  if (!ctx) throw new Error('useAviso debe usarse dentro de AvisoProvider')
  return ctx
}
