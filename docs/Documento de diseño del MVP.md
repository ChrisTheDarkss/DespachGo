# Despacho (nombre en clave) – Documento de diseño del MVP

Estado: diseño cerrado, sin código. Ciudad de operación: Temuco.

## 1. Ficha del proyecto

**Descripción breve.** Aplicación móvil para conductores que gestiona órdenes de despacho. Permite consultar los productos de cada orden, seguir una ruta optimizada, notificar a los clientes por WhatsApp al iniciar el recorrido (con confirmación de recepción) y confirmar cada entrega con la foto de la guía firmada. Incluye un panel web donde un administrador ingresa las órdenes, arma las rutas y las asigna a los conductores.

**Objetivo general.** Desarrollar en 8 semanas (3 días de trabajo por semana) un MVP funcional que digitalice y optimice el despacho para 3 conductores en Temuco, reduciendo errores de entrega, manteniendo informado al cliente y registrando evidencia de cada entrega.

**Objetivos específicos.**

- Permitir al administrador crear órdenes, agruparlas en rutas y asignarlas a conductores.
- Generar una ruta optimizada que el conductor pueda reordenar u omitir.
- Notificar al cliente por WhatsApp al iniciar la ruta y recibir su confirmación.
- Registrar entregas completas, parciales y fallidas.
- Mostrar la ubicación de los conductores en tiempo real al administrador.

**Alcance.** 3 conductores, rutas de más de 8 paradas, una sola ciudad (Temuco, y Padre Las Casas si corresponde), uso en Android con teléfonos personales de los conductores.

**Equipo.** 4 personas, todas junior. Reparto base: A = app (órdenes y entrega), B = app (mapa y ruta), C = panel admin, D = base de datos y bot. Cada persona tiene un respaldo (A con B, C con D).

## 2. Tecnologías

| Capa | Tecnología | Costo |
| --- | --- | --- |
| App móvil (conductor) | React Native + Expo (development build con EAS Build), Expo Router | Gratis |
| Panel admin | React con Vite (o Next.js) | Gratis |
| Backend, BD y auth | Supabase (Postgres, Auth, Storage, Realtime, pg\_cron) | Plan gratuito |
| Bot de WhatsApp | Node.js + Baileys (o whatsapp-web.js), en un PC con un Android de chip dedicado | Gratis |
| Mapas en la app | react-native-maps o MapLibre | Gratis a este volumen |
| Mapas en el panel | Leaflet + OpenStreetMap | Gratis |
| Geocodificación | Nominatim limitado a Temuco, con validación del admin | Gratis |
| Optimización de rutas | OpenRouteService (VROOM), detrás de una interfaz intercambiable | Gratis con límite diario |
| Navegación | Deep link a Google Maps / Waze | Gratis |
| GPS | expo-location en segundo plano | Gratis |
| Fotos | expo-image-picker + expo-image-manipulator + Supabase Storage (bucket privado) | Gratis |
| Despliegue del panel | Vercel o Netlify | Gratis |
| Diseño | Figma | Gratis |

**Lenguajes:** TypeScript (o JavaScript), SQL (PostgreSQL), HTML/CSS, Node.js.

**Librerías complementarias:** Supabase JS, TanStack Query, Zod.

Los límites de los planes gratuitos deben verificarse en cada sitio antes de depender de ellos.

## 3. Repositorio y metodología

**Repositorio / plataforma.** GitHub con un monorepo de tres carpetas (`/mobile`, `/admin`, `/bot`), GitHub Projects como tablero, Supabase para los datos, Vercel para el panel y Figma para los diseños.

**Metodología.** Scrum adaptado a un equipo pequeño:

- 4 sprints de 2 semanas, cada uno con un objetivo visible y funcionando al cierre.
- Tablero Kanban: Por hacer / En curso / En revisión / Hecho.
- Planificación al inicio de cada sprint y demo al final.
- Daily corto (o asíncrono por chat) en cada día de trabajo.
- Una rama por tarea (`feature/...`), Pull Request revisado por otra persona, sin tocar `main` directo.
- Definición de "hecho": probado en un teléfono real y revisado por otra persona.
- Documento de acuerdos el primer día: nombres de tablas, formato de teléfono (+56 9...), formato de fechas.

## 4. Reglas de negocio

**Órdenes y guías**

- Cada compra es una orden, y cada orden tiene una guía de despacho en papel.
- El número de guía lo ingresa el admin al crear la orden; es obligatorio y único. La guía se imprime antes de salir.
- Los productos vienen de un catálogo conocido (el admin los elige de una lista). El catálogo se carga directo en Supabase en el MVP.
- Los conductores se crean directo en Supabase en el MVP (sin pantalla de mantenimiento).

**Armado de rutas**

- El admin crea las órdenes, luego las selecciona, elige fecha y conductor, optimiza y asigna.
- Si un cliente tiene varias órdenes en la misma ruta, se agrupan en una sola parada con varias guías. El cliente recibe un único WhatsApp que las lista.
- Una vez iniciada la ruta, el admin solo puede agregar paradas al final; no puede reordenar ni quitar.

**Conductor**

- Puede reordenar paradas (arrastrar) y omitirlas con motivo (calle cerrada, accidente, otro).
- Las paradas omitidas vuelven a pendiente para reprogramar, porque no son culpa del cliente.
- No hay promesa de turno en los mensajes, porque el orden cambia.

**Entregas**

- Resultados posibles: entregada, parcial, fallida.
- Entrega parcial: se registra la cantidad entregada de cada producto, con motivo por producto (faltante, dañado, rechazado). El resultado se calcula solo.
- Foto de la guía firmada: obligatoria para entregada y parcial, opcional para fallida (por ejemplo, problemas del vehículo o del tránsito). Puede haber más de una foto. Se muestra vista previa con opción de repetir.
- Calidad de foto: unos 800 a 1200 px de ancho (300 a 600 KB aprox.).
- Campo opcional "recibido por".
- Reintento el mismo día: tras una falla la parada queda como fallida por reintentar y el conductor puede pulsar Reintentar. Cada intento queda en el historial.
- Al pulsar Finalizar ruta, las paradas aún fallidas pasan a orden fallida. Si el conductor olvida finalizar, pg\_cron cierra las rutas a medianoche con la misma regla.
- Pendientes de resolver (admin): fallidas, omitidas y parciales, con las acciones reprogramar, cancelar o crear orden con el saldo (precargada con los productos faltantes). Cancelar no borra: pasa a cancelada con motivo.

## 5. WhatsApp

- Se usa una librería no oficial (Baileys) con un número dedicado en un Android con chip propio, vinculado por QR. Nunca el número personal o de la empresa.
- El bot corre en un PC encendido durante el horario de despachos, con la suspensión automática desactivada y sin exponer puertos a internet.
- La app nunca habla con WhatsApp: al pulsar Iniciar ruta se crean filas en la tabla de mensajes pendientes. El bot las lee, las envía espaciadas unos segundos y las marca como enviadas o con error. Si el PC se apaga, los mensajes quedan en cola.
- El servicio de mensajería se construye detrás de una interfaz (`enviarMensaje(telefono, texto)`) para poder migrar a la Cloud API oficial de Meta.
- Mensaje de ejemplo: "Hola Juan, soy \[Negocio\]. Tu pedido va en camino. ¿Habrá alguien para recibirlo? Responde 1 = Sí, 2 = No, 3 = Hablar con alguien."
- Respuestas: 1, 2 y 3 se guardan como confirmación en la parada (sin respuesta, confirmó, no habrá nadie, quiere hablar). Cualquier otro texto se guarda tal cual y se muestra al conductor.
- La app muestra el indicador de confirmación en cada parada. Si el cliente responde "No", el conductor puede moverla al final u omitirla.
- Los clientes son avisados previamente de que recibirán el mensaje.

## 6. GPS en tiempo real

- Seguimiento en segundo plano con expo-location y notificación fija visible mientras está activo.
- Activo solo entre Iniciar ruta y Finalizar ruta, con pantalla de consentimiento explícito del conductor.
- Se guarda solo la última posición de cada conductor (se sobrescribe).
- El panel muestra a los conductores en el mapa y el estado de las paradas con Supabase Realtime.
- Requiere development build (no funciona en Expo Go). Debe probarse desde la semana 1.
- En teléfonos Xiaomi, Samsung y Huawei hay que desactivar la optimización de batería para la app y probar en los teléfonos reales.
- La distribución es por APK, sin revisión de Google Play.

## 7. Modelo de datos

| Entidad | Contenido principal |
| --- | --- |
| **perfiles** | id, nombre, teléfono, rol (admin / conductor), activo |
| **productos** | id, nombre, unidad, activo |
| **ordenes** | id, número, `numero_guia` (único), nombre del cliente, teléfono, dirección, latitud, longitud, notas, estado, fecha, `motivo_cancelacion` |
| **orden\_items** | id, orden, producto, `cantidad_pedida` |
| **rutas** | id, conductor, fecha, estado, hora de inicio, hora de fin |
| **paradas** | id, ruta, posición sugerida, posición final, estado, motivo de omisión, `confirmacion_cliente` |
| **parada\_ordenes** | parada, orden (permite varias órdenes en una misma parada) |
| **entregas** | id, parada, resultado (entregada / parcial / fallida), motivo, comentario, `recibido_por`, fecha y hora, latitud y longitud |
| **entrega\_items** | entrega, item, `cantidad_entregada`, motivo |
| **entrega\_fotos** | id, entrega, ruta del archivo en Storage |
| **mensajes\_whatsapp** | id, parada, teléfono, texto, dirección (enviado / recibido), estado (pendiente / enviado / error), intentos, fecha |
| **ubicaciones\_conductor** | conductor, latitud, longitud, actualizado\_en |

**Relaciones.** Un conductor tiene muchas rutas; una ruta tiene muchas paradas; una parada agrupa una o más órdenes; una orden tiene muchos items; una parada puede tener varias entregas (reintentos); una entrega puede tener varias fotos.

**Estados**

- Orden: pendiente, asignada, en ruta, entregada, entregada parcial, fallida, cancelada.
- Parada: pendiente, entregada, parcial, fallida por reintentar, fallida, omitida.
- Ruta: borrador, asignada, en curso, finalizada.

**Decisiones de diseño**

- Orden y parada son entidades distintas, para poder reasignar una orden sin perder historial.
- Se guarda el orden sugerido aparte del orden final del conductor.
- Omitir, cancelar o fallar nunca borra filas.
- Las fotos van en un bucket privado, accesibles solo para el admin y el conductor dueño mediante enlaces temporales.
- Reglas de acceso por usuario: el conductor solo ve las órdenes de su ruta del día.
- Teléfonos normalizados al formato chileno (+56 9...).

## 8. Pantallas

**App del conductor**

1. Login.
2. Mi ruta de hoy: lista de paradas con estado e indicador de confirmación; botón Iniciar ruta.
3. Mapa de la ruta con pines numerados y recorrido.
4. Reordenar u omitir paradas con motivo.
5. Detalle de la parada: cliente, llamada con un toque, dirección, notas, productos y guías; botones Navegar y Registrar entrega.
6. Registrar entrega: cantidades por producto, motivo si hay diferencia, foto de la guía con vista previa, "recibido por" opcional, confirmar (con bloqueo de doble envío).
7. Entrega fallida: motivo y foto opcional; opción Reintentar.
8. Fin de ruta: resumen y Finalizar ruta.

Incluye un indicador de "pendiente de subir" para fotos sin señal, y la pantalla de consentimiento del GPS.

**Panel del administrador**

1. Login.
2. Órdenes: tabla con filtros por estado y fecha, búsqueda por número de guía, y Nueva orden.
3. Crear y editar orden: datos del cliente, dirección con mapa para validar y mover el pin, productos del catálogo, número de guía.
4. Armar ruta: seleccionar órdenes pendientes, fecha y conductor, Optimizar, ajustar y asignar.
5. Resumen del día con fotos de las guías y mapa en vivo de conductores.
6. Pendientes de resolver: reprogramar, cancelar o crear orden con el saldo.

## 9. Plan de sprints (4 sprints de 2 semanas)

| Sprint | Objetivo visible al final | A | B | C | D |
| --- | --- | --- | --- | --- | --- |
| **1** (sem. 1-2) | El admin crea una orden y el conductor inicia sesión | Login y lista de rutas (datos de prueba) | Proyecto Expo con development build y navegación | Login, catálogo y formulario de orden con mapa | Esquema de BD, reglas de acceso, catálogo cargado; prueba mínima de envío con Baileys |
| **2** (sem. 3-4) | Ruta asignada, entrega con foto, parcial y fallida | Detalle de parada, registro de entrega, foto con vista previa, subida con reintento | Mapa con pines y botón Navegar | Armar ruta y asignar, resumen del día con fotos | Storage de fotos, cálculo de estados |
| **3** (sem. 5-6) | WhatsApp bidireccional y ruta optimizada | Indicador de confirmación, reintentar, finalizar ruta | Reordenar y omitir, integración con optimización | Botón Optimizar, pendientes de resolver | Bot Baileys: envío, cola, respuestas 1/2/3 |
| **4** (sem. 7-8) | GPS en vivo, pruebas reales y entrega | Pulido de UX, estados de carga y errores | GPS en segundo plano y consentimiento | Mapa en vivo con Realtime | pg\_cron de cierre nocturno, pruebas del bot |

**Orden de construcción:** orden con catálogo, ruta y asignación, conductor ve su ruta, entrega con foto y reintento, WhatsApp, optimización, GPS en tiempo real.

**Riesgos**

- Sprint 1: que el development build tarde en funcionar; resolverlo el primer día.
- Sprint 3: es el más cargado. Si se atrasa, la optimización se deja con orden manual.
- Sprint 4: el GPS en segundo plano es lo más impredecible. La semana 8 queda casi libre como buffer.
- Transversal: bloqueo del número de WhatsApp por usar librería no oficial; mitigar con chip dedicado, mensajes espaciados y aviso previo a los clientes.
- Transversal: calidad de la geocodificación en direcciones de Temuco; mitigar con validación del pin por el admin. Armar 15 a 20 direcciones reales de prueba desde el sprint 2.
