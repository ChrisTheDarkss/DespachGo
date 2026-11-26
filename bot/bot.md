# Bot de WhatsApp para Gestión de Despachos

## 1. Descripción del proyecto

Sistema de mensajería automatizada desarrollado con **Node.js, TypeScript, Baileys y Supabase**, orientado a gestionar notificaciones de despacho mediante WhatsApp.

El sistema permite enviar mensajes a clientes cuando sus pedidos se encuentran en camino, recibir respuestas y registrar automáticamente la información en una base de datos.

El bot se integra con las rutas y paradas existentes en Supabase, permitiendo asociar cada respuesta del cliente con su pedido correspondiente.

### Objetivo principal

Automatizar la comunicación entre el sistema de despachos y los clientes, reduciendo la intervención manual y manteniendo un historial de los mensajes enviados y recibidos.

### Funcionalidades implementadas

- Conexión con WhatsApp mediante Baileys.
- Autenticación mediante código QR.
- Persistencia de sesiones de WhatsApp.
- Envío de mensajes a números autorizados.
- Integración con Supabase.
- Procesamiento de mensajes mediante una cola.
- Validación del estado de las rutas.
- Control de intentos de envío.
- Prevención de reintentos automáticos ante resultados inciertos.
- Recepción automática de respuestas.
- Interpretación de respuestas `1`, `2` y `3`.
- Registro de respuestas en Supabase.
- Actualización de la confirmación del cliente.
- Prevención de respuestas duplicadas mediante identificadores externos.
- Reconexión automática de WhatsApp.
- Registros de conexión simplificados.

---

## 2. Tecnologías utilizadas

| Tecnología | Función |
|---|---|
| Node.js | Entorno de ejecución |
| TypeScript | Lenguaje principal |
| Baileys | Comunicación con WhatsApp |
| Supabase | Base de datos y funciones RPC |
| PostgreSQL | Almacenamiento relacional |
| dotenv | Variables de entorno |
| Pino | Configuración de registros |
| qrcode-terminal | Visualización del QR |
| tsx | Ejecución de TypeScript |
| Git | Control de versiones |

### Versiones verificadas durante el desarrollo

- Node.js: `24.22.1`
- Baileys: `7.0.0-rc14`
- TypeScript: `7.0.2`
- tsx: `4.23.15`
- dotenv: `18.0.9`

Las versiones instaladas pueden consultarse mediante:

```bash
npm list --depth=0
```

---

## 3. Estructura del proyecto

La siguiente estructura presenta los archivos principales desarrollados y utilizados durante las pruebas.

```text
bot-whatsapp/
│
├── auth/
│   └── Archivos de autenticación de WhatsApp
│
├── src/
│   │
│   ├── index.ts
│   │
│   ├── whatsapp/
│   │   └── conexion.ts
│   │
│   ├── mensajeria/
│   │   ├── interfaz.ts
│   │   └── baileys.ts
│   │
│   ├── cola/
│   │   ├── colaLocal.ts
│   │   ├── procesador.ts
│   │   ├── repositorioSupabase.ts
│   │   ├── procesadorSupabase.ts
│   │   └── cicloSupabase.ts
│   │
│   ├── respuestas/
│   │   ├── entrante.ts
│   │   └── procesador.ts
│   │
│   ├── lib/
│   │   └── supabase.ts
│   │
│   ├── utils/
│   │   ├── telefono.ts
│   │   └── resolverTelefonoWhatsApp.ts
│   │
│   ├── prueba-cola.ts
│   ├── prueba-envio-directo.ts
│   ├── prueba-envio-supabase.ts
│   ├── prueba-procesador-supabase.ts
│   ├── prueba-envio-controlado.ts
│   ├── prueba-envio-exclusivo.ts
│   └── prueba-recepcion.ts
│
├── .env
├── package.json
├── package-lock.json
└── tsconfig.json
```

**Nota:** algunos archivos de prueba se conservan como referencia histórica. No todos deben ejecutarse nuevamente, ya que ciertas pruebas utilizaron funciones temporales de Supabase que posteriormente fueron eliminadas.

---

## 4. Configuración del entorno

### 4.1 Requisitos

- Node.js instalado.
- npm disponible.
- Proyecto de Supabase configurado.
- Credenciales de acceso a Supabase.
- Una cuenta de WhatsApp autorizada para vincular el bot.

### 4.2 Instalación

Clonar el repositorio:

```bash
git clone URL_DEL_REPOSITORIO
```

Ingresar al directorio:

```bash
cd bot-whatsapp
```

Instalar dependencias:

```bash
npm install
```

### 4.3 Variables de entorno

Crear un archivo `.env` en la raíz del proyecto:

```env
SUPABASE_URL=URL_DEL_PROYECTO
SUPABASE_SECRET_KEY=CLAVE_SECRETA
```

Las credenciales deben mantenerse privadas.

**No subir a Git:**

- `.env`
- `auth/`
- Claves privadas
- Credenciales de Supabase
- Registros que contengan material criptográfico

Ejemplo de `.gitignore`:

```gitignore
node_modules/
.env
auth/
dist/
*.log
```

---

## 5. Conexión con WhatsApp

La conexión se implementa en:

`src/whatsapp/conexion.ts`

### Funcionamiento

1. Cargar las credenciales almacenadas en `auth/`.
2. Crear el socket mediante Baileys.
3. Mostrar el QR cuando sea necesario.
4. Guardar las actualizaciones de credenciales.
5. Registrar el listener de respuestas.
6. Detectar cuándo la conexión está abierta.
7. Intentar reconectar ante determinadas desconexiones.

### Configuración del socket

```typescript
const socket = makeWASocket({
  auth: state,
  logger: pino({ level: "silent" }),
  markOnlineOnConnect: false
});
```

Se utiliza un nivel de registro silencioso para reducir la información emitida por el logger configurado.

### Reconexión

El sistema incorpora un mecanismo de reconexión con una espera de cinco segundos.

Si WhatsApp informa que la sesión fue cerrada definitivamente, se indica que es necesario volver a vincular la cuenta.

### Resultado de las pruebas

La conexión se realizó correctamente utilizando las credenciales existentes, sin necesidad de generar un nuevo QR.

---

## 6. Envío de mensajes

La implementación principal se encuentra en:

`src/mensajeria/baileys.ts`

### Funcionamiento

El módulo permite:

- Validar el número telefónico.
- Normalizar números chilenos.
- Consultar la disponibilidad del destinatario mediante Baileys.
- Enviar el mensaje utilizando el socket activo.
- Detectar errores de envío.

### Formato telefónico

El sistema utiliza números chilenos normalizados.

Ejemplo:

```text
+569XXXXXXXX
```

La normalización se encuentra en:

`src/utils/telefono.ts`

### Validaciones

Antes de enviar un mensaje se comprueba que el número tenga un formato válido y que exista una conexión utilizable.

La aceptación del mensaje por Baileys no equivale necesariamente a una confirmación de lectura por parte del cliente.

---

## 7. Sistema de colas

El proyecto comenzó con una cola local utilizada para comprobar el procesamiento de mensajes.

Posteriormente se incorporó una cola persistente mediante Supabase.

### Componentes principales

**`colaLocal.ts`**

Implementación inicial de una cola de mensajes para pruebas.

**`procesador.ts`**

Procesamiento de los mensajes almacenados en la cola local.

**`repositorioSupabase.ts`**

Comunicación con las funciones RPC de Supabase.

**`procesadorSupabase.ts`**

Control del procesamiento de mensajes persistentes.

**`cicloSupabase.ts`**

Lógica de ejecución repetitiva del procesador, con intervalos entre operaciones.

### Flujo del procesador de Supabase

```text
Consultar cola
      |
      v
Reservar mensaje
      |
      v
Verificar ruta activa
      |
      v
Autorizar inicio del envío
      |
      v
Estado: revision
      |
      v
Enviar mediante Baileys
      |
      v
Estado: enviado
```

### Control de estados

| Estado | Descripción |
|---|---|
| `pendiente` | Mensaje esperando procesamiento |
| `revision` | Envío iniciado o resultado pendiente de conciliación |
| `enviado` | Baileys aceptó el mensaje y Supabase registró el envío |
| `error` | Mensaje con error registrado |

### Prevención de duplicados

Antes de enviar, el procesador cambia el mensaje a `revision`.

Si ocurre un error después de iniciar el envío, no se ejecuta automáticamente otro intento, debido a que el mensaje podría haber sido aceptado por WhatsApp.

Esto reduce el riesgo de enviar notificaciones duplicadas.

---

## 8. Integración con Supabase

La conexión se implementa en:

`src/lib/supabase.ts`

El sistema utiliza el cliente de Supabase y funciones RPC para gestionar los mensajes.

### Tablas principales

**`rutas`**

Contiene las rutas de despacho y su estado operativo.

**`paradas`**

Representa las entregas asociadas a cada ruta.

Incluye campos relacionados con la confirmación y respuesta del cliente.

**`mensajes_whatsapp`**

Almacena los mensajes enviados y recibidos.

Entre sus campos se encuentran:

- `id`
- `parada_id`
- `telefono`
- `texto`
- `direccion`
- `estado`
- `intentos`
- `enviado_en`
- `reservado_hasta`
- `id_externo`
- `creado_en`

### Funciones RPC utilizadas

| Función | Responsabilidad |
|---|---|
| `bot_reservar_mensajes` | Reservar mensajes pendientes |
| `bot_iniciar_envio` | Autorizar el inicio del envío |
| `bot_marcar_enviado` | Registrar el envío exitoso |
| `bot_marcar_error` | Registrar errores de procesamiento |
| `bot_registrar_respuesta` | Guardar respuestas recibidas |

Las funciones temporales creadas exclusivamente para las pruebas controladas fueron eliminadas posteriormente.

---

## 9. Recepción de respuestas

La recepción automática se implementa en:

`src/respuestas/entrante.ts`

El procesamiento de respuestas se encuentra en:

`src/respuestas/procesador.ts`

### Funcionamiento

Cuando llega un mensaje de WhatsApp:

1. Baileys detecta el mensaje entrante.
2. Se descartan mensajes enviados por el propio bot.
3. Se omiten grupos y mensajes de estado.
4. Se obtiene el contenido de texto.
5. Se identifica el teléfono del remitente.
6. Se interpreta la respuesta.
7. Se registra mediante Supabase.
8. Se actualiza la confirmación de la parada correspondiente, cuando procede.

### Respuestas reconocidas

| Respuesta | Interpretación |
|---|---|
| `1` | `confirmo` |
| `2` | `no_habra_nadie` |
| `3` | `quiere_hablar` |
| Otro texto | `otro` |

### Identificación del remitente

El sistema contempla identificadores de WhatsApp de tipo:

- `@s.whatsapp.net`
- `@lid`

Para los identificadores `@lid` se utiliza un mecanismo de resolución hacia el número telefónico cuando Baileys dispone de la correspondencia.

### Control de mensajes duplicados

Los mensajes entrantes incluyen un identificador externo proporcionado por WhatsApp.

Supabase utiliza este identificador para evitar almacenar dos veces una misma respuesta.

---

## 10. Pruebas realizadas

### 10.1 Conexión con Supabase

**Resultado:** exitosa.

Se comprobó que el proyecto podía consultar información existente en la base de datos.

### 10.2 Conexión con WhatsApp

**Resultado:** exitosa.

Se verificó la autenticación mediante Baileys y la reutilización de las credenciales guardadas.

### 10.3 Cola local

**Resultado:** funcionamiento validado.

Se realizaron pruebas con múltiples mensajes, incluyendo casos exitosos y errores controlados.

### 10.4 Envío desde Supabase

**Resultado:** exitoso.

Se comprobó que un mensaje almacenado en Supabase podía reservarse, enviarse mediante Baileys y registrarse como enviado.

### 10.5 Envío exclusivo de prueba

**Resultado:** exitoso.

Se creó una ruta de prueba y un mensaje específico.

El sistema verificó que:

- La ruta estuviera activa.
- El mensaje estuviera pendiente.
- El número fuera el autorizado para pruebas.
- El mensaje no tuviera una reserva vigente.

Posteriormente se utilizó una función temporal para reservar exclusivamente el mensaje seleccionado.

El mensaje fue recibido correctamente en WhatsApp.

### 10.6 Recepción de respuestas

**Resultado:** exitoso.

El cliente respondió:

```text
1
```

Supabase registró:

```text
confirmacion_cliente = confirmo
respuesta_cliente = 1
```

Posteriormente, antes de finalizar la ruta, se realizó una segunda prueba:

```text
2
```

Supabase actualizó los datos:

```text
confirmacion_cliente = no_habra_nadie
respuesta_cliente = 2
```

Ambos mensajes quedaron registrados en el historial.

### 10.7 Finalización de la ruta

**Resultado:** exitoso.

La ruta utilizada para las pruebas pasó al estado:

```text
finalizada
```

El historial de mensajes se conservó.

### 10.8 Limpieza de funciones temporales

**Resultado:** completado.

Se eliminaron las funciones SQL temporales utilizadas durante las pruebas de envío exclusivo.

### 10.9 Mejoras de conexión

**Resultado:** prueba de conexión exitosa.

Se simplificaron los registros de conexión y se verificó que WhatsApp pudiera conectarse sin mostrar registros criptográficos sensibles durante esa prueba.

La ausencia de dichos registros durante un envío posterior todavía no ha sido verificada.

---

## 11. Seguridad implementada

### Autenticación

Las credenciales de WhatsApp se almacenan localmente en la carpeta `auth/`.

### Variables de entorno

Las credenciales de Supabase se obtienen desde variables de entorno.

### Validación de números

Se normalizan y validan los números antes de utilizarlos para enviar mensajes.

### Control de rutas

El procesador verifica que la ruta se encuentre en estado `en_curso` antes de iniciar un envío.

### Control de reintentos

Los mensajes cuyo resultado de envío es incierto permanecen en estado `revision`, evitando reintentos automáticos potencialmente duplicados.

### Registro de respuestas

Los identificadores externos permiten detectar respuestas repetidas.

### Registros de conexión

Se redujo la información mostrada por la aplicación durante la conexión.

**Pendiente:** verificar el origen de cualquier registro criptográfico que pueda aparecer durante futuros envíos.

---

## 12. Comandos de desarrollo

### Instalar dependencias

```powershell
npm.cmd install
```

### Comprobar TypeScript

```powershell
npm.cmd run check
```

### Ejecutar la prueba de conexión y recepción

```powershell
npx.cmd tsx src/prueba-recepcion.ts
```

### Detener el proceso

```text
Ctrl + C
```

### Consideraciones

Los scripts históricos de envío no deben ejecutarse indiscriminadamente.

Algunos dependen de funciones temporales eliminadas o pueden enviar mensajes reales.

Antes de realizar nuevas pruebas de envío se debe verificar el destinatario, la ruta y el estado de la cola.

---

## 13. Estado actual del proyecto

| Componente | Estado |
|---|---|
| Configuración de Node.js y TypeScript | Completado |
| Conexión con Supabase | Completado |
| Autenticación de WhatsApp | Completado |
| Envío mediante Baileys | Probado |
| Cola local | Probada |
| Cola persistente de Supabase | Probada |
| Validación de rutas activas | Implementada |
| Control de intentos | Implementado |
| Prevención de reenvíos inciertos | Implementada |
| Recepción automática | Probada |
| Interpretación de respuestas | Probada con `1` y `2` |
| Registro de respuestas | Probado |
| Actualización de confirmación | Probada |
| Historial de mensajes | Verificado |
| Reconexión automática | Implementada; requiere pruebas adicionales |
| Ciclo automático de producción | Pendiente de habilitación y validación |

**Estado general:** las funcionalidades principales de envío y recepción están implementadas y han superado las pruebas controladas realizadas.

El sistema todavía requiere validaciones adicionales antes de utilizarse con clientes reales de forma automática.

---

## 14. Próximas mejoras

### 14.1 Validación de rutas finalizadas

Revisar que las respuestas recibidas después de finalizar una ruta no modifiquen información histórica.

### 14.2 Seguridad de registros

Investigar los registros internos de Baileys que pueden mostrar información criptográfica durante determinados envíos.

### 14.3 Manejo de mensajes en revisión

Desarrollar un procedimiento de conciliación para mensajes que permanecen en estado `revision`.

### 14.4 Validación de todas las respuestas

Completar las pruebas controladas de la respuesta `3` y de mensajes no reconocidos.

### 14.5 Reconexión

Comprobar el comportamiento del bot ante desconexiones y reconexiones repetidas.

### 14.6 Ciclo automático

Validar el procesamiento continuo de la cola antes de habilitarlo para operaciones reales.

### 14.7 Despliegue

Preparar el bot para ejecutarse de manera estable en un entorno de servidor, incorporando supervisión del proceso, configuración segura y recuperación ante fallos.

---

## 15. Conclusión

El proyecto evolucionó desde una conexión básica de WhatsApp y una cola local de pruebas hacia un sistema integrado con Supabase, capaz de enviar notificaciones de despacho, recibir respuestas y actualizar la información de los clientes.

Las pruebas realizadas demostraron el funcionamiento de la comunicación entre WhatsApp, Baileys, TypeScript y PostgreSQL.

Actualmente, el sistema cuenta con una base funcional para continuar desarrollando la automatización de despachos, priorizando la seguridad, la trazabilidad y la prevención de mensajes duplicados.

El siguiente objetivo es reforzar las validaciones y preparar el procesamiento automático para su utilización en un entorno operativo.