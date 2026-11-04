# /admin – Panel del administrador

React + Vite + TypeScript + Leaflet + Supabase. Se despliega en Vercel.

## Puesta en marcha

```bash
cp .env.example .env     # completa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (clave pública)
npm install
npm run dev              # desarrollo
npm run build            # tsc + build de producción
```

En Vercel: Framework = Vite, y define las mismas dos variables de entorno. `vercel.json` ya redirige todas las rutas a `index.html`.

## Qué está hecho

| Tarea | Estado | Dónde |
| --- | --- | --- |
| 4-03 Proyecto Vite + Supabase + Vercel | Listo (falta conectar el repo a Vercel) | raíz, `src/lib/supabase.ts` |
| 4-04 Login solo admin | Listo | `pages/Login.tsx`, `hooks/useAuth.tsx`, `components/Layout.tsx` |
| 4-05 Lista de órdenes | Listo | `pages/Ordenes.tsx` |
| 4-06 Formulario Nueva orden (guía obligatoria y única) | Listo | `pages/OrdenForm.tsx` |
| 4-07 Selector de productos del catálogo | Listo | `components/SelectorProductos.tsx` |
| 4-08 Mapa Leaflet con pin movible | Listo | `components/MapaPin.tsx` |
| 4-09 Guardar/editar, aviso de guía duplicada | Listo | `services/ordenes.ts` |
| 4-10 / 4-11 Armar ruta y Asignar (orden manual) | Listo | `pages/ArmarRuta.tsx` |
| 4-12 Filtros por estado/fecha y búsqueda por guía | Listo | `pages/Ordenes.tsx` |
| 4-13 / 4-14 Optimizar y ajustar orden | Listo en el panel; necesita la función `optimizar_ruta` (5-12 / 5-17) | `services/optimizacion.ts` |
| 4-16 Resumen del día | Versión base (rutas, paradas y estados) | `pages/ResumenDia.tsx` |
| 4-18 Pendientes de resolver | Fallidas: reprogramar y cancelar con motivo. Parciales: solo vista | `pages/Pendientes.tsx` |

Faltan: 4-15 (agrupar órdenes del mismo cliente), 4-17 (fotos de guías), 4-19 (orden con saldo), 4-20 (mapa en vivo).

## Esquema de Supabase que usa el panel

Alineado con las migraciones 001, 002 y 005 (revisión «Problemas_Admin»):

- `ordenes`: `numero_guia`, `cliente_nombre`, `cliente_telefono`, `direccion`, `notas`, `latitud`, `longitud`, `estado`, `motivo_cancelacion`, `creado_en`.
- `orden_items`: `orden_id`, `producto_id`, `cantidad_pedida`.
- Estados de orden: `pendiente`, `asignada`, `en_ruta`, `entregada`, `entregada_parcial`, `fallida`, `cancelada` (`parcial` solo existe en paradas y entregas).
- `rutas`: `creado_en`. `paradas`: `posicion_sugerida` y `posicion_final` (el panel muestra y ordena por `posicion_final`, y usa la sugerida si falta).
- `asignar_ruta(p_fecha, p_conductor, p_ordenes)`; `p_ordenes` va en el orden de visita.
- Conductores: solo `rol = 'conductor'` y `activo = true`.
- Las Edge Functions `geocodificar` y `optimizar_ruta` siguen usando `lat`/`lng` (no son columnas de la base).

Teléfono guardado como `+569XXXXXXXX`. Guardar una orden hace varias llamadas (orden + items); si se necesita atomicidad, moverlo a una función SQL.
