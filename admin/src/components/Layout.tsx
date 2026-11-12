import { useState } from 'react'
import { NavLink, Navigate, Outlet } from 'react-router-dom'
import ConfirmDialog from './ConfirmDialog'
import { useAuth } from '../hooks/useAuth'
import { useAviso } from '../hooks/useAviso'

const ENLACES = [
  { to: '/ordenes', texto: 'Órdenes' },
  { to: '/armar-ruta', texto: 'Armar ruta' },
  { to: '/resumen', texto: 'Resumen del día' },
  { to: '/pendientes', texto: 'Pendientes' },
]

/** Estructura de las pantallas privadas; solo deja pasar a usuarios con rol admin. */
export default function Layout() {
  const { session, perfil, cargando, cerrarSesion } = useAuth()
  const { avisar } = useAviso()
  const [saliendo, setSaliendo] = useState(false)

  if (cargando) return <p className="cargando">Cargando…</p>
  if (!session || perfil?.rol !== 'admin') return <Navigate to="/login" replace />

  return (
    <div className="app">
      <aside className="lateral">
        <h1 className="marca">Despacho</h1>
        <nav>
          {ENLACES.map((e) => (
            <NavLink
              key={e.to}
              to={e.to}
              className={({ isActive }) => (isActive ? 'enlace activo' : 'enlace')}
            >
              {e.texto}
            </NavLink>
          ))}
        </nav>
        <div className="usuario">
          <span>{perfil.nombre}</span>
          <button className="btn" onClick={() => setSaliendo(true)}>
            Salir
          </button>
        </div>
      </aside>
      <main className="contenido">
        <Outlet />
      </main>

      {saliendo && (
        <ConfirmDialog
          titulo="Cerrar sesión"
          descripcion="¿Quieres salir del panel?"
          textoConfirmar="Salir"
          onConfirmar={async () => {
            await cerrarSesion()
            avisar('info', 'Cerraste la sesión.')
          }}
          onCerrar={() => setSaliendo(false)}
        />
      )}
    </div>
  )
}
