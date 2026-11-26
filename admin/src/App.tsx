import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Fondo from './components/Fondo'
import Layout from './components/Layout'
import { AuthProvider } from './hooks/useAuth'
import { AvisoProvider } from './hooks/useAviso'
import ArmarRuta from './pages/ArmarRuta'
import Login from './pages/Login'
import OrdenForm from './pages/OrdenForm'
import Ordenes from './pages/Ordenes'
import Pendientes from './pages/Pendientes'
import ResumenDia from './pages/ResumenDia'

export default function App() {
  return (
    <BrowserRouter>
      <Fondo />
      <AvisoProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/ordenes" replace />} />
            <Route path="/ordenes" element={<Ordenes />} />
            <Route path="/ordenes/nueva" element={<OrdenForm />} />
            <Route path="/ordenes/:id" element={<OrdenForm />} />
            <Route path="/armar-ruta" element={<ArmarRuta />} />
            <Route path="/resumen" element={<ResumenDia />} />
            <Route path="/pendientes" element={<Pendientes />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
      </AvisoProvider>
    </BrowserRouter>
  )
}
