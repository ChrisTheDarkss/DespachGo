# /admin – Panel del administrador

Aplicación web para que el administrador cree órdenes, arme rutas y supervise el día. Está hecha con React, Vite, TypeScript y Leaflet, y se despliega en Vercel. Los datos viven en Supabase.

**Responsable:** Persona 4. Respaldo: Persona 1.
**Última actualización de este documento:** 18-11-2026 (se agregó OpenRouteService en el mapa y los botones de cancelar pasaron a rojo sólido).

---

## 1. Qué va en esta carpeta

- Todo el código del panel web.
- Configuración de Vite y de despliegue (`vite.config.ts`, `vercel.json`).
- El archivo `.env.example` con los nombres de las variables (sin valores reales).

## 2. Qué NO va aquí

- Código de la app del conductor (va en `/mobile`).
- Código del bot (va en `/bot`).
- La clave privada (`service_role`) de Supabase. La clave de OpenRouteService (`key_rutas`) sí se lee en el panel por decisión del equipo, pero **queda visible en el navegador**: restringirla por dominio en el panel de ORS o volver a moverla a una Edge Function antes de publicar.
- El archivo `.env` real (está en `.gitignore`).

## 3. Puesta en marcha

1. Instalar Node.js 18 o superior.
2. Entrar a la carpeta `admin` (la que tiene `package.json`).
3. Crear el `.env` a partir del ejemplo y completar los dos valores:
   ```
   VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-clave-anon-publica
   key_rutas=tu-clave-de-openrouteservice
   ```
   `key_rutas` es opcional: con ella el mapa dibuja la ruta por calles y «Optimizar» usa OpenRouteService directo; sin ella queda la línea recta y la Edge Function `optimizar_ruta`.
4. Ejecutar, uno a la vez:
   ```
   npm install
   npm run dev
   ```
5. Abrir la dirección que muestra la terminal (normalmente `http://localhost:5173`).

Otros comandos: `npm run typecheck` (revisa tipos) y `npm run build` (revisa tipos y genera la versión de producción).

**Si la pantalla queda en blanco:** casi siempre falta el `.env` (no viaja en git) o tiene otro nombre. La consola del navegador (F12) dice «Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY». Después de crear o editar el `.env` hay que detener el servidor y volver a correr `npm run dev`.

**Despliegue en Vercel:** importar el repositorio, usar `admin` como Root Directory, definir las dos variables de entorno y desplegar. `vercel.json` redirige todas las rutas a `index.html`.

### Crear el usuario administrador

El login usa Supabase Auth (no hay usuarios ni contraseñas en el código). Un admin se crea en dos pasos dentro de Supabase:

1. **Authentication → Users → Add user**: correo y contraseña (marcar *Auto Confirm User*).
2. En el **SQL Editor**, darle el rol:
   ```sql
   insert into perfiles (id, nombre, rol, activo)
   select id, 'Administrador', 'admin', true
   from auth.users
   where email = 'tu-correo@ejemplo.com';
   ```
   Si ya tenía fila en `perfiles`, usar `update perfiles set rol = 'admin', activo = true where id = (select id from auth.users where email = '…');`

Sin la fila con `rol = 'admin'`, el login responde «Esta cuenta no tiene permisos de administrador».

## 4. Estructura

```
admin/
├── src/
│   ├── pages/
│   │   ├── Login.tsx           Acceso solo para rol admin
│   │   ├── Ordenes.tsx         Lista, filtros, búsqueda por guía y reprogramar atrasadas
│   │   ├── OrdenForm.tsx       Crear y editar orden con mapa y fecha de entrega
│   │   ├── ArmarRuta.tsx       Elegir órdenes, agrupar, optimizar, asignar
│   │   ├── ResumenDia.tsx      Rutas y paradas del día (fotos y mapa en vivo: pendiente)
│   │   └── Pendientes.tsx      Fallidas, parciales y atrasadas: reprogramar o cancelar
│   ├── components/
│   │   ├── Layout.tsx          Barra lateral y protección de rutas (solo admin)
│   │   ├── Fondo.tsx           Fondo animado decorativo
│   │   ├── EstadoBadge.tsx     Etiqueta de color según el estado
│   │   ├── MapaPin.tsx         Mapa con pin movible (formulario de orden)
│   │   ├── MapaRuta.tsx        Mapa de solo lectura con pines numerados
│   │   ├── SelectorProductos.tsx  Productos siempre desde el catálogo
│   │   ├── ConfirmDialog.tsx   Confirmación antes de una acción importante
│   │   ├── MotivoDialog.tsx    Diálogo que exige un motivo válido (cancelaciones)
│   │   └── FechaDialog.tsx     Diálogo para elegir una nueva fecha (reprogramar)
│   ├── hooks/
│   │   ├── useAuth.tsx         Sesión, perfil y rol
│   │   └── useAviso.tsx        Avisos flotantes de éxito, error e información
│   ├── lib/                    supabase.ts, leaflet.ts, telefono.ts, fechas.ts, validaciones.ts
│   ├── services/               ordenes, rutas, productos, geocodificacion, optimizacion, ors
│   ├── types/index.ts          Tipos y estados (alineados con el esquema de Supabase)
│   ├── App.tsx, main.tsx, index.css
├── index.html
├── vite.config.ts
├── vercel.json
├── .env.example
└── package.json
```

Rutas de la aplicación: `/login`, `/ordenes`, `/ordenes/nueva`, `/ordenes/:id`, `/armar-ruta`, `/resumen`, `/pendientes`. Todas menos `/login` exigen sesión con rol admin.

Tecnologías: React 18, Vite 5, TypeScript, React Router 6, react-leaflet 4 (mapas de OpenStreetMap) y `@supabase/supabase-js` 2.

---

## 5. Qué hace cada pantalla

**Login.** Correo y contraseña contra Supabase Auth. Si el usuario existe pero su perfil no es `admin` (o no tiene perfil), se cierra la sesión y se muestra el error.

**Órdenes.** Tabla con guía, cliente, teléfono, dirección, productos, fecha de entrega, estado y fecha de creación. Filtros por estado, por **fecha de entrega** y búsqueda por número de guía. Las órdenes pendientes con fecha vencida muestran «atrasada». Las fallidas y las pendientes atrasadas tienen un botón **Reprogramar** que pide la nueva fecha.

**Nueva orden / Editar orden.** Campos: número de guía (obligatorio y único), cliente, teléfono (se normaliza a `+569XXXXXXXX`), dirección, **fecha de entrega** (obligatoria), notas y productos del catálogo con cantidad. El botón «Buscar en mapa» geocodifica la dirección (limitada a Temuco); el pin se puede arrastrar o mover con un clic, y hay que marcar que está en el lugar correcto antes de guardar. Solo se pueden editar órdenes pendientes. **Cancelar** pide un motivo y no borra: la orden queda en estado «cancelada».

**Armar ruta.** Se elige fecha de la ruta (no anterior a hoy) y conductor (solo activos). La lista muestra las órdenes pendientes ordenadas por fecha de entrega, con las atrasadas marcadas; las programadas para después de la fecha de la ruta quedan ocultas salvo que se active «Mostrar también las programadas». Las órdenes seleccionadas forman el orden de visita, que se ajusta con las flechas ↑↓. La casilla **Agrupar** junta las órdenes del mismo teléfono y dirección en una sola parada y muestra una vista previa de cuántas paradas resultan. **Optimizar** (mínimo 3 órdenes) pide el orden sugerido a una Edge Function; **Asignar** valida, abre un diálogo de confirmación con el resumen (avisa si hay órdenes con fecha posterior a la de la ruta) y recién entonces crea la ruta.

**Resumen del día.** Rutas de la fecha elegida, con conductor, estado de la ruta y tabla de paradas (posición, guías, cliente, dirección y estado).

**Pendientes de resolver.** Reúne las órdenes fallidas, las de entrega parcial y las **pendientes con fecha de entrega vencida** (las atrasadas primero). Para fallidas y atrasadas: **Reprogramar** (elige nueva fecha, la orden queda pendiente) o **Cancelar** (con motivo). Las parciales solo se ven por ahora.

---

## 6. Conexión con Supabase

Las tablas y funciones vienen de las migraciones de `supabase/migrations/`: `001` (perfiles, productos y órdenes), `002` (rutas, paradas y entregas), `005` (`asignar_ruta`), `007` (`guardar_orden`) y `008` (`reprogramar_orden`). El panel habla directo con la base mediante `supabase-js` y la clave pública. Lo que cada usuario puede leer o escribir lo deciden las reglas RLS de Supabase, no el código del panel.

### Tablas y columnas que usa

- `ordenes`: `numero_guia`, `cliente_nombre`, `cliente_telefono`, `direccion`, `notas`, `latitud`, `longitud`, `estado`, `motivo_cancelacion`, `fecha_entrega`, `creado_en`.
- `orden_items`: `orden_id`, `producto_id`, `cantidad_pedida`.
- `productos`: `id`, `nombre`, `activo`.
- `perfiles`: `id`, `nombre`, `rol`, `activo`.
- `rutas`: `fecha`, `estado`, `conductor_id`, `creado_en`.
- `paradas`: `posicion_sugerida`, `posicion_final` (el panel muestra y ordena por `posicion_final`, o la sugerida si falta).
- `parada_ordenes`: relaciona paradas con órdenes.

### Estados

- Orden: `pendiente`, `asignada`, `en_ruta`, `entregada`, `entregada_parcial`, `fallida`, `cancelada`. (`parcial` existe solo en paradas y entregas, no en órdenes.)

### Funciones SQL (RPC)

| Función | Parámetros | Qué hace |
| --- | --- | --- |
| `guardar_orden` | `p_orden_id`, `p_datos`, `p_items` | Crea o edita una orden y sus productos en una transacción. `p_datos` lleva `numero_guia`, `cliente_nombre`, `cliente_telefono`, `direccion`, `latitud`, `longitud`, `notas`, `fecha_entrega`; `p_items` es una lista de `{producto_id, cantidad}`. Solo edita órdenes pendientes. |
| `asignar_ruta` | `p_fecha`, `p_conductor`, `p_ordenes`, `p_agrupar` | Crea (o amplía) la ruta del conductor para esa fecha y genera las paradas en el orden recibido. Con `p_agrupar`, las órdenes con el mismo teléfono y la misma dirección (sin importar mayúsculas) forman una parada. Pasa las órdenes a «asignada» (o «en_ruta» si la ruta ya está en curso). |
| `reprogramar_orden` | `p_orden`, `p_fecha` | Deja una orden fallida o pendiente en «pendiente» con la nueva fecha de entrega. |

Las tres exigen que el usuario sea admin y rechazan fechas anteriores a hoy (hora de Santiago).

### Edge Functions

| Función | Entrada | Salida |
| --- | --- | --- |
| `geocodificar` | `{ direccion }` | `{ lat, lng }` |
| `optimizar_ruta` | `{ puntos: [{ id, lat, lng }] }` | `{ orden: [id, …] }` |

Si `geocodificar` no existe o falla, el panel consulta Nominatim directamente como respaldo. `optimizar_ruta` no tiene respaldo: si falla, se ordena a mano con las flechas.

---

### OpenRouteService en el mapa

`services/ors.ts` llama a `POST /v2/directions/driving-car/geojson` (ruta por calles, hasta 50 paradas) y a `POST /optimization` (orden sugerido, primera parada como inicio). `MapaRuta` dibuja el resultado sobre OpenStreetMap con distancia y tiempo; si falla, vuelve a la línea punteada.

---

## 7. Reglas importantes

- El número de guía es obligatorio y único; se avisa si ya existe.
- Cada orden tiene fecha de entrega. Una orden nueva no puede quedar en el pasado; una atrasada se puede seguir editando sin cambiarle la fecha.
- Si una fecha de entrega pasa, la orden se puede reagendar (Órdenes y Pendientes).
- Los productos se eligen del catálogo, nunca se escriben a mano.
- El admin siempre valida el pin de la dirección en el mapa (la geocodificación gratuita puede fallar).
- Si varias órdenes del mismo cliente y dirección van en la misma ruta, se agrupan en una sola parada (casilla activada por defecto, desactivable).
- Con la ruta ya iniciada, el admin solo puede agregar paradas al final; no reordena ni quita.
- Cancelar una orden no la borra: queda en estado «cancelada» con motivo.
- Solo se ofrecen conductores con `activo = true`.

---

## 8. Validaciones, confirmaciones y avisos

Toda acción del panel pasa por tres capas: se **valida** lo que se ingresó, se **confirma** si la acción es importante y se **avisa** el resultado. Las reglas están centralizadas en `src/lib/validaciones.ts`; los avisos en `src/hooks/useAviso.tsx`; la confirmación en `src/components/ConfirmDialog.tsx`.

### Validación de campos

| Dónde | Regla |
| --- | --- |
| Orden: número de guía | Obligatorio, máximo 40 caracteres y único (se revisa al salir del campo y otra vez al guardar). |
| Orden: cliente | Obligatorio, entre 2 y 100 caracteres. |
| Orden: teléfono | Debe ser un móvil chileno válido; se normaliza a `+569XXXXXXXX`. |
| Orden: dirección | Obligatoria, entre 5 y 200 caracteres. |
| Orden: fecha de entrega | Obligatoria y con formato válido. No puede ser anterior a hoy, salvo que sea una orden atrasada que conserva su fecha. |
| Orden: notas | Máximo 500 caracteres. |
| Orden: pin del mapa | Debe existir y estar marcado como «en la ubicación correcta». |
| Orden: productos | Al menos uno, sin repetir, con cantidades enteras entre 1 y 9999. |
| Cancelar orden (motivo) | Obligatorio, entre 5 y 300 caracteres, con contador. |
| Reprogramar (nueva fecha) | Obligatoria y no anterior a hoy (el selector ya bloquea las fechas pasadas). |
| Armar ruta: fecha | Obligatoria y no anterior a hoy; mientras sea inválida, el botón Asignar queda desactivado. |
| Armar ruta: asignar | Exige conductor activo, al menos una orden y que todas sigan pendientes. |

En el formulario de orden los errores aparecen **bajo cada campo, en rojo**, y el cursor salta al primer campo con problema. El error de un campo desaparece apenas se vuelve a editar. Las mismas reglas de fechas y productos las vuelve a comprobar la base de datos, de modo que no se pueden saltar desde el navegador.

### Confirmaciones

| Acción | Confirmación |
| --- | --- |
| Asignar ruta | Diálogo con el resumen (órdenes, paradas, conductor y fecha) y aviso si hay órdenes con fecha posterior. |
| Cancelar orden (formulario y Pendientes) | Diálogo que exige un motivo válido; la orden no se borra. |
| Reprogramar orden | Diálogo que pide la nueva fecha antes de aplicarla. |
| Cerrar sesión | Diálogo «¿Quieres salir del panel?». |

Los botones se desactivan mientras la acción está en curso, para evitar envíos dobles.

### Avisos de resultado

Cada acción termina con un aviso flotante abajo a la derecha: verde si salió bien, rojo si falló y naranjo para información. Los de éxito se cierran solos a los 4,5 segundos y los de error a los 8; también se pueden cerrar con la ✕. Se usan en: orden creada o actualizada, orden cancelada, orden reprogramada, ruta optimizada, ruta asignada, errores del servidor y cierre de sesión.

## 9. Registro de lo que se hizo

| Etapa | Qué se hizo |
| --- | --- |
| **1. Creación del panel** | Proyecto Vite + React + TypeScript con Supabase y Leaflet. Login solo admin, lista de órdenes con filtros, formulario de orden con mapa y selector de productos, Armar ruta con orden manual y optimización, Resumen del día y Pendientes. Corresponde a las tareas 4-03 a 4-14, más versiones base de 4-16 y 4-18. |
| **2. Correcciones según «Problemas_Admin»** | Se alinearon los nombres con el esquema real: `created_at` → `creado_en`, `telefono` → `cliente_telefono`, `lat`/`lng` → `latitud`/`longitud`, `cantidad` → `cantidad_pedida`. En `asignar_ruta` los parámetros pasaron a `p_conductor` y `p_ordenes`. Las paradas se ordenan por `posicion_final`. El estado `parcial` pasó a `entregada_parcial` y se agregó `en_ruta`. Los conductores se filtran por `activo`. |
| **3. Fecha de entrega y funciones SQL** | Se adoptaron `guardar_orden` (transacción única) y `reprogramar_orden` (con nueva fecha). Se agregó el campo y el filtro de fecha de entrega, el diálogo de fecha, la agrupación de paradas (`p_agrupar`), la marca de órdenes atrasadas y el uso de la hora de Santiago. Se verificó que los parámetros del panel coinciden con las tres funciones SQL. |
| **4. Reagendar atrasadas** | Pendientes ahora incluye las órdenes pendientes con fecha vencida, con **Reprogramar** y **Cancelar**; Órdenes muestra **Reprogramar** para fallidas y atrasadas. |
| **5. Estilo** | Se añadió un fondo animado (columnas que flotan sobre un degradado). Pasó de azul oscuro tipo pantalla de inicio de PS2 a la paleta actual **verde, blanco y naranjo**: botones verdes, barra lateral verde oscura con la sección activa en naranjo, tarjetas blancas, pines y números de parada naranjos. Las etiquetas de estado se leen con espacio («en ruta», «entregada parcial»). Con «reducir movimiento» activado en el sistema, el fondo queda quieto. Los colores se cambian al inicio de `src/index.css` (`--primario`, `--acento`, `--acento-oscuro`). |
| **6. Validaciones y avisos** | Se centralizaron las reglas en `lib/validaciones.ts` (con 28 casos de prueba verificados), se agregaron errores por campo en el formulario de orden, el diálogo `ConfirmDialog` (asignar ruta y cerrar sesión), un motivo válido en las cancelaciones, el mínimo de fecha en Armar ruta y avisos flotantes de éxito y error en cada acción. |
| **7. OpenRouteService** | Nuevo `services/ors.ts` (ruta por calles y optimización con la clave `key_rutas` del `.env`). `MapaRuta` dibuja el recorrido real sobre OpenStreetMap con distancia y tiempo, y vuelve a la línea punteada si falla. `optimizacion.ts` usa ORS cuando hay clave y, si no, la Edge Function. `vite.config.ts` expone las variables con prefijo `key_`; se agregó `.env.example`. |
| **8. Botones de peligro** | `.btn-peligro` en `index.css` pasó de borde rojo con fondo blanco a **rojo sólido con letra blanca** (cancelar orden en Pendientes, formulario y diálogo de motivo). El tono se cambia con `--peligro`. |

### Estado de las tareas del plan

| Tarea | Estado |
| --- | --- |
| 4-03 Proyecto Vite, Supabase y Vercel | Listo (falta conectar el repo a Vercel, si no se hizo) |
| 4-04 Login solo admin | Listo |
| 4-05 Lista de órdenes | Listo |
| 4-06 a 4-09 Formulario de orden, productos, mapa con pin, guardar y editar | Listo |
| 4-10 y 4-11 Armar ruta y Asignar | Listo |
| 4-12 Filtros y búsqueda por guía | Listo |
| 4-13 y 4-14 Optimizar y ajustar el orden | Listo en el panel; depende de la Edge Function `optimizar_ruta` |
| 4-15 Agrupar órdenes del mismo cliente | Listo (casilla en Armar ruta; la regla la aplica `asignar_ruta`) |
| 4-16 Resumen del día | Versión base (rutas, paradas y estados) |
| 4-17 Fotos de las guías | **Pendiente** |
| 4-18 Pendientes de resolver | Fallidas, atrasadas: reprogramar y cancelar. Parciales: solo vista |
| 4-19 Orden con saldo | **Pendiente** |
| 4-20 Mapa en vivo de conductores | **Pendiente** |
| 4-21 a 4-23 Correcciones, guía del admin y publicación final | **Pendiente** |

---

## 10. Pendientes y puntos a vigilar

- **Fechas de entrega vacías.** El panel supone que `fecha_entrega` nunca es nula. Comprobar en Supabase: `select count(*) from ordenes where fecha_entrega is null;`. Si da más de 0 (órdenes anteriores a la columna), hay que rellenarlas o hacer el panel tolerante.
- **Entregas parciales.** Hoy solo se ven en Pendientes; su gestión depende de la tarea 4-19.
- **Cosas sin construir:** fotos de guías con enlaces temporales (4-17), orden con saldo (4-19) y mapa en vivo con Realtime (4-20).
- **Pruebas.** No hay pruebas automáticas. Lo revisado hasta ahora es que el proyecto compila (`tsc`) y genera el build de producción, que los parámetros coinciden con el código de las funciones SQL, que las reglas de validación pasan 28 casos de prueba y una revisión visual del estilo. **No se probó de punta a punta contra una base Supabase real.**
- **Tamaño del paquete.** El build avisa que el archivo principal supera los 500 kB; se puede dividir con importaciones dinámicas si importa el tiempo de carga.
- **Datos de demostración.** `seed.sql` usa clientes, teléfonos y productos ficticios, con direcciones y coordenadas aproximadas: sirve para probar pantallas, no para validar la geocodificación.
- **Seguridad.** El panel solo lleva la clave pública. La seguridad real está en las reglas RLS y en las funciones SQL (todas validan `es_admin()`). No subir nunca el `.env` ni la clave `service_role`.

---

## 11. Archivos del proyecto y qué cambió en cada uno

Las etapas son las del registro de la sección 9. «Nuevo» indica que el archivo no existía antes de esa etapa.

| Archivo (dentro de `admin/src/`) | Para qué sirve | Cambios |
| --- | --- | --- |
| `main.tsx` | Arranque de la aplicación. | — |
| `App.tsx` | Rutas y proveedores (sesión y avisos). | Etapa 5: agrega `Fondo`. Etapa 6: agrega `AvisoProvider`. |
| `index.css` | Estilos, variables de color, fondo animado, avisos y campos con error. | Etapa 5: fondo animado y paleta verde, blanco y naranjo. Etapa 6: estilos de avisos y campos inválidos. Etapa 8: botón de peligro en rojo sólido. |
| `hooks/useAuth.tsx` | Sesión, perfil y rol. | — |
| `hooks/useAviso.tsx` | Avisos flotantes de éxito, error e información. | **Nuevo** (etapa 6). |
| `lib/supabase.ts` | Cliente de Supabase con la clave pública. | — |
| `lib/leaflet.ts` | Arregla los íconos de Leaflet al empaquetar. | — |
| `lib/telefono.ts` | Normaliza y da formato a teléfonos chilenos. | — |
| `lib/fechas.ts` | Fechas: hoy en hora de Santiago y formatos. | Etapa 3: `hoyLocal()` usa la hora de Santiago y se agrega `formatearFecha`. |
| `lib/validaciones.ts` | Reglas de validación de órdenes, motivos y fechas de ruta. | **Nuevo** (etapa 6). |
| `types/index.ts` | Tipos y estados. | Etapa 2: nombres y estados del esquema real. Etapa 3: `fecha_entrega`. |
| `services/ordenes.ts` | Consultas y acciones sobre órdenes. | Etapa 2: nombres de columnas. Etapa 3: `guardar_orden`, `reprogramar_orden` y filtro por fecha de entrega. Etapa 4: filtro `entregaAntesDe`. |
| `services/rutas.ts` | Conductores, asignar ruta y rutas del día. | Etapa 2: parámetros de `asignar_ruta`, `posicion_final` y conductores activos. Etapa 3: `p_agrupar`. |
| `services/productos.ts`, `geocodificacion.ts` | Catálogo y geocodificación. | — |
| `services/optimizacion.ts` | Optimización de ruta. | Etapa 7: usa ORS si hay `key_rutas`; si no, la Edge Function. |
| `services/ors.ts` | Llamadas a OpenRouteService (direcciones y optimización). | **Nuevo** (etapa 7). |
| `components/Layout.tsx` | Barra lateral y protección de rutas. | Etapa 6: confirmación al cerrar sesión. |
| `components/Fondo.tsx` | Fondo animado decorativo. | **Nuevo** (etapa 5). |
| `components/EstadoBadge.tsx` | Etiqueta de color por estado. | Etapa 5: muestra el estado con espacios en vez de guion bajo. |
| `components/MapaPin.tsx`, `SelectorProductos.tsx` | Mapa con pin movible y selector de productos. | — |
| `components/MapaRuta.tsx` | Mapa de ruta con pines numerados. | Etapa 5: línea de la ruta en verde. Etapa 7: ruta por calles con ORS, distancia y tiempo. |
| `components/MotivoDialog.tsx` | Diálogo de motivo obligatorio. | Etapa 6: motivo de 5 a 300 caracteres, con contador. |
| `components/FechaDialog.tsx` | Diálogo para elegir una nueva fecha. | **Nuevo** (etapa 3). |
| `components/ConfirmDialog.tsx` | Confirmación antes de una acción importante. | **Nuevo** (etapa 6). |
| `pages/Login.tsx` | Acceso solo para admin. | — |
| `pages/Ordenes.tsx` | Lista, filtros y reprogramar. | Etapa 2: nombres de columnas. Etapa 3: columna y filtro de fecha de entrega. Etapa 4: botón Reprogramar. Etapa 6: avisos. |
| `pages/OrdenForm.tsx` | Crear y editar orden. | Etapa 2: nombres de columnas. Etapa 3: campo de fecha de entrega. Etapa 6: errores por campo y avisos. |
| `pages/ArmarRuta.tsx` | Elegir órdenes, agrupar, optimizar y asignar. | Etapa 2: nombres de columnas. Etapa 3: agrupar, atrasadas y fecha de entrega. Etapa 6: fecha mínima, diálogo de confirmación y avisos. |
| `pages/ResumenDia.tsx` | Rutas y paradas del día. | Etapa 2: posición de la parada. |
| `pages/Pendientes.tsx` | Fallidas, parciales y atrasadas. | Etapa 2: estado `entregada_parcial`. Etapa 3: reprogramar con fecha. Etapa 4: incluye pendientes atrasadas. Etapa 6: avisos. |

Fuera de `src/`: `vite.config.ts` (etapa 7: `envPrefix`), `.env.example` (etapa 7), `README.md` (resumen corto que remite a este documento), `package.json`, `vite.config.ts`, `tsconfig.json`, `vercel.json`, `index.html`, `.env.example` y `.gitignore`.

## 12. Cómo actualizar una copia existente del panel

1. Reemplazar la carpeta `src/` completa por la de la versión nueva. Si se copian solo algunos archivos, copiarlos todos juntos: por ejemplo, `OrdenForm.tsx` depende de `hooks/useAviso.tsx`, `lib/validaciones.ts` y `components/ConfirmDialog.tsx`.
2. Reemplazar `README.md` y `admin.md`.
3. Conservar el `.env` propio (no se sube a git ni va en el zip).
4. Si `package.json` no cambió, no hace falta volver a correr `npm install`.
5. Detener el servidor con `Ctrl+C`, volver a correr `npm run dev` y refrescar el navegador con `Ctrl+F5`.

## 13. Solución de problemas

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| Pantalla en blanco con `npm run dev`. | Falta el `.env` o tiene otro nombre. | Crear `admin/.env` con las dos variables y reiniciar el servidor. La consola (F12) dice «Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY». |
| «"vite" no se reconoce como un comando…». | No se instalaron las dependencias. | Ejecutar `npm install` dentro de `admin/`. |
| «Could not read package.json» (ENOENT). | Se está en la carpeta equivocada (la raíz del repo). | Entrar con `cd admin` y repetir. |
| «Esta cuenta no tiene permisos de administrador». | El usuario no tiene fila en `perfiles` con `rol = 'admin'`. | Crearla como en la sección 3. |
| Error de columna inexistente (`column … does not exist`). | La base y el panel usan nombres distintos. | Comparar con la sección 6 y con las migraciones. |
| Optimizar da error. | No está desplegada la Edge Function `optimizar_ruta`. | Ordenar a mano con las flechas ↑↓ hasta que exista. |
| Asignar o guardar dan error de función. | La migración correspondiente (005, 007 u 008) no está aplicada. | Aplicar las migraciones en Supabase. |
| El fondo no se mueve. | El sistema tiene activado «reducir movimiento». | Es intencional; se desactiva en las opciones de accesibilidad del sistema. |
