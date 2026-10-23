# Despacho – Plan de trabajo de 1 mes

Equipo: 5 personas (Persona 1 a Persona 5). Este plan complementa el documento de diseño del MVP. El seguimiento día a día se lleva en el documento «Despacho – Registro de avance».

## 1. Supuestos y cómo leer este plan

- **1 mes = 4 semanas × 3 días de trabajo = 12 días** (Día 1 a Día 12). Si trabajan más días por semana, hay holgura extra.
- 5 personas × 12 días = 60 días-persona. El plan original de 8 semanas con 4 personas daba cerca de 96, así que hay que priorizar (sección 5).
- Cada tarea cabe en media jornada o menos. El ID es persona-número: **2-07** es la tarea 7 de la Persona 2.
- Estados: Pendiente, En curso, En revisión, Hecho. Se actualizan en este documento y en el tablero de GitHub Projects.
- Los Días 3, 6, 9 y 12 son de integración y demo: se une todo lo hecho en la semana, se prueba en un celular real y se corrige antes de seguir.
- Optimización de rutas y geocodificación corren como funciones de Supabase (Edge Functions), no en el PC del bot, para no exponer el PC a internet y esconder las claves.

## 2. Roles

| Persona | Responsabilidad principal | Respaldo |
| --- | --- | --- |
| **Persona 1** | Base de datos, Supabase, seguridad, integración, pruebas y lanzamiento (coordinación técnica) | Persona 5 |
| **Persona 2** | App: detalle de parada, registro de entrega, fotos, reintentos | Persona 3 |
| **Persona 3** | App: development build, mapa, ruta, reordenar/omitir y GPS en segundo plano | Persona 2 |
| **Persona 4** | Panel admin web: órdenes, armar ruta, resumen del día, pendientes | Persona 1 |
| **Persona 5** | Bot de WhatsApp, geocodificación y optimización de ruta | Persona 1 |

## 3. Reglas de trabajo

- Una rama por tarea (`feature/2-07-motivo-parcial`), Pull Request revisado por otra persona, nunca se sube directo a `main`.
- Daily de 10 minutos al inicio de cada día de trabajo: qué hice, qué haré, qué me bloquea.
- Una tarea está «Hecha» cuando funciona en un celular real o en el panel desplegado y otra persona la revisó.
- Al terminar cada día, cada persona actualiza el estado de sus tareas y, si hay algo importante, lo anota en el Registro de avance.
- Si una tarea lleva más de media jornada atascada, se pide ayuda al respaldo: no se espera al día de integración.

## 4. Hitos

| Semana | Días | Objetivo visible al final (demo) |
| --- | --- | --- |
| **1** | 1–3 | El admin crea una orden, un conductor inicia sesión desde un development build y el bot envía un mensaje de prueba. |
| **2** | 4–6 | El admin arma y asigna una ruta, el conductor la ve, registra una entrega con foto y el bot envía mensajes desde la cola. |
| **3** | 7–9 | Flujo completo: ruta optimizada, iniciar ruta, WhatsApp con respuestas, reordenar/omitir, reintentos y finalizar ruta. |
| **4** | 10–12 | Pruebas con conductores reales, GPS en vivo (si es estable), APK instalado y lanzamiento. |

## 5. Prioridades (qué recortar si vamos atrasados)

- **Imprescindible:** crear orden, armar ruta con orden manual, ver la ruta, registrar entrega con foto (completa, parcial y fallida), estados correctos.
- **Importante:** WhatsApp con confirmación del cliente, optimización de ruta, reordenar/omitir, reintentar, finalizar ruta, pendientes de resolver.
- **Deseable:** GPS en segundo plano, mapa en vivo, crear orden con saldo, agrupación asistida de órdenes.

Punto de decisión en el **Día 9**: si hay atraso, lo deseable pasa a después del lanzamiento. El GPS en segundo plano es el mayor riesgo técnico.

## 6. Plan por semana

### Semana 1 (Días 1–3): fundamentos

| ID | Persona | Día | Tarea | Estado |
| --- | --- | --- | --- | --- |
| 1-01 | 1 | 1 | Crear proyecto Supabase y repositorio GitHub con carpetas /mobile, /admin y /bot; proteger main e invitar al equipo | Pendiente |
| 1-02 | 1 | 1 | Escribir el documento de acuerdos: nombres de tablas, formato de teléfono (+56 9), fechas y estados | Pendiente |
| 1-03 | 1 | 1 | Crear el tablero GitHub Projects con las tareas de este plan | Pendiente |
| 1-04 | 1 | 2 | Crear tablas perfiles, productos, ordenes y orden\_items | Pendiente |
| 1-05 | 1 | 2 | Crear tablas rutas, paradas, parada\_ordenes, entregas, entrega\_items y entrega\_fotos | Pendiente |
| 1-06 | 1 | 2 | Crear tablas mensajes\_whatsapp y ubicaciones\_conductor | Pendiente |
| 1-07 | 1 | 3 | Configurar Auth y crear 1 admin y 3 conductores de prueba | Pendiente |
| 1-08 | 1 | 3 | Reglas de acceso básicas: admin ve todo, conductor solo su ruta | Pendiente |
| 1-09 | 1 | 3 | Cargar catálogo de productos y 20 órdenes con direcciones reales de Temuco (con Persona 5) | Pendiente |
| 2-01 | 2 | 1 | Wireframes en Figma: login, Mi ruta de hoy y detalle de parada (con Persona 3) | Pendiente |
| 2-02 | 2 | 2 | Wireframes: registrar entrega, entrega fallida y fin de ruta | Pendiente |
| 2-03 | 2 | 3 | Pantalla de login conectada a Supabase Auth | Pendiente |
| 2-04 | 2 | 3 | Pantalla Mi ruta de hoy con datos de prueba (lista simple) | Pendiente |
| 3-01 | 3 | 1 | Crear proyecto Expo y generar el primer development build con EAS | Pendiente |
| 3-02 | 3 | 1 | Instalar el build en un celular Android real; si falla, pedir ayuda ese mismo día | Pendiente |
| 3-03 | 3 | 2 | Estructura de navegación y cliente Supabase compartido (con Persona 2) | Pendiente |
| 3-04 | 3 | 2 | Wireframes: mapa de ruta, reordenar/omitir y consentimiento de GPS | Pendiente |
| 3-05 | 3 | 3 | Prueba mínima: mapa con 3 pines fijos en Temuco | Pendiente |
| 3-06 | 3 | 3 | Prueba mínima: pedir permiso de ubicación y leer el GPS una vez | Pendiente |
| 4-01 | 4 | 1 | Wireframes del panel: lista de órdenes, crear orden y armar ruta | Pendiente |
| 4-02 | 4 | 2 | Wireframes: resumen del día y pendientes de resolver | Pendiente |
| 4-03 | 4 | 2 | Crear proyecto Vite + React, conectar a Supabase y desplegar en Vercel | Pendiente |
| 4-04 | 4 | 3 | Login del admin (solo rol admin) | Pendiente |
| 4-05 | 4 | 3 | Lista de órdenes leyendo la base de datos | Pendiente |
| 5-01 | 5 | 1 | Preparar el Android con chip dedicado y WhatsApp; instalar Node.js en el PC servidor y desactivar la suspensión | Pendiente |
| 5-02 | 5 | 1 | Proyecto /bot con Baileys: vincular por QR y enviar un mensaje a un número conocido | Pendiente |
| 5-03 | 5 | 2 | Crear la interfaz enviarMensaje(telefono, texto) separada del código de Baileys | Pendiente |
| 5-04 | 5 | 2 | Función para normalizar teléfonos al formato +56 9, con pruebas | Pendiente |
| 5-05 | 5 | 3 | Probar Nominatim con 20 direcciones de Temuco y anotar aciertos y fallas | Pendiente |
| 5-06 | 5 | 3 | Crear cuenta en OpenRouteService y probar una optimización con 8 puntos | Pendiente |

### Semana 2 (Días 4–6): ruta asignada y entrega con foto

| ID | Persona | Día | Tarea | Estado |
| --- | --- | --- | --- | --- |
| 1-10 | 1 | 4 | Función asignar\_ruta: crea paradas con posición y pasa las órdenes a «asignada» | Pendiente |
| 1-11 | 1 | 4 | Crear bucket privado de fotos con acceso solo para admin y conductor dueño | Pendiente |
| 1-12 | 1 | 5 | Función que calcula el resultado de la entrega (entregada, parcial, fallida) desde entrega\_items | Pendiente |
| 1-13 | 1 | 5 | Función iniciar\_ruta: pone la ruta en curso y crea una fila de mensaje por parada | Pendiente |
| 1-14 | 1 | 6 | Revisar los PRs de la semana y probar el flujo admin → conductor completo | Pendiente |
| 1-15 | 1 | 6 | Script de datos de prueba que se pueda repetir | Pendiente |
| 2-05 | 2 | 4 | Detalle de parada: cliente, botón llamar, dirección, notas, guías y productos | Pendiente |
| 2-06 | 2 | 4 | Registrar entrega: lista de productos con cantidad pedida y entregada (por defecto la total) | Pendiente |
| 2-07 | 2 | 5 | Si hay diferencia, pedir motivo por producto | Pendiente |
| 2-08 | 2 | 5 | Tomar foto de la guía con la cámara, vista previa, repetir y comprimir a unos 1000 px | Pendiente |
| 2-09 | 2 | 5 | Subir la foto a Storage y vincularla a la entrega | Pendiente |
| 2-10 | 2 | 6 | Cola local de subida: guardar la foto si no hay señal, reintentar e indicar «pendiente de subir» | Pendiente |
| 2-11 | 2 | 6 | Bloquear el doble envío del botón confirmar y mostrar éxito o error | Pendiente |
| 2-12 | 2 | 6 | Pantalla de entrega fallida: motivo y foto opcional | Pendiente |
| 3-07 | 3 | 4 | Mapa de la ruta con pines numerados según la posición de las paradas | Pendiente |
| 3-08 | 3 | 4 | Botón Navegar que abre Google Maps o Waze con la dirección | Pendiente |
| 3-09 | 3 | 5 | Mi ruta de hoy con datos reales (paradas, estado y orden) | Pendiente |
| 3-10 | 3 | 5 | Botón Iniciar ruta con confirmación, conectado a iniciar\_ruta | Pendiente |
| 3-11 | 3 | 6 | Pantalla de fin de ruta con el resumen de entregadas, parciales, fallidas y omitidas | Pendiente |
| 3-12 | 3 | 6 | Botón Finalizar ruta básico (cierra la ruta; las reglas finas llegan en la semana 3) | Pendiente |
| 4-06 | 4 | 4 | Formulario Nueva orden: cliente, teléfono, dirección, notas y número de guía (obligatorio y único) | Pendiente |
| 4-07 | 4 | 4 | Selector de productos del catálogo con cantidades | Pendiente |
| 4-08 | 4 | 5 | Mapa Leaflet en el formulario: buscar dirección en Temuco, mostrar el pin y permitir moverlo | Pendiente |
| 4-09 | 4 | 5 | Guardar y editar órdenes, avisando si la guía ya existe | Pendiente |
| 4-10 | 4 | 6 | Pantalla Armar ruta: elegir órdenes pendientes, fecha y conductor | Pendiente |
| 4-11 | 4 | 6 | Botón Asignar: crea la ruta y las paradas con orden manual inicial | Pendiente |
| 4-12 | 4 | 6 | Filtros por estado y fecha, y búsqueda por número de guía en la lista de órdenes | Pendiente |
| 5-07 | 5 | 4 | Bot: leer mensajes pendientes de la tabla y enviarlos con pausa de 5 a 10 segundos | Pendiente |
| 5-08 | 5 | 4 | Marcar cada mensaje como enviado o con error y contar intentos | Pendiente |
| 5-09 | 5 | 5 | Plantilla del mensaje con nombre del cliente y del negocio, y opciones 1, 2 y 3 | Pendiente |
| 5-10 | 5 | 5 | Reconexión automática del bot y registro de logs en archivo | Pendiente |
| 5-11 | 5 | 6 | Función de geocodificación reutilizable (dirección a coordenadas, limitada a Temuco) para el panel | Pendiente |
| 5-12 | 5 | 6 | Función de optimización: recibe coordenadas y devuelve el orden sugerido, detrás de una interfaz | Pendiente |

### Semana 3 (Días 7–9): flujo completo

| ID | Persona | Día | Tarea | Estado |
| --- | --- | --- | --- | --- |
| 1-16 | 1 | 7 | Función reintentar: devuelve una parada fallida a pendiente conservando el historial | Pendiente |
| 1-17 | 1 | 7 | Función finalizar\_ruta: fallidas pasan a orden fallida y omitidas vuelven a pendiente | Pendiente |
| 1-18 | 1 | 8 | Cierre automático de rutas a medianoche con pg\_cron, con la misma regla | Pendiente |
| 1-19 | 1 | 8 | Consulta que detecta órdenes del mismo teléfono o dirección para proponer agruparlas | Pendiente |
| 1-20 | 1 | 9 | Probar las reglas de acceso: un conductor no debe ver rutas ajenas | Pendiente |
| 1-21 | 1 | 9 | Prueba integral con 3 usuarios a la vez y lista de errores | Pendiente |
| 2-13 | 2 | 7 | Registrar entrega de una parada con varias guías (una o más fotos por guía) | Pendiente |
| 2-14 | 2 | 7 | Botón Reintentar en paradas fallidas | Pendiente |
| 2-15 | 2 | 8 | Campo opcional «recibido por» | Pendiente |
| 2-16 | 2 | 8 | Indicador de confirmación del cliente en cada parada (confirmó, no habrá nadie, sin respuesta, quiere hablar) | Pendiente |
| 2-17 | 2 | 9 | Estados de carga, mensajes de error claros y aviso de falta de conexión | Pendiente |
| 2-18 | 2 | 9 | Corregir errores detectados en la prueba integral | Pendiente |
| 3-13 | 3 | 7 | Reordenar paradas arrastrando y guardar la posición final, dejando la sugerida aparte | Pendiente |
| 3-14 | 3 | 7 | Omitir parada con motivo (calle cerrada, accidente, otro) | Pendiente |
| 3-15 | 3 | 8 | Opción «mover al final» para clientes que respondieron que no habrá nadie | Pendiente |
| 3-16 | 3 | 8 | Colores de estado en los pines del mapa (pendiente, entregada, fallida, omitida) | Pendiente |
| 3-17 | 3 | 9 | Mostrar en la app el orden optimizado que dejó el admin y probar que se respeta | Pendiente |
| 3-18 | 3 | 9 | Corregir errores detectados en la prueba integral | Pendiente |
| 4-13 | 4 | 7 | Botón Optimizar en Armar ruta: llama a la función y dibuja el orden sugerido en el mapa | Pendiente |
| 4-14 | 4 | 7 | Permitir al admin ajustar el orden sugerido antes de asignar | Pendiente |
| 4-15 | 4 | 8 | Proponer agrupar órdenes del mismo cliente en una parada y dejar que el admin confirme | Pendiente |
| 4-16 | 4 | 8 | Pantalla Resumen del día: rutas por conductor y estado de cada parada | Pendiente |
| 4-17 | 4 | 9 | Ver las fotos de las guías desde el resumen con enlaces temporales | Pendiente |
| 4-18 | 4 | 9 | Pantalla Pendientes de resolver: fallidas, omitidas y parciales, con reprogramar y cancelar (con motivo) | Pendiente |
| 5-13 | 5 | 7 | Bot: recibir respuestas de los clientes y asociarlas a la parada más reciente de ese teléfono | Pendiente |
| 5-14 | 5 | 7 | Interpretar 1, 2 y 3 y guardar la confirmación; cualquier otro texto se guarda tal cual | Pendiente |
| 5-15 | 5 | 8 | Guardar los mensajes recibidos en mensajes\_whatsapp con dirección «recibido» | Pendiente |
| 5-16 | 5 | 8 | Un solo mensaje cuando la parada tiene varias guías | Pendiente |
| 5-17 | 5 | 9 | Desplegar la función de optimización en Supabase y conectarla al panel (con Persona 4) | Pendiente |
| 5-18 | 5 | 9 | Plan B: si OpenRouteService falla o se pasa del límite, ordenar por cercanía (vecino más cercano) | Pendiente |

### Semana 4 (Días 10–12): GPS, pruebas reales y lanzamiento

| ID | Persona | Día | Tarea | Estado |
| --- | --- | --- | --- | --- |
| 1-22 | 1 | 10 | Checklist de seguridad: claves fuera del repositorio, bucket privado y reglas de acceso revisadas | Pendiente |
| 1-23 | 1 | 10 | Limpiar datos de prueba y crear los usuarios reales | Pendiente |
| 1-24 | 1 | 11 | Coordinar la prueba con conductores reales (una ruta real o simulada) y recoger problemas | Pendiente |
| 1-25 | 1 | 11 | Priorizar errores: los críticos se corrigen ahora, el resto va a la lista posterior al lanzamiento | Pendiente |
| 1-26 | 1 | 12 | Etiquetar la versión 1.0 en GitHub y hacer el respaldo final de la base de datos | Pendiente |
| 1-27 | 1 | 12 | Reunión de cierre y retrospectiva del equipo | Pendiente |
| 2-19 | 2 | 10 | Pulir textos y botones grandes y legibles para usar en la calle | Pendiente |
| 2-20 | 2 | 10 | Probar 20 entregas simuladas (completas, parciales y fallidas) y corregir | Pendiente |
| 2-21 | 2 | 11 | Corregir los errores de la prueba con conductores | Pendiente |
| 2-22 | 2 | 12 | Guía de una página con capturas para los conductores | Pendiente |
| 3-19 | 3 | 10 | Pantalla de consentimiento del GPS con texto claro, aceptar o rechazar (deseable) | Pendiente |
| 3-20 | 3 | 10 | Seguimiento en segundo plano solo entre Iniciar y Finalizar ruta, con notificación fija (deseable) | Pendiente |
| 3-21 | 3 | 11 | Enviar la última posición a ubicaciones\_conductor cada 30 a 60 segundos (deseable) | Pendiente |
| 3-22 | 3 | 11 | Probar en celulares reales con la optimización de batería desactivada y usando Waze o Google Maps | Pendiente |
| 3-23 | 3 | 12 | Generar el APK de producción con EAS Build y preparar el enlace de instalación | Pendiente |
| 3-24 | 3 | 12 | Instalar la app en los 3 celulares de los conductores | Pendiente |
| 4-19 | 4 | 10 | Crear orden con el saldo, precargada con los productos faltantes (deseable) | Pendiente |
| 4-20 | 4 | 10 | Mapa en vivo con la posición de los conductores usando Realtime (deseable) | Pendiente |
| 4-21 | 4 | 11 | Corregir errores del panel detectados en las pruebas | Pendiente |
| 4-22 | 4 | 12 | Guía de una página para el admin: crear orden, armar ruta y resolver pendientes | Pendiente |
| 4-23 | 4 | 12 | Publicación final del panel en Vercel y verificación | Pendiente |
| 5-19 | 5 | 10 | Prueba larga del bot: 20 mensajes espaciados con respuestas, y ajustes contra bloqueos | Pendiente |
| 5-20 | 5 | 10 | Redactar el aviso previo que se enviará a los clientes sobre el mensaje de WhatsApp | Pendiente |
| 5-21 | 5 | 11 | Procedimiento por si el bot se cae: cómo reiniciarlo y volver a escanear el QR | Pendiente |
| 5-22 | 5 | 11 | Forma simple de ver los mensajes con error (log o pantalla en el panel) | Pendiente |
| 5-23 | 5 | 12 | Dejar el bot corriendo como servicio en el PC, con inicio automático y sin suspensión | Pendiente |
| 5-24 | 5 | 12 | Documento de operación del bot de una página | Pendiente |

## 7. Guía de wireframes (Figma)

Hacerlos en baja fidelidad (cajas, textos y botones; sin colores ni imágenes), en los Días 1 y 2. Cada persona dibuja las pantallas de su parte y las revisa otra. Orden de prioridad:

**App del conductor** (Personas 2 y 3, formato celular vertical)

1. Login: correo, contraseña, botón entrar.
2. Mi ruta de hoy: lista de paradas con número, cliente, dirección, estado e indicador de confirmación del cliente; botón Iniciar ruta abajo.
3. Detalle de parada: datos del cliente, llamar, productos y guías, botones Navegar y Registrar entrega.
4. Registrar entrega: productos con cantidad pedida y entregada, motivo si hay diferencia, foto de la guía con vista previa, «recibido por», confirmar.
5. Entrega fallida: motivo, foto opcional, confirmar.
6. Mapa de la ruta: pines numerados y botón para volver a la lista.
7. Reordenar y omitir: lista arrastrable y menú Omitir con motivo.
8. Fin de ruta: resumen y botón Finalizar.
9. Consentimiento de GPS: texto simple, aceptar y rechazar.

**Panel del administrador** (Persona 4, formato escritorio)

1. Órdenes: tabla con filtros, búsqueda por guía y botón Nueva orden.
2. Crear y editar orden: datos del cliente, mapa con pin movible, productos del catálogo, número de guía.
3. Armar ruta: órdenes pendientes a la izquierda, mapa con el orden sugerido a la derecha, botones Optimizar y Asignar.
4. Resumen del día: rutas por conductor, estado de paradas, fotos y mapa en vivo.
5. Pendientes de resolver: fallidas, omitidas y parciales con sus acciones.

Consejos: botones grandes (se usan con una mano y en la calle), pocos colores, texto legible al sol y los mismos nombres de estados que el documento de acuerdos.

## 8. Riesgos y plan B

| Riesgo | Cuándo aparece | Plan B |
| --- | --- | --- |
| El development build no se instala o falla | Día 1 | Probar con otro celular, pedir ayuda al respaldo ese mismo día; sin build no hay GPS en segundo plano |
| WhatsApp bloquea el número | Semanas 2 a 4 | Mensajes espaciados, chip dedicado, aviso previo; si ocurre, pasar a la Cloud API oficial de Meta usando la interfaz enviarMensaje |
| Nominatim geocodifica mal las direcciones | Semana 1 en adelante | El admin mueve el pin en el mapa; si es muy malo, evaluar Google Geocoding |
| OpenRouteService cae o se pasa del límite | Semana 3 | Orden por cercanía calculado localmente o, en último caso, orden manual |
| Atraso por dependencias entre personas | Todas | Usar datos de prueba mientras llega lo real; días de integración 3, 6, 9 y 12 |
| GPS en segundo plano inestable en los celulares | Semana 4 | Dejarlo para después del lanzamiento; el resto de la app no depende de él |
| El PC del bot se apaga | Siempre | Los mensajes quedan en cola y salen al reconectarse; procedimiento 5-21 |

## 9. Checklist de lanzamiento (Día 12)

| Punto | Responsable | Estado |
| --- | --- | --- |
| Datos de prueba eliminados y usuarios reales creados | Persona 1 | Pendiente |
| Claves y secretos fuera del repositorio | Persona 1 | Pendiente |
| Respaldo final de la base de datos | Persona 1 | Pendiente |
| APK instalado en los 3 celulares y optimización de batería desactivada | Persona 3 | Pendiente |
| Conductores capacitados con la guía de una página | Persona 2 | Pendiente |
| Admin capacitado con su guía | Persona 4 | Pendiente |
| Panel publicado y funcionando en Vercel | Persona 4 | Pendiente |
| Bot corriendo como servicio y número dedicado vinculado | Persona 5 | Pendiente |
| Clientes avisados del mensaje de WhatsApp | Persona 5 | Pendiente |
| Primera ruta real ejecutada con seguimiento del equipo | Todos | Pendiente |
| Lista de mejoras posteriores al lanzamiento creada | Persona 1 | Pendiente |

## 10. Ajuste: 4 días de trabajo por semana (16 días)

Si el equipo trabaja unos 4 días por semana, el plan queda en 4 semanas × 4 días = 16 días (80 días-persona). Los Días 1 a 12 no cambian: el cuarto día de cada semana es un **Día de refuerzo** (R1 a R4) que se agrega al final de esa semana, después del día de integración y demo.

| Refuerzo | Semana | Uso sugerido |
| --- | --- | --- |
| **R1** | 1 | Terminar lo atrasado de la semana 1, completar los wireframes, instalar el development build en los 3 celulares reales de los conductores y repetir la prueba de Baileys con el número dedicado |
| **R2** | 2 | Probar la foto de la guía con guías reales (que se lea la firma), corregir errores del flujo de entrega y hacer una prueba más larga del bot |
| **R3** | 3 | Si el hito de la semana está cumplido, adelantar lo deseable: consentimiento y seguimiento de GPS (3-19, 3-20) y orden con saldo (4-19). Si no, usarlo para corregir |
| **R4** | 4 | Margen de lanzamiento: acompañar una ruta real, corregir lo que aparezca y dejar lista la lista de mejoras posteriores |

**Reglas del día de refuerzo**

- Primero se cierran las tareas pendientes de la semana; solo si el hito ya se cumplió se adelanta algo de la semana siguiente.
- No se agregan funciones nuevas que no estén en el plan.
- Con este ajuste, el GPS en segundo plano y el mapa en vivo dejan de ser opcionales y pasan a **importantes**, pero siguen siendo lo primero que se recorta si el Día 9 muestra atraso.
