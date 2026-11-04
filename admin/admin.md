# /admin – Panel del administrador

Aplicación web para que el administrador cree órdenes, arme rutas y supervise el día. Está hecha con React, Vite, TypeScript, Leaflet y Supabase, y se despliega en Vercel.

**Responsable:** Persona 4. Respaldo: Persona 1.

## Puesta en marcha

```bash
cp .env.example .env     # completa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (clave pública)
npm install
npm run dev              # desarrollo
npm run build            # tsc + build de producción
```

En Vercel: Framework = Vite, y define las mismas dos variables de entorno. `vercel.json` ya redirige todas las rutas a `index.html`.

## Qué va en esta carpeta

- Todo el código del panel web.
- Configuración de Vite y de despliegue (`vite.config.ts`, `vercel.json`).
- El archivo `.env.example` con los nombres de las variables (sin valores reales).

## Qué NO va aquí

- Código de la app del conductor (va en `/mobile`).
- Código del bot (va en `/bot`).
- La clave privada de Supabase ni la clave de OpenRouteService. El panel usa la clave pública y llama a las funciones de Supabase para optimizar y geocodificar.
- El archivo `.env` real.

## Estructura sugerida

```
admin/
├── src/
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Ordenes.tsx         Lista, filtros y búsqueda por guía
│   │   ├── OrdenForm.tsx       Crear y editar orden con mapa
│   │   ├── ArmarRuta.tsx       Elegir órdenes, optimizar, asignar
│   │   ├── ResumenDia.tsx      Rutas, paradas, fotos y mapa en vivo
│   │   └── Pendientes.tsx      Fallidas, omitidas y parciales
│   ├── components/             Tablas, mapa Leaflet (MapaPin), SelectorProductos...
│   ├── lib/                    Cliente de Supabase (supabase.ts)
│   ├── services/               Órdenes, rutas, geocodificación, optimización
│   ├── hooks/                  useAuth.tsx...
│   ├── types/                  index.ts
│   └── main.tsx
├── public/
├── index.html
├── vite.config.ts
├── vercel.json
├── .env.example
└── package.json
```

## Pantallas de esta carpeta

Login (solo rol admin), Órdenes, Crear y editar orden, Armar ruta, Resumen del día y Pendientes de resolver.

## Reglas importantes

- El número de guía es obligatorio y único; avisar si ya existe.
- Los productos se eligen del catálogo, nunca se escriben a mano.
- El admin siempre valida el pin de la dirección en el mapa (la geocodificación gratuita puede fallar).
- Si varias órdenes del mismo cliente van en la misma ruta, proponer agruparlas en una sola parada y dejar que el admin confirme.
- Con la ruta ya iniciada, el admin solo puede agregar paradas al final; no reordena ni quita.
- Cancelar una orden no la borra: queda en estado «cancelada» con motivo.

## Estado de las tareas

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

**Faltan:** 4-15 (agrupar órdenes del mismo cliente), 4-17 (fotos de guías), 4-19 (orden con saldo), 4-20 (mapa en vivo).

## Supuestos que hay que confirmar con la Persona 1 (documento de acuerdos 1-02)

- **Tablas y columnas**: `ordenes(id, numero_guia [único], cliente_nombre, telefono, direccion, notas, lat, lng, estado, motivo_cancelacion, created_at)`, `orden_items(orden_id, producto_id, cantidad)`, `productos(id, nombre, activo)`, `perfiles(id, nombre, rol)`, `rutas(id, fecha, estado, conductor_id, created_at)`, `paradas(id, ruta_id, posicion, estado)`, `parada_ordenes(parada_id, orden_id)`. Si algún nombre cambia, ajustar `src/types/index.ts` y `src/services/`.
- **Estados de orden**: `pendiente, asignada, entregada, parcial, fallida, cancelada` (constante `ESTADOS_ORDEN`).
- **Teléfono** guardado como `+569XXXXXXXX` (sin espacios).
- **`asignar_ruta`** (1-10) se llama con `p_fecha`, `p_conductor_id`, `p_orden_ids` (ids en orden de visita).
- **Edge Functions**: `geocodificar` recibe `{direccion}` y responde `{lat, lng}`; `optimizar_ruta` recibe `{puntos:[{id,lat,lng}]}` y responde `{orden:[id,...]}`. Mientras `geocodificar` no exista, el panel usa Nominatim directo como respaldo.
- **RLS**: el admin debe poder leer/escribir `ordenes`, `orden_items` y leer `perfiles`, `rutas`, `paradas`.
- Guardar una orden hace varias llamadas (orden + items). Si se necesita atomicidad, moverlo a una función SQL.
