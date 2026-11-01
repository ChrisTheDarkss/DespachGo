import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import EstadoBadge from '../components/EstadoBadge'
import MapaPin from '../components/MapaPin'
import MotivoDialog from '../components/MotivoDialog'
import SelectorProductos from '../components/SelectorProductos'
import { formatearTelefono, normalizarTelefono } from '../lib/telefono'
import { geocodificar } from '../services/geocodificacion'
import {
  cancelarOrden,
  guardarOrden,
  guiaExiste,
  obtenerOrden,
} from '../services/ordenes'
import { listarProductos } from '../services/productos'
import type { Coordenadas, ItemOrden, Orden, Producto } from '../types'

export default function OrdenForm() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [catalogo, setCatalogo] = useState<Producto[]>([])
  const [orden, setOrden] = useState<Orden | null>(null)
  const [cargando, setCargando] = useState(true)

  const [guia, setGuia] = useState('')
  const [cliente, setCliente] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemOrden[]>([])
  const [pos, setPos] = useState<Coordenadas | null>(null)
  const [enfocar, setEnfocar] = useState<Coordenadas | null>(null)
  const [pinValidado, setPinValidado] = useState(false)

  const [avisoGuia, setAvisoGuia] = useState<string | null>(null)
  const [mensajeMapa, setMensajeMapa] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [cancelando, setCancelando] = useState(false)

  // Solo se puede editar mientras la orden esté pendiente (o sea nueva).
  const editable = !orden || orden.estado === 'pendiente'

  useEffect(() => {
    let activo = true
    async function cargar() {
      try {
        const productos = await listarProductos()
        if (!activo) return
        setCatalogo(productos)
        if (id) {
          const o = await obtenerOrden(id)
          if (!activo) return
          setOrden(o)
          setGuia(o.numero_guia)
          setCliente(o.cliente_nombre)
          setTelefono(o.telefono)
          setDireccion(o.direccion)
          setNotas(o.notas ?? '')
          setItems((o.orden_items ?? []).map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })))
          if (o.lat != null && o.lng != null) {
            setPos({ lat: o.lat, lng: o.lng })
            setPinValidado(true)
          }
        }
      } catch (e) {
        if (activo) setError((e as Error).message)
      } finally {
        if (activo) setCargando(false)
      }
    }
    cargar()
    return () => {
      activo = false
    }
  }, [id])

  // Mover el pin a mano cuenta como validarlo.
  const moverPin = useCallback((c: Coordenadas) => {
    setPos(c)
    setPinValidado(true)
    setMensajeMapa(null)
  }, [])

  async function revisarGuia() {
    const g = guia.trim()
    if (!g) {
      setAvisoGuia(null)
      return
    }
    try {
      const existe = await guiaExiste(g, id)
      setAvisoGuia(existe ? 'Ya existe una orden con este número de guía.' : null)
    } catch {
      setAvisoGuia(null)
    }
  }

  async function buscarDireccion() {
    if (!direccion.trim() || buscando) return
    setBuscando(true)
    setMensajeMapa(null)
    const c = await geocodificar(direccion.trim())
    setBuscando(false)
    if (!c) {
      setMensajeMapa('No se encontró la dirección. Haz clic en el mapa para ubicar el pin a mano.')
      return
    }
    setPos(c)
    setEnfocar({ ...c })
    setPinValidado(false)
    setMensajeMapa('Revisa que el pin esté en el lugar correcto y márcalo como validado.')
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (guardando || !editable) return
    setError(null)

    const g = guia.trim()
    const tel = normalizarTelefono(telefono)
    if (!g) return setError('El número de guía es obligatorio.')
    if (!cliente.trim()) return setError('Escribe el nombre del cliente.')
    if (!tel) return setError('El teléfono no es válido. Usa un móvil chileno, por ejemplo +56 9 1234 5678.')
    if (!direccion.trim()) return setError('Escribe la dirección.')
    if (!pos) return setError('Ubica el pin de la dirección en el mapa.')
    if (!pinValidado) return setError('Confirma que el pin está en el lugar correcto.')
    if (items.length === 0) return setError('Agrega al menos un producto.')
    if (items.some((i) => !Number.isInteger(i.cantidad) || i.cantidad < 1)) {
      return setError('Las cantidades deben ser números enteros mayores que 0.')
    }

    setGuardando(true)
    try {
      if (await guiaExiste(g, id)) {
        setAvisoGuia('Ya existe una orden con este número de guía.')
        throw new Error('Ya existe una orden con ese número de guía.')
      }
      await guardarOrden(
        {
          numero_guia: g,
          cliente_nombre: cliente.trim(),
          telefono: tel,
          direccion: direccion.trim(),
          notas: notas.trim() || null,
          lat: pos.lat,
          lng: pos.lng,
        },
        items,
        id,
      )
      navigate('/ordenes')
    } catch (err) {
      setError((err as Error).message)
      setGuardando(false)
    }
  }

  async function confirmarCancelacion(motivo: string) {
    if (!id) return
    try {
      await cancelarOrden(id, motivo)
      navigate('/ordenes')
    } catch (err) {
      setCancelando(false)
      setError((err as Error).message)
    }
  }

  if (cargando) return <p className="cargando">Cargando…</p>

  return (
    <div>
      <div className="encabezado">
        <h2>{id ? `Orden ${orden?.numero_guia ?? ''}` : 'Nueva orden'}</h2>
        <div className="acciones">
          {orden && <EstadoBadge estado={orden.estado} />}
          <Link to="/ordenes" className="btn">
            Volver
          </Link>
        </div>
      </div>

      {orden && !editable && (
        <p className="aviso">
          Esta orden está «{orden.estado}» y ya no se puede editar.
          {orden.motivo_cancelacion && <> Motivo: {orden.motivo_cancelacion}</>}
        </p>
      )}

      <form className="form-orden" onSubmit={guardar}>
        <fieldset disabled={!editable || guardando} className="columna tarjeta">
          <label className="campo">
            <span>Número de guía *</span>
            <input
              value={guia}
              onChange={(e) => {
                setGuia(e.target.value)
                setAvisoGuia(null)
              }}
              onBlur={revisarGuia}
              required
            />
            {avisoGuia && <small className="error">{avisoGuia}</small>}
          </label>

          <label className="campo">
            <span>Cliente *</span>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} required />
          </label>

          <label className="campo">
            <span>Teléfono *</span>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              onBlur={() => {
                const t = normalizarTelefono(telefono)
                if (t) setTelefono(formatearTelefono(t))
              }}
              placeholder="+56 9 1234 5678"
              inputMode="tel"
              required
            />
          </label>

          <label className="campo">
            <span>Dirección (Temuco) *</span>
            <div className="fila">
              <input
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    buscarDireccion()
                  }
                }}
                placeholder="Calle y número"
                required
              />
              <button
                type="button"
                className="btn"
                onClick={buscarDireccion}
                disabled={buscando || !direccion.trim()}
              >
                {buscando ? 'Buscando…' : 'Buscar en mapa'}
              </button>
            </div>
          </label>

          <label className="campo">
            <span>Notas</span>
            <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </label>

          <div className="campo">
            <span>Productos *</span>
            <SelectorProductos
              catalogo={catalogo}
              items={items}
              onChange={setItems}
              deshabilitado={!editable || guardando}
            />
            {catalogo.length === 0 && (
              <small className="error">El catálogo de productos está vacío.</small>
            )}
          </div>
        </fieldset>

        <div className="columna">
          <div className="tarjeta">
            <MapaPin
              pos={pos}
              enfocar={enfocar}
              onChange={moverPin}
              deshabilitado={!editable || guardando}
            />
            {mensajeMapa && <p className="aviso">{mensajeMapa}</p>}
            <p className="texto-suave">
              Arrastra el pin o haz clic en el mapa para corregir la ubicación.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={pinValidado}
                disabled={!pos || !editable}
                onChange={(e) => setPinValidado(e.target.checked)}
              />
              <span>El pin está en la ubicación correcta</span>
            </label>
          </div>

          {error && <p className="error">{error}</p>}

          {editable && (
            <div className="acciones">
              <button className="btn btn-primario btn-grande" disabled={guardando}>
                {guardando ? 'Guardando…' : id ? 'Guardar cambios' : 'Crear orden'}
              </button>
              {id && (
                <button
                  type="button"
                  className="btn btn-peligro btn-grande"
                  onClick={() => setCancelando(true)}
                  disabled={guardando}
                >
                  Cancelar orden
                </button>
              )}
            </div>
          )}
        </div>
      </form>

      {cancelando && (
        <MotivoDialog
          titulo="Cancelar orden"
          descripcion="La orden no se borra: queda como «cancelada» con el motivo."
          textoConfirmar="Cancelar orden"
          onConfirmar={confirmarCancelacion}
          onCerrar={() => setCancelando(false)}
        />
      )}
    </div>
  )
}
