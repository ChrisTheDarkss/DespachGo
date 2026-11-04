# /supabase – Base de datos y funciones

Todo lo que define el backend: tablas, reglas de seguridad, funciones y datos de prueba. Sirve a la app, al panel y al bot.

**Responsable:** Persona 1. Respaldo: Persona 5.

## Qué va en esta carpeta

- **Migraciones SQL** (`migrations/`): cada cambio a la base de datos, en archivos numerados por fecha.
- **Funciones** (`functions/`): Edge Functions, como la optimización de rutas y la geocodificación, que esconden las claves externas.
- **Datos de prueba** (`seed.sql`): catálogo de productos, usuarios y órdenes de ejemplo de Temuco, repetibles.
- Configuración local de Supabase (`config.toml`).

## Qué NO va aquí

- Claves ni contraseñas (ni la `SERVICE_ROLE_KEY` ni la clave de OpenRouteService). Se guardan como secretos de Supabase.
- Datos reales de clientes.
- Código de las pantallas o del bot.

## Estructura sugerida

```
supabase/
├── migrations/
│   ├── 001_perfiles_productos_ordenes.sql
│   ├── 002_rutas_paradas_entregas.sql
│   ├── 003_mensajes_ubicaciones.sql
│   ├── 004_reglas_de_acceso.sql
│   └── ...
├── functions/
│   ├── optimizar-ruta/
│   └── geocodificar/
├── seed.sql
└── config.toml
```

## Tablas del sistema

perfiles, productos, ordenes, orden_items, rutas, paradas, parada_ordenes, entregas, entrega_items, entrega_fotos, mensajes_whatsapp y ubicaciones_conductor. El detalle de campos está en el documento de diseño del MVP.

## Reglas importantes

- **Todo cambio a la base de datos va como migración**, no a mano en el panel de Supabase. Si no, el equipo queda con bases distintas.
- Activar reglas de acceso (RLS) en todas las tablas: el admin ve todo y el conductor solo la ruta del día que le corresponde.
- El bucket de fotos es privado; el acceso es solo para el admin y el conductor dueño, mediante enlaces temporales.
- Nunca borrar filas de órdenes, paradas o entregas: se cambia el estado (omitida, cancelada, fallida) para conservar el historial.
- El número de guía de la orden es único y obligatorio.
- El cierre automático de rutas a medianoche se programa con pg_cron.
- Probar las reglas de acceso con un usuario conductor real antes de cada demo.

## Funciones de base de datos previstas

asignar_ruta, iniciar_ruta, reintentar, finalizar_ruta y el cálculo del resultado de entrega (entregada, parcial, fallida).

## Primeras tareas

1-01 (proyecto Supabase), 1-04 a 1-06 (tablas), 1-07 (Auth y usuarios de prueba), 1-08 (reglas de acceso) y 1-09 (catálogo y órdenes de prueba).

## Primer avance: qué hay ya en esta carpeta

| Archivo | Qué hace |
|---|---|
| `migrations/001_perfiles_productos_ordenes.sql` | perfiles, productos, ordenes, orden_items |
| `migrations/002_rutas_paradas_entregas.sql` | rutas, paradas, parada_ordenes, entregas, entrega_items, entrega_fotos |
| `migrations/003_mensajes_ubicaciones.sql` | mensajes_whatsapp (cola del bot) y ubicaciones_conductor |
| `migrations/004_reglas_de_acceso.sql` | reglas de acceso (RLS), permisos, triggers y bucket privado `entregas` |
| `migrations/005_funciones_ruta_entrega.sql` | tabla `configuracion` y las funciones de ruta y entrega (ver abajo) |
| `migrations/006_cierre_nocturno.sql` | cierre automático de rutas olvidadas con pg_cron |
| `seed.sql` | catálogo de ejemplo y 20 órdenes de prueba (ficticias) |
| `seed_usuarios.sql` | perfiles de 1 admin y 3 conductores de prueba (hay que crear antes los usuarios en Auth) |
| `tests/rls_prueba.sql` | comprueba que cada conductor ve solo lo suyo y que nadie borra |
| `tests/funciones_prueba.sql` | recorre el flujo completo de un día de despacho con las funciones |

**Pendiente (siguientes avances):** funciones del admin para «Pendientes de resolver» (reprogramar, cancelar, crear orden con el saldo) y el bot de WhatsApp.

## Cómo aplicarlo

**Opción A, proyecto en supabase.com** (solo Persona 1 la primera vez)
1. Instalar la CLI de Supabase y entrar con `supabase login`.
2. Desde la raíz del repositorio: `supabase link --project-ref <ref>` y luego `supabase db push`.
3. En el SQL Editor, ejecutar `seed.sql`.
4. En Authentication > Users crear los 4 usuarios de prueba (ver `seed_usuarios.sql`) y ejecutar ese archivo.
5. Ejecutar `tests/rls_prueba.sql`. Debe terminar con el mensaje `RLS OK`.

**Opción B, local con Docker:** `supabase start`, luego `supabase db reset` (aplica migraciones y `seed.sql`), y los pasos 4 y 5.

## Decisiones tomadas en estos archivos (revisar en equipo)

- Una ruta por conductor y día (restricción `rutas_conductor_fecha_unica`).
- `entrega_fotos.orden_id` (opcional): relaciona la foto con una guía cuando una parada agrupa varias.
- `mensajes_whatsapp.estado` queda vacío en los mensajes recibidos; solo los enviados usan pendiente, enviado o error.
- Las tablas llevan `creado_por` donde importa saber quién lo hizo.
- El conductor ve las rutas desde que no están en borrador y su fecha es hoy o anterior (hora de Santiago).
- Las fotos van en el bucket privado `entregas`, con ruta `<entrega_id>/<archivo>`; primero se crea la entrega y luego se sube la foto.
- Nadie borra por la API: ni siquiera el admin.

## Funciones de ruta y entrega (migración 005)

La app no cambia estados directamente en las tablas: llama a estas funciones con `supabase.rpc('nombre', { ...parametros })`. Cada una valida quién llama y el estado actual.

| Función | Quién | Qué hace |
|---|---|---|
| `asignar_ruta(p_conductor, p_fecha, p_ordenes, p_agrupar)` | Admin | Crea la ruta o la completa. `p_ordenes` son órdenes pendientes en el orden sugerido. Agrupa las del mismo teléfono y dirección en una parada. Con la ruta en curso solo agrega paradas al final y crea sus mensajes |
| `iniciar_ruta(p_ruta)` | Conductor | Ruta en curso, órdenes en ruta y un mensaje de WhatsApp por parada. Devuelve cuántos creó |
| `reordenar_paradas(p_ruta, p_paradas)` | Conductor | Guarda su orden (debe traer todas las paradas). No toca el orden sugerido |
| `omitir_parada(p_parada, p_motivo, p_comentario)` | Conductor | Omite una parada pendiente |
| `registrar_entrega(p_parada, p_items, ...)` | Conductor | Crea la entrega y calcula si fue entregada, parcial o fallida. Devuelve `entrega_id` para subir las fotos |
| `registrar_entrega_fallida(p_parada, p_motivo, ...)` | Conductor | Entrega fallida; la parada queda «fallida por reintentar» |
| `reintentar_parada(p_parada)` | Conductor | Devuelve la parada a pendiente (el historial se conserva) |
| `finalizar_ruta(p_ruta)` | Conductor o admin | Aplica las reglas de cierre y devuelve un resumen |

`registrar_entrega` y `registrar_entrega_fallida` aceptan `p_entrega_id`: la app genera un UUID, y si repite la llamada con el mismo (doble toque, reintento sin señal) la entrega **no se duplica**.

Formato de `p_items` (todos los productos de la parada):

```json
[{ "orden_item_id": "uuid", "cantidad_entregada": 3, "motivo": "faltante" }]
```

El `motivo` solo es obligatorio si se entregó menos de lo pedido.

### Reglas de cierre (Finalizar ruta o cierre nocturno)

- Parada fallida por reintentar → fallida; sus órdenes → fallida.
- Parada omitida o sin visitar → sus órdenes vuelven a pendiente.
- Mensajes de WhatsApp aún sin enviar → se marcan con error (ya no corresponden).
- El cierre nocturno corre a las 03:05 y 04:05 UTC y solo cierra rutas con fecha anterior a hoy en Santiago, así que funciona con el horario de verano y de invierno. También devuelve a pendiente las órdenes de rutas asignadas que nunca se iniciaron.

### Estados de las órdenes en una parada agrupada

Cada orden se calcula con sus propios productos: todo completo → `entregada`; algo entregado → `entregada_parcial`; nada entregado mientras otra de la parada sí recibió → `fallida`.

### La foto de la guía

El servidor deja registrar la entrega antes de que la foto esté subida (por si no hay señal). La vista `entregas_sin_foto` lista las entregas completas o parciales a las que aún les falta la foto, y el resumen de `finalizar_ruta` trae su conteo. La app es la que debe exigir la foto antes de confirmar.

Orden en la app: 1) `registrar_entrega` 2) subir la foto al bucket `entregas` en `<entrega_id>/<archivo>` 3) insertar la fila en `entrega_fotos`.

### Nombre del negocio y textos del WhatsApp

Se guardan en la tabla `configuracion` y se editan sin tocar código. **Antes de usarlo con clientes reales:**

```sql
update public.configuracion set valor = 'Nombre de tu negocio' where clave = 'nombre_negocio';
```

Los textos de `mensaje_una_guia` y `mensaje_varias_guias` aceptan `{nombre}`, `{negocio}` y `{guias}`.

## Cómo probar las funciones

Después de aplicar `005` y `006` con `supabase db push`, ejecutar `tests/funciones_prueba.sql` en el SQL Editor. Debe terminar con `FUNCIONES OK`. Si algo falla, muestra `FALLO:` con el motivo.