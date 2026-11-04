import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../types'

interface AuthContextValue {
  session: Session | null
  perfil: Perfil | null
  cargando: boolean
  /** Devuelve un mensaje de error, o null si el ingreso fue correcto. */
  iniciarSesion: (email: string, password: string) => Promise<string | null>
  cerrarSesion: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function cargarPerfil(userId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, rol')
    .eq('id', userId)
    .maybeSingle()
  if (error) return null
  return (data as Perfil | null) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSession(nueva)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  useEffect(() => {
    let activo = true
    if (!userId) {
      setPerfil(null)
      setCargando(false)
      return
    }
    setCargando(true)
    cargarPerfil(userId).then((p) => {
      if (!activo) return
      setPerfil(p)
      setCargando(false)
    })
    return () => {
      activo = false
    }
  }, [userId])

  async function iniciarSesion(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) return 'Correo o contraseña incorrectos.'
    const p = await cargarPerfil(data.user.id)
    if (!p || p.rol !== 'admin') {
      await supabase.auth.signOut()
      return 'Esta cuenta no tiene permisos de administrador.'
    }
    return null
  }

  async function cerrarSesion() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, perfil, cargando, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
