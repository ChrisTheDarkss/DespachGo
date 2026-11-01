import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const ENLACES = [
  { to: '/ordenes', texto: 'Órdenes' },
  { to: '/armar-ruta', texto: 'Armar ruta' },
  { to: '/resumen', texto: 'Resumen del día' },
  { to: '/pendientes', texto: 'Pendientes' },
]

/** Estructura de las pantallas privadas; solo deja pasar a usuarios con rol admin. */
export default function Layout() {
  const { session, perfil, cargando, cerrarSesion } = useAuth()

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
          <button className="btn" onClick={cerrarSesion}>
            Salir
          </button>
        </div>
      </aside>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  )
}
