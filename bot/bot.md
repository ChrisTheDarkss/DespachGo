Bot de WhatsApp para notificaciones de despacho
Estado del proyecto: desarrollo y pruebas de integración. El envío directo con Baileys se comprobó exitosamente; la automatización completa con Supabase y el procesamiento persistente de respuestas siguen pendientes de validación.

1. Descripción
Proyecto de bot de WhatsApp desarrollado en Node.js y TypeScript para enviar notificaciones relacionadas con rutas de despacho y registrar las respuestas de los destinatarios.

El sistema se conecta a WhatsApp mediante Baileys, utiliza Supabase como base de datos y está pensado para trabajar con una cola de mensajes. Cuando un conductor inicia una ruta, el sistema de despacho puede generar mensajes pendientes para las paradas. El bot debe reservarlos, enviarlos de manera controlada y actualizar su estado.

Este README documenta lo construido y probado durante el desarrollo, sin sustituir ni reorganizar los archivos existentes.
2. Objetivo y flujo previsto
1. Un conductor inicia una ruta desde la aplicación de despacho.
2. La lógica del backend/Supabase genera las notificaciones asociadas a las paradas.
3. El bot consulta y reserva mensajes pendientes mediante una función RPC.
4. Envía los mensajes por WhatsApp, de forma secuencial y con una pausa prevista de 5 a 10 segundos entre envíos.
5. Registra los resultados en Supabase: enviado, error recuperable o error definitivo.
6. Recibe respuestas del cliente y las asocia con la parada/ruta correspondiente.
7. La aplicación de despacho puede consultar la confirmación del cliente.
Importante: este es el flujo objetivo. Se han probado sus componentes por separado, pero no se ha confirmado todavía la ejecución completa de extremo a extremo.
3. Tecnologías utilizadas
Tecnología	Uso	Versión comprobada
Node.js	Entorno de ejecución	v24.22.1
TypeScript	Código del bot	No registrada
@whiskeysockets/baileys	Conexión y envío de WhatsApp	7.0.0-rc14
@supabase/supabase-js	Acceso a Supabase y funciones RPC	No registrada
Supabase / PostgreSQL	Persistencia de mensajes, rutas, paradas y respuestas	No registrada
@hapi/boom	Dependencia relacionada con errores	10.0.1 directa y 9.1.4 transitiva
dotenv	Variables de entorno	No registrada
tsx	Ejecución de scripts TypeScript durante pruebas	No registrada


Entorno de trabajo utilizado: Windows y PowerShell.
4. Estructura de archivos trabajados
La siguiente estructura muestra los archivos creados o revisados durante las sesiones. No pretende ser un listado exhaustivo de todo el repositorio.
bot-whatsapp/
├── auth/                           # Credenciales/sesión de WhatsApp (privado)
├── .env                            # Variables de entorno (privado)
├── src/
│   ├── whatsapp/
│   │   └── conexion.ts             # Conexión, QR y reconexión de Baileys
│   ├── mensajeria/
│   │   ├── interfaz.ts              # Contrato Mensajero y errores propios
│   │   └── baileys.ts               # Implementación de envío con Baileys
│   ├── utils/
│   │   └── telefono.ts              # Normalización y construcción de JID
│   ├── respuestas/
│   │   ├── entrante.ts              # Escucha de mensajes entrantes
│   │   └── procesador.ts            # Clasificación inicial de respuestas
│   ├── cola/
│   │   ├── tipos.ts                 # Tipos de la cola
│   │   ├── colaLocal.ts             # Cola temporal en memoria
│   │   ├── procesador.ts            # Procesamiento secuencial
│   │   └── repositorioSupabase.ts   # Acceso a cola y respuestas vía RPC
│   ├── lib/
│   │   └── supabase.ts              # Cliente Supabase de servidor
│   ├── prueba-cola.ts
│   ├── prueba-supabase.ts
│   ├── prueba-pendientes.ts
│   ├── prueba-detalle-pendientes.ts
│   ├── prueba-envio-supabase.ts
│   ├── prueba-segundo-numero.ts
│   ├── diagnostico-baileys.ts
│   └── prueba-envio-directo.ts
└── package.json
Algunos scripts son diagnósticos temporales; conviene separarlos o eliminarlos únicamente después de confirmar que ya no son necesarios.
5. Módulos implementados
5.1. Conexión con WhatsApp
Archivo: src/whatsapp/conexion.ts.
- conectarWhatsApp(): inicia la conexión mediante Baileys.
- obtenerSocket(): devuelve el socket activo o null.
- Maneja eventos de conexión, visualización de QR cuando corresponde y reconexión.
- Integra el listener de mensajes entrantes.
- La sesión se conserva en la carpeta auth/.
Prueba: se observó el estado open y el mensaje WhatsApp conectado correctamente.

Precaución: no publicar, compartir ni borrar accidentalmente auth/. Contiene información sensible de la sesión.
5.2. Normalización de teléfonos
Archivo: src/utils/telefono.ts.
- normalizarTelefono(telefono): elimina caracteres de formato y admite números móviles chilenos en formato 9XXXXXXXX o 569XXXXXXXX, devolviendo +569XXXXXXXX.
- telefonoAJid(telefono): convierte el teléfono normalizado al identificador de WhatsApp 569XXXXXXXX@s.whatsapp.net.
Se comprobó que el número consultado desde Supabase tenía 12 caracteres y comenzaba por +569.
5.3. Interfaz de mensajería
Archivo: src/mensajeria/interfaz.ts.

Incluye el contrato Mensajero y los errores específicos:
- WhatsAppDesconectadoError.
- NumeroSinWhatsAppError.
5.4. Envío por Baileys
Archivo: src/mensajeria/baileys.ts.

Clase MensajeroBaileys, método enviarMensaje(telefono, texto):
1. Comprueba que exista un socket conectado.
2. Rechaza textos vacíos.
3. Normaliza el destino y construye el JID.
4. Consulta socket.onWhatsApp(jid).
5. Si la consulta devuelve un contacto con exists: false, rechaza el número.
6. Si la consulta devuelve [], no asume que el teléfono carezca de WhatsApp y continúa usando el JID.
7. Ejecuta socket.sendMessage(destino, { text: texto }).
8. Comprueba que la respuesta incluya mensaje.key.id.
La corrección del paso 6 se realizó después de detectar que onWhatsApp() devolvía un arreglo vacío incluso para un teléfono que sí recibía mensajes.

Limitación importante: recibir un ID de sendMessage() no garantiza la entrega final. Para el número de prueba conocido, la recepción fue confirmada manualmente.
5.5. Cola local
Archivos:
- src/cola/tipos.ts: tipo MensajeCola con id, telefono, texto, estado, intentos y error opcional.
- src/cola/colaLocal.ts: almacenamiento temporal en memoria.
- src/cola/procesador.ts: procesamiento secuencial usando la interfaz Mensajero, con pausas previstas de 5–10 segundos.
Prueba: src/prueba-cola.ts ejecutó una simulación con tres mensajes. Los estados finales fueron enviado, error, enviado.

La cola local es útil para validar la lógica, pero no garantiza persistencia ni envío exactamente una vez ante reinicios.
5.6. Cliente de Supabase
Archivo: src/lib/supabase.ts.

Exporta obtenerSupabase() utilizando las variables SUPABASE_URL y SUPABASE_SECRET_KEY, con sesión persistente y refresco automático de autenticación desactivados.

Prueba: src/prueba-supabase.ts consultó correctamente la tabla configuracion en modo lectura.
5.7. Repositorio de mensajes en Supabase
Archivo: src/cola/repositorioSupabase.ts.

Clase RepositorioSupabase con métodos:
Método	Función
reservarMensajes(limite = 1)	Reserva mensajes mediante RPC y los adapta al tipo MensajeCola.
marcarEnviado(id)	Marca el registro como enviado mediante RPC.
marcarError(id, detalle, definitivo = false)	Registra el error; permite reintento o cierre definitivo.
registrarRespuesta(telefono, texto, idExterno)	Invoca la RPC de registro de respuestas.
consultarPendientes()	Consulta la cantidad de mensajes pendientes sin reservarlos.


Se verificó que el proyecto compilaba con npm.cmd run check después de incorporar este repositorio.
5.8. Recepción y clasificación inicial de respuestas
Archivos: src/respuestas/entrante.ts y src/respuestas/procesador.ts.
- Se escucha el evento messages.upsert de Baileys.
- Se extrae y clasifica el texto entrante.
- Se preparan datos estructurados para su posterior persistencia.
Pendiente: conectar y verificar el registro real en Supabase, resolver la asociación de identificadores @lid con teléfonos y unificar el significado de las opciones 1, 2 y 3.
6. Modelo de datos relevante en Supabase
Tabla public.mensajes_whatsapp
Campos identificados:
Campo	Propósito
id	Identificador UUID del mensaje.
parada_id	Relación con la parada del despacho.
telefono	Número de destino/origen.
texto	Contenido del mensaje.
direccion	enviado o recibido según el esquema utilizado.
estado	pendiente, enviado o error.
error_detalle	Descripción de un fallo.
enviado_en	Fecha/hora de envío registrada.
intentos	Cantidad de intentos.
creado_en	Fecha de creación.
actualizado_en	Fecha de actualización.
reservado_hasta	Vencimiento de la reserva temporal.
id_externo	Identificador del mensaje en WhatsApp.


Otras entidades involucradas: rutas, paradas, ordenes y configuracion. En paradas se contemplan confirmacion_cliente y respuesta_cliente.
Funciones RPC existentes
Se comprobó la existencia de estas cuatro funciones SQL:
Función	Comportamiento conocido
bot_reservar_mensajes(p_limite, p_max_intentos)	Reserva pendientes, incrementa intentos, utiliza bloqueo FOR UPDATE SKIP LOCKED y una reserva temporal de aproximadamente 2 minutos.
bot_marcar_enviado(p_mensaje)	Marca como enviado, registra fecha y libera reserva.
bot_marcar_error(p_mensaje, p_detalle, p_definitivo, p_max_intentos)	Marca error definitivo o deja pendiente con demora para reintentar, según el caso.
bot_registrar_respuesta(p_telefono, p_texto, p_id_externo)	Registra respuestas entrantes, evita duplicados por ID externo e intenta asociarlas con una parada de ruta activa.


El esquema SQL de referencia se trabajó como 009_funciones_bot.sql. No se ha comprobado todavía todo el flujo de integración de estas RPC en producción.
7. Pruebas realizadas y resultados
Prueba	Resultado	Estado
Conexión y autenticación de WhatsApp	Conexión open	Confirmado
Envío previo a número autorizado	Mensaje recibido	Confirmado
Cola local con tres mensajes simulados	enviado, error, enviado	Confirmado en simulación
Consulta a Supabase (configuracion)	Lectura correcta	Confirmado
Conteo de pendientes en Supabase	2 pendientes en el momento de la consulta	Confirmado históricamente
Inspección de pendientes	Teléfonos con formato válido, texto y parada asociados	Confirmado históricamente
Primer envío integrado con Supabase	Falló por validación onWhatsApp(); no se envió	Fallido
Verificación del segundo teléfono con onWhatsApp()	[]	Inconcluso sobre existencia real
Verificación de número conocido con onWhatsApp()	[] en ambos formatos	Confirmó limitación de la verificación
Envío directo tras corregir MensajeroBaileys	Baileys devolvió ID y el destinatario confirmó recepción	Confirmado
Envío directo al segundo número autorizado	Se propuso la prueba, pero no se registró su resultado	Pendiente
Procesamiento completo de respuestas en Supabase	Sin prueba integral confirmada	Pendiente


IDs de registros usados durante las pruebas
Se inspeccionaron dos mensajes de prueba en Supabase:
- Primer registro: 7490da97-a395-4667-b614-ed806e887429.
- Segundo registro: b0cd9074-386f-45c6-807b-c67bbfbbac14.
En la primera prueba integrada se reservó el primer registro, pero el envío se detuvo por NumeroSinWhatsAppError. El código de prueba contemplaba marcar ese error como definitivo. El estado final de ese registro debe verificarse en la base de datos antes de reintentarlo. No debe suponerse que sigue pendiente.

El conteo original de dos pendientes no representa necesariamente el estado actual después de la prueba integrada.
8. Diagnóstico del problema onWhatsApp()
Síntoma
La conexión se establecía, pero la consulta devolvía:
Cantidad de resultados: 0
Existe: null
Tiene JID: false
Esto ocurría con el segundo número de prueba y también con un número que previamente había recibido mensajes.
Investigación
Se revisó la implementación instalada en:
node_modules/@whiskeysockets/baileys/lib/Socket/socket.js
En la versión 7.0.0-rc14, onWhatsApp():
- Acepta número o JID y normaliza internamente el teléfono.
- Ejecuta una consulta USync.
- Filtra los resultados para conservar los que contienen el campo contact.
Por tanto, un arreglo vacío no es una prueba suficiente de que el número no exista en WhatsApp.
Corrección aplicada
Se modificó src/mensajeria/baileys.ts para no lanzar NumeroSinWhatsAppError cuando la consulta retorna []. Si no existe un contacto confirmado, el método intenta enviar al JID normalizado.

Resultado: el envío directo al número conocido generó un ID y el usuario confirmó que el mensaje llegó.

Precaución: el envío directo puede fallar con otros números y debe seguir protegido por manejo de errores, reintentos controlados y registros de estado. No se deben interpretar las respuestas de sendMessage() como comprobación automática de entrega.
9. Comandos útiles
Ejecutar desde la carpeta del proyecto:
cd C:\Users\Wido\bot-whatsapp
Verificar tipos/compilación:
npm.cmd run check
Consultar versiones:
npm.cmd list @whiskeysockets/baileys
npm.cmd list @hapi/boom
node --version
Prueba de cola simulada:
npx.cmd tsx src/prueba-cola.ts
Prueba de lectura de Supabase:
npx.cmd tsx src/prueba-supabase.ts
Consultar cantidad de pendientes sin reservar:
npx.cmd tsx src/prueba-pendientes.ts
Diagnóstico de un número autorizado sin enviar mensajes:
npx.cmd tsx src/diagnostico-baileys.ts +569XXXXXXXX
Envío real directo a un número autorizado (envía un mensaje; ejecutar solo una vez y comprobar recepción):
npx.cmd tsx src/prueba-envio-directo.ts +569XXXXXXXX
No ejecutar indiscriminadamente src/prueba-envio-supabase.ts: reserva y modifica mensajes reales de la tabla y podría seleccionar otro destinatario pendiente.
10. Configuración y seguridad
Variables utilizadas en .env:
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SECRET_KEY=TU_CLAVE_PRIVADA_DEL_SERVIDOR
Estos valores son ejemplos; utilizar los valores reales solo en el entorno local o servidor autorizado.

Recomendaciones:
- No subir .env, auth/, claves, archivos de sesión ni registros criptográficos a Git.
- Añadir reglas de exclusión en .gitignore.
- Mantener la clave secreta de Supabase exclusivamente en el backend.
- No compartir en capturas ni logs datos privados de sesión: durante una prueba Baileys imprimió objetos SessionEntry con claves criptográficas.
- Evitar registrar números completos y textos de clientes en logs de diagnóstico.
- Enviar mensajes solo a números autorizados y conforme a las reglas aplicables de WhatsApp y privacidad.
- Considerar que Baileys es una integración no oficial; puede cambiar su comportamiento y presentar restricciones de servicio.
Ejemplo de reglas de .gitignore (integrarlas con las que ya existan):
node_modules/
.env
.env.*
!.env.example
auth/
*.log
11. Problemas y tareas pendientes
Prioridad alta
1. Comprobar el estado actual de los registros de prueba en Supabase, especialmente el primero, que pudo quedar como error definitivo.
2. Probar el envío directo al segundo número autorizado, sin reservar registros de Supabase, y verificar recepción real.
3. Integrar la versión corregida de MensajeroBaileys con el procesador persistente de Supabase, utilizando reservas RPC y control de errores.
4. Evitar duplicados si el envío se acepta pero falla el registro del estado, o si el proceso se reinicia mientras existe una reserva.
5. Alinear las opciones de respuesta. Actualmente existe una discrepancia:
   Respuesta	Clasificador inicial de TypeScript	RPC de Supabase
   1	Confirmación	confirmo
   2	Consulta	no_habra_nadie
   3	No disponible	quiere_hablar
   
   
   Debe definirse un único significado y aplicarlo en los mensajes enviados, el bot y la base de datos.
6. Resolver los identificadores @lid de mensajes entrantes para asociar respuestas con el teléfono y la parada correctos.
7. Conectar y probar bot_registrar_respuesta con respuestas reales, incluidos duplicados y texto libre.
Prioridad media
- Comprobar qué ocurre ante desconexiones de WhatsApp durante el envío.
- Añadir registro estructurado de errores sin información sensible.
- Implementar un ciclo de trabajo continuo que consulte la cola sin crear instancias duplicadas.
- Confirmar estados de entrega mediante eventos cuando se necesite distinguir aceptación, entrega y lectura.
- Revisar políticas de reintentos y errores definitivos para números no verificables.
- Añadir pruebas automatizadas para normalización de teléfonos, cola y clasificación de respuestas.
- Preparar despliegue estable con supervisión de procesos y protección de credenciales.
12. Próximo hito recomendado
Completar una prueba controlada de extremo a extremo con un único registro autorizado:
1. Confirmar que el teléfono recibe mensajes mediante envío directo.
2. Revisar el estado real del registro en Supabase.
3. Reservar un único mensaje de prueba identificado y autorizado.
4. Enviarlo mediante MensajeroBaileys.
5. Registrar correctamente el resultado sin duplicar envíos.
6. Responder desde el teléfono y comprobar la actualización de la parada en Supabase.
Solo después de esta prueba conviene habilitar el procesamiento automático de toda la cola.
Resumen del avance: ya funcionan la conexión de WhatsApp, el envío directo confirmado, la normalización de teléfonos, la cola simulada y la comunicación básica con Supabase. También se implementó el repositorio de funciones RPC. Falta cerrar la integración completa, validar la recepción y persistencia de respuestas, y reforzar el manejo de reintentos y duplicados.
