import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import EstadoBadge from '../components/EstadoBadge'
import MapaPin from '../components/MapaPin'
import MotivoDialog from '../components/MotivoDialog'
import SelectorProductos from '../components/SelectorProductos'
import { useAviso } from '../hooks/useAviso'
import { hoyLocal } from '../lib/fechas'
import { formatearTelefono, normalizarTelefono } from '../lib/telefono'
import { LIMITES, validarOrden } from '../lib/validaciones'
import type { CampoOrden, ErroresOrden } from '../lib/validaciones'
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
  const { avisar } = useAviso()
  const [errores, setErrores] = useState<ErroresOrden>({})

  const [catalogo, setCatalogo] = useState<Producto[]>([])
  const [orden, setOrden] = useState<Orden | null>(null)
  const [cargando, setCargando] = useState(true)

  const [guia, setGuia] = useState('')
  const [cliente, setCliente] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [notas, setNotas] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState(hoyLocal())
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
          setTelefono(o.cliente_telefono)
          setDireccion(o.direccion)
          setNotas(o.notas ?? '')
          setFechaEntrega(o.fecha_entrega)
          setItems((o.orden_items ?? []).map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad_pedida })))
          if (o.latitud != null && o.longitud != null) {
            setPos({ lat: o.latitud, lng: o.longitud })
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
    setErrores((e) => ({ ...e, pin: undefined }))
  }, [])

  /** Quita el error de un campo en cuanto el usuario lo vuelve a editar. */
  function limpiar(campo: CampoOrden) {
    setErrores((e) => (e[campo] ? { ...e, [campo]: undefined } : e))
  }

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
    const errs = validarOrden({
      guia,
      cliente,
      telefono,
      direccion,
      fechaEntrega,
      fechaOriginal: orden?.fecha_entrega ?? null,
      notas,
      hayPin: !!pos,
      pinValidado,
      items,
    })
    setErrores(errs)
    const primero = Object.keys(errs)[0]
    if (primero || !tel || !pos) {
      avisar('error', 'Revisa los campos marcados en rojo.')
      document.getElementById(`campo-${primero}`)?.focus()
      return
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
          cliente_telefono: tel,
          direccion: direccion.trim(),
          notas: notas.trim() || null,
          latitud: pos.lat,
          longitud: pos.lng,
          fecha_entrega: fechaEntrega,
        },
        items,
        id,
      )
      avisar('exito', id ? `Orden ${g} actualizada.` : `Orden ${g} creada.`)
      navigate('/ordenes')
    } catch (err) {
      setError((err as Error).message)
      avisar('error', (err as Error).message)
      setGuardando(false)
    }
  }

  async function confirmarCancelacion(motivo: string) {
    if (!id) return
    try {
      await cancelarOrden(id, motivo)
      avisar('exito', `Orden ${orden?.numero_guia ?? ''} cancelada.`)
      navigate('/ordenes')
    } catch (err) {
      setCancelando(false)
      setError((err as Error).message)
      avisar('error', (err as Error).message)
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

      <form className="form-orden" onSubmit={guardar} noValidate>
        <fieldset disabled={!editable || guardando} className="columna tarjeta">
          <label className="campo">
            <span>Número de guía *</span>
            <input
              id="campo-guia"
              value={guia}
              maxLength={LIMITES.guia}
              aria-invalid={!!errores.guia || !!avisoGuia}
              onChange={(e) => {
                setGuia(e.target.value)
                setAvisoGuia(null)
                limpiar('guia')
              }}
              onBlur={revisarGuia}
              required
            />
            {errores.guia && <small className="error">{errores.guia}</small>}
            {avisoGuia && <small className="error">{avisoGuia}</small>}
          </label>

          <label className="campo">
            <span>Cliente *</span>
            <input
              id="campo-cliente"
              value={cliente}
              maxLength={LIMITES.cliente}
              aria-invalid={!!errores.cliente}
              onChange={(e) => {
                setCliente(e.target.value)
                limpiar('cliente')
              }}
              required
            />
            {errores.cliente && <small className="error">{errores.cliente}</small>}
          </label>

          <label className="campo">
            <span>Teléfono *</span>
            <input
              id="campo-telefono"
              value={telefono}
              aria-invalid={!!errores.telefono}
              onChange={(e) => {
                setTelefono(e.target.value)
                limpiar('telefono')
              }}
              onBlur={() => {
                const t = normalizarTelefono(telefono)
                if (t) setTelefono(formatearTelefono(t))
              }}
              placeholder="+56 9 1234 5678"
              inputMode="tel"
              required
            />
            {errores.telefono && <small className="error">{errores.telefono}</small>}
          </label>

          <label className="campo">
            <span>Dirección (Temuco) *</span>
            <div className="fila">
              <input
                id="campo-direccion"
                value={direccion}
                maxLength={LIMITES.direccion}
                aria-invalid={!!errores.direccion}
                onChange={(e) => {
                  setDireccion(e.target.value)
                  limpiar('direccion')
                }}
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
            {errores.direccion && <small className="error">{errores.direccion}</small>}
          </label>

          <label className="campo">
            <span>Fecha de entrega *</span>
            <input
              id="campo-fechaEntrega"
              type="date"
              value={fechaEntrega}
              min={orden ? undefined : hoyLocal()}
              aria-invalid={!!errores.fechaEntrega}
              onChange={(e) => {
                setFechaEntrega(e.target.value)
                limpiar('fechaEntrega')
              }}
              required
            />
            {errores.fechaEntrega ? (
              <small className="error">{errores.fechaEntrega}</small>
            ) : (
              <small className="texto-suave">Día en que la orden debería ir a dejarse.</small>
            )}
          </label>

          <label className="campo">
            <span>Notas</span>
            <textarea
              id="campo-notas"
              rows={2}
              value={notas}
              maxLength={LIMITES.notas}
              aria-invalid={!!errores.notas}
              onChange={(e) => {
                setNotas(e.target.value)
                limpiar('notas')
              }}
            />
            {errores.notas && <small className="error">{errores.notas}</small>}
          </label>

          <div className="campo">
            <span>Productos *</span>
            <SelectorProductos
              catalogo={catalogo}
              items={items}
              onChange={(nuevos) => {
                setItems(nuevos)
                limpiar('items')
              }}
              deshabilitado={!editable || guardando}
            />
            {errores.items && <small className="error" id="campo-items">{errores.items}</small>}
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
                id="campo-pin"
                type="checkbox"
                checked={pinValidado}
                disabled={!pos || !editable}
                onChange={(e) => {
                  setPinValidado(e.target.checked)
                  limpiar('pin')
                }}
              />
              <span>El pin está en la ubicación correcta</span>
            </label>
            {errores.pin && <small className="error">{errores.pin}</small>}
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
