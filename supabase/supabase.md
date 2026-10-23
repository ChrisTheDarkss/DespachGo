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