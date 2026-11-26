# /mobile – App del conductor

App Android que usan los conductores durante el despacho. Está hecha con React Native, Expo (development build), Expo Router y TypeScript.

**Responsables:** Persona 2 (órdenes, entrega, fotos) y Persona 3 (mapa, ruta, GPS).

## Qué va en esta carpeta

- Todo el código de la app del conductor.
- Configuración de Expo y de EAS Build (`app.json`, `eas.json`).
- Recursos visuales de la app (ícono, pantalla de carga).
- El archivo `.env.example` con los nombres de las variables (sin valores reales).

## Qué NO va aquí

- Lógica del bot de WhatsApp (va en `/bot`).
- Pantallas del administrador (van en `/admin`).
- Claves privadas de Supabase (`SERVICE_ROLE_KEY`). La app solo usa la clave pública (`ANON_KEY`).
- El archivo `.env` real ni los APK generados.

## Estructura sugerida

```
mobile/
├── app/                 Pantallas (Expo Router)
│   ├── login.tsx
│   ├── (tabs)/          Mi ruta de hoy y mapa
│   ├── gps-consent.tsx  Consentimiento antes de iniciar la ruta
│   ├── route-summary.tsx Resumen y cierre de la ruta
│   └── stop/
│       ├── [id].tsx     Detalle de la parada
│       └── [id]/
│           ├── delivery.tsx Registrar entrega
│           └── failed.tsx   Registrar entrega fallida
├── src/
│   ├── components/      Botones, tarjetas de parada, selector de cantidad...
│   ├── lib/             Cliente de Supabase
│   ├── services/        Entregas, fotos (compresión y subida), ubicación
│   ├── hooks/           Lógica reutilizable (ruta del día, sesión)
│   ├── types/           Tipos de TypeScript (Orden, Parada, Entrega...)
│   └── utils/           Funciones pequeñas (teléfonos, fechas)
├── assets/
├── app.json
├── eas.json
├── .env.example
└── package.json
```

## Pantallas de esta carpeta

Login, Mi ruta de hoy, Detalle de parada, Registrar entrega, Entrega fallida, Mapa de la ruta, Reordenar y omitir, Fin de ruta y Consentimiento de GPS.

## Reglas importantes

- Probar siempre con el development build en un celular real; Expo Go no soporta el GPS en segundo plano.
- Los botones deben ser grandes y legibles: se usan en la calle y con una mano.
- Bloquear el doble envío al confirmar una entrega.
- Comprimir la foto de la guía a unos 1000 px antes de subirla; si no hay señal, guardarla localmente y reintentar.
- La cola de entregas y la ruta/detalle en caché se guardan por conductor en el almacenamiento local. La sincronización se reintenta al abrir la app o recuperar conexión mientras está en primer plano.
- En Android/iOS las fotos pendientes se guardan en el directorio privado de la app; en web se guardan en IndexedDB, ya que Expo FileSystem no está disponible en navegador.
- El orden de sincronización de fotos es: registrar la entrega con un UUID idempotente, subir cada foto al bucket privado `entregas` y registrar su fila en `entrega_fotos`.
- Una entrega completa o parcial exige una foto por guía; una entrega fallida permite adjuntar una foto opcional.
- El GPS se activa solo entre «Iniciar ruta» y «Finalizar ruta», y solo con consentimiento del conductor.
- En Android/iOS se solicita permiso de ubicación en primer plano y segundo plano; en web solo se actualiza mientras la pestaña está abierta. El seguimiento móvil usa un servicio visible de Android y se detiene al confirmar el cierre.
- La app no habla directo con WhatsApp: al iniciar la ruta se crean filas en la base de datos y el bot las envía.

## Primeras tareas

3-01 y 3-02 (development build en un celular real), 3-03 (navegación y cliente Supabase), 2-03 (login) y 2-04 (lista de ruta con datos de prueba).