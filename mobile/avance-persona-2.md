# Avance de Persona 2

## Alcance de este avance

Se preparó la base de la app móvil y se implementaron inicialmente las tareas **2-03 (login conectado a Supabase Auth)** y **2-04 (Mi ruta de hoy con datos de prueba)**. En las actualizaciones siguientes, la lista de prueba se reemplazó por la consulta de la ruta asignada al conductor. Las pantallas se verificaron visualmente en un dispositivo o emulador según confirmó el usuario; queda pendiente la revisión contra wireframes de Figma si se comparten.

## Hecho

- Estructura inicial con Expo, Expo Router, TypeScript y perfiles de compilación EAS.
- Login de conductor con correo y contraseña mediante Supabase Auth, sesión persistida en el dispositivo y navegación protegida.
- Mensajes visibles cuando faltan variables de configuración o falla el inicio/cierre de sesión.
- La primera versión mostraba tres paradas de prueba; esa lista fue reemplazada por la ruta real descrita más abajo.
- Controles con tamaño legible y adecuado para interacción táctil.
- `.env.example` contiene únicamente los nombres de las variables públicas requeridas.
- Exclusión local de `.env`, dependencias y archivos generados para evitar subir secretos o artefactos.
- Se corrigieron las vulnerabilidades detectadas en dependencias transitivas y se alinearon los paquetes Expo con parches compatibles del SDK 58.

## Pendientes actuales / bloqueados por dependencias

- **Prueba integral de la tarea 2-18: por confirmar.** El usuario no sabe si ya se ejecutó; no se marca como completada hasta verificar el flujo completo y registrar/corregir sus hallazgos. Las tareas 2-05 a 2-17 tienen implementación, pero eso no sustituye esta prueba.
- **Revisión con wireframes de Figma: pendiente**, si se comparten referencias adicionales.

## Verificación inicial

- `npm run typecheck`: correcto.
- `npx expo install --check`: dependencias compatibles con el SDK configurado.
- La configuración de Supabase real y la prueba de acceso con una cuenta de conductor están listas, según confirmó el usuario.
- Las pantallas se verificaron visualmente contra las referencias en un dispositivo o emulador, según confirmó el usuario.
- La prueba de una build en un teléfono físico no queda especificada; la verificación visual en dispositivo o emulador sí está confirmada.

## Archivos principales

- `app/login.tsx`: acceso del conductor.
- `app/(tabs)/index.tsx`: ruta asignada y vistas Lista, Carga y Mapa.
- `src/lib/supabase.ts`: cliente compartido de Supabase con configuración solo pública.
- `src/hooks/useAuth.tsx`: gestión de sesión de conductor con Supabase Auth.
- `src/data/mockStops.ts`: datos temporales de la primera versión; ya no alimentan la pantalla de ruta.
- `.env.example`: nombres de variables requeridas, sin secretos.

## Variables de entorno

Copiar `.env.example` a `.env` dentro de `mobile` y completar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` con la URL del proyecto y la clave pública anon. No usar una `SERVICE_ROLE_KEY` en la app.

## Actualización: funcionalidades del conductor

Se amplió la app más allá de las tareas iniciales descritas arriba. La interfaz continúa siendo provisional hasta recibir los wireframes.

### Hecho

- Se reemplazó la lista de prueba por la consulta de la ruta asignada al conductor en Supabase, con paradas, estados y opciones para iniciar la ruta.
- Se añadieron el mapa de la ruta con paradas numeradas, el detalle de cada parada, la navegación externa y las acciones para reordenar u omitir paradas con motivo.
- Se implementó el registro de entregas completas, parciales y fallidas, incluyendo cantidades por producto, motivos, fotos de guías con vista previa y destinatario opcional.
- Se agregó una cola local para guardar entregas y fotos pendientes cuando no hay conexión, con sincronización posterior e indicador de pendientes. La confirmación evita envíos duplicados.
- Se añadió el consentimiento de GPS, solicitud de permisos y seguimiento durante la ruta activa.
- Se incorporaron el resumen y el cierre de ruta. El cierre se bloquea si una entrega aún no se registró en el servidor; si el registro ya está en línea y solo falta subir fotos, la ruta puede cerrarse y las fotos permanecen en la cola local.
- Se solucionó el requisito nativo de MapLibre para la pantalla del mapa. Para usarlo, debe instalarse un development build que incluya el módulo nativo; Expo Go o un binario anterior no bastan.

### Verificación y estado actual

- Pasaron el chequeo de TypeScript y las exportaciones de Expo para web y Android.
- Las pantallas «Registrar entrega» y «Reportar entrega fallida» usan rutas dedicadas (`/delivery/[stopId]` y `/delivery/failed/[stopId]`) y reciben explícitamente el UUID de la parada. Esto evita que un segmento estático como `delivery` se interprete como el parámetro UUID de la ruta dinámica.
- El usuario confirmó que la app funciona después de instalar una build nueva.
- La app consulta rutas existentes; no crea ni asigna rutas automáticamente. Si no aparece una ruta en la cuenta del conductor, falta crearla y asignarla desde el flujo de administración/backend de Supabase.
- El ruteo vial requiere configurar un endpoint de la empresa; no se envían las coordenadas de clientes a un servicio público por defecto.
- El seguimiento en segundo plano depende de la plataforma y los permisos; en web funciona mientras la pestaña está abierta.

## Actualización: vistas Lista, Carga y Mapa

Se ajustó la pantalla principal del conductor para organizar la ruta en vistas y hacer más visibles los controles de Lista.

### Hecho

- Antes de iniciar la ruta están disponibles las vistas **Lista**, **Carga** y **Mapa**; durante una ruta en curso solo se muestran **Lista** y **Mapa**.
- La vista Carga permite marcar los productos que se llevarán y confirmar la selección antes de iniciar. No es obligatorio seleccionar todos; se requiere al menos uno confirmado para habilitar el inicio de ruta.
- Las tarjetas de Lista presentan los productos de cada parada y permiten expandir la información de productos con una pulsación larga cuando hay más de dos.
- Se reservaron espacio y ancho flexibles para las tarjetas, de modo que no oculten los controles de flechas para reordenar paradas. Las flechas se mantienen visibles y la dirección no disponible se muestra atenuada.
- Se puede cambiar entre las vistas disponibles deslizando horizontalmente. El gesto distingue el desplazamiento vertical y se excluye al comenzar sobre controles interactivos, tarjetas, casillas o el mapa.

### Verificación

- `cd mobile && npm run typecheck -- --ignoreDeprecations 6.0`: correcto.
- `git diff --check`: correcto.
- No se realizó una comprobación visual en dispositivo o emulador para esta actualización.

## Actualización: teclado en el login

Se ajustó la pantalla de login para que los campos de correo y contraseña permanezcan visibles al escribir con el teclado abierto.

### Hecho

- `KeyboardAvoidingView` ahora ajusta la altura en Android y conserva el comportamiento de padding en iOS; el formulario desplazable permite llevar el campo enfocado sobre el teclado.
- Se declaró `android.softwareKeyboardLayoutMode: "resize"` en `app.json`.
- Para que el ajuste nativo de Android se aplique, se debe generar e instalar una nueva build de la app.

### Verificación

- `cd mobile && npx expo config --type public --json`: configuración Expo válida.
- `cd mobile && npx tsc --noEmit --ignoreDeprecations 6.0`: correcto. El script de typecheck sin esa opción se detiene por la advertencia preexistente de `baseUrl` obsoleto en TypeScript 6.
- No se realizó una comprobación visual en dispositivo o emulador.

## Actualización: detalle y omisión de parada

Se ajustaron estas pantallas para acercarlas a las imágenes de referencia y hacer más claros los datos y las acciones disponibles.

### Hecho

- Se rediseñó el detalle de parada, con textos algo más grandes, guías y productos, estado de confirmación del cliente y acciones principales.
- Cuando una parada tiene más de dos guías, se puede expandir la sección para consultar las guías y sus productos.
- Se rediseñó la pantalla **Omitir parada**, incluyendo los motivos, el campo de observación y acciones ubicadas al pie de la pantalla para evitar un espacio vacío entre el contenido y los botones.
- **Confirmar omisión** usa el color rojo; **Volver sin omitir** usa un fondo gris y texto más oscuro.
- El detalle vuelve a consultar sus datos al recuperar el foco y no permite iniciar otra acción sobre la parada si todavía hay una entrega local pendiente.
- Al confirmar la omisión de una parada durante una ruta en curso, la app vuelve a **Mi ruta de hoy** con la vista **Mapa** seleccionada.
- Al pulsar la dirección, se abre Inicio con la vista Mapa seleccionada; se eliminó la pantalla de mapa independiente que duplicaba el mapa de la ruta.

### Archivos principales

- [`app/stop/[id].tsx`](./app/stop/[id].tsx): detalle y acciones de parada.
- [`app/stop/omit/[id].tsx`](./app/stop/omit/[id].tsx): formulario de omisión.

## Actualización: registro de entrega y trabajo sin conexión

Se implementó el flujo de registro de entrega con soporte para fotos pendientes y sincronización posterior.

### Hecho

- El formulario permite registrar entregas completas o parciales, cantidades por producto, motivos de diferencia y quién recibió el pedido.
- Cada guía requiere una foto firmada. **Confirmar entrega** permanece deshabilitado y con tono atenuado hasta adjuntar una foto para todas las guías de la parada.
- **Elegir foto** permite tomar una foto con la cámara o seleccionar una existente, según las opciones disponibles en el dispositivo.
- El límite de cada producto se calcula contra el saldo de carga de toda la ruta, no se vuelve a aplicar el total cargado en cada parada. La validación también agrupa líneas repetidas del mismo producto dentro de una parada.
- Al confirmar, la entrega se guarda primero en una cola local; la app registra la entrega en el servidor y luego sube sus fotos. Solo borra las fotos locales cuando la sincronización terminó correctamente.
- En móvil, las fotos pendientes se conservan en el almacenamiento local de la aplicación; en web, se conservan en IndexedDB. La cola de entregas se guarda localmente. Los reintentos ocurren al volver la conexión o al reactivar/enfocar la app.
- El consumo se deriva de las entregas completas o parciales ya registradas y se conserva localmente por identificador de entrega. Si se trabaja sin conexión, se descuenta también lo que sigue en la cola local; al sincronizar, el registro del servidor reemplaza su copia local sin contarse dos veces.
- Si la entrega ya se registró en el servidor pero falta subir una foto, se muestra el estado de entrega guardada con fotos pendientes. El cierre de ruta puede continuar en este caso y la subida de fotos se reintenta posteriormente.
- Si el registro completo de una entrega todavía no llegó al servidor, se impide cerrar la ruta para no perder ese registro ni dejar una parada en un estado inconsistente.
- Después de completar la sincronización de una entrega, la navegación vuelve a **Inicio** con la sección **Mapa** seleccionada; no existe una categoría de mapa independiente.

### Limitaciones de almacenamiento

- Las fotos locales están disponibles para reintento mientras se conserven los datos de la app o del navegador. Desinstalar la app o borrar los datos del navegador puede eliminar copias que todavía no se hayan sincronizado.
- Se requiere conexión para registrar una entrega en Supabase y para finalizar la ruta. El modo sin conexión conserva la entrega y las fotos en la cola, pero no convierte el cierre de ruta en una operación sin conexión.
- Una ruta que ya estaba en curso antes de guardar localmente su saldo de carga requiere conectarse una vez para leer el consumo existente del servidor. Si no hay ni conexión ni saldo local, la pantalla bloquea el registro para evitar superar la carga.

### Archivos principales

- [`app/delivery/[stopId].tsx`](./app/delivery/[stopId].tsx): formulario, estado de envío y entrega pendiente.
- [`src/components/GuidePhotoField.tsx`](./src/components/GuidePhotoField.tsx): selección y vista previa de fotos por guía.
- [`src/services/deliveryPhotos.ts`](./src/services/deliveryPhotos.ts) y [`src/services/deliveryPhotos.web.ts`](./src/services/deliveryPhotos.web.ts): persistencia local de fotos para móvil y web.
- [`src/services/deliveryOutbox.ts`](./src/services/deliveryOutbox.ts): cola local de entregas y estado de registro.
- [`src/services/deliverySync.ts`](./src/services/deliverySync.ts): registro, subida y reintentos de sincronización.
- [`src/services/routeLoadUsage.ts`](./src/services/routeLoadUsage.ts): consumo de carga por producto a nivel de ruta, con conciliación del servidor y entregas pendientes locales.
- [`app/(tabs)/index.tsx`](./app/(tabs)/index.tsx): selección de la vista Mapa dentro de Inicio.

## Actualización: resumen y finalización de ruta

Se rediseñó la pantalla previa al cierre para presentar los resultados de la ruta y la conciliación de carga antes de confirmar la acción.

### Hecho

- La pantalla presenta la fecha, el tiempo transcurrido, la distancia calculada para las paradas con coordenadas y los conteos de paradas gestionadas, entregadas, fallidas y omitidas.
- Se agregó una lista de paradas con su estado y detalle de unidades entregadas, dañadas o sin entregar; los motivos de entrega fallida y omisión se muestran cuando están disponibles.
- La conciliación compara las unidades entregadas con la carga confirmada y calcula las unidades que deben devolverse, separando las dañadas de las no entregadas.
- Debajo de **Unidades a devolver** se muestra el desglose por nombre de producto, cantidad y unidad, calculado como carga confirmada menos unidades entregadas.
- Se muestra una advertencia cuando hay fotos pendientes. Las fotos asociadas a entregas ya registradas no bloquean el cierre; sí lo bloquean las entregas que todavía no se han registrado en el servidor.
- El botón **Finalizar ruta** permanece fijo en el pie de la pantalla. Se conserva el modal de confirmación, las reglas de cierre, la sincronización GPS y el resumen posterior a la finalización.
- Los datos se consultan de las entregas, sus productos, fotos, paradas y carga confirmada; se evita inventar cantidades cuando no existen datos.

### Datos que no existen como campos propios

- La base de datos no proporciona un código corto de ruta como `STG-042`; por eso se usa el prefijo del UUID de la ruta.
- La distancia se obtiene del servicio de ruteo configurado. Si faltan coordenadas o no está disponible el endpoint, se indica que no se pudo calcular.
- La conciliación usa la carga confirmada guardada localmente. Si esa carga no está disponible, los totales se muestran como no disponibles en vez de asumir valores.

### Archivo principal

- [`app/route-summary.tsx`](./app/route-summary.tsx): pantalla de resumen, confirmación y resultado de cierre.
- [`src/services/routeCompletion.ts`](./src/services/routeCompletion.ts): cantidades por parada y producto, fotos faltantes y datos para la conciliación.
- [`src/services/driverLoad.ts`](./src/services/driverLoad.ts): lectura de la carga confirmada.

## Actualización: compatibilidad con Expo Web

- Se igualaron las versiones de `react` y `react-dom` a `19.3.0` y se fijó la versión web mediante el override del gestor de paquetes. Esto resuelve el error de versiones incompatibles que impedía iniciar la app en web.
- La app puede abrirse en el navegador para revisar pantallas sin generar una build para el teléfono. Las funciones que dependen de permisos o módulos nativos deben verificarse en un development build.

## Actualización: vulnerabilidades de dependencias

- Se actualizaron `@expo/cli` y `@expo/fingerprint` dentro de los rangos compatibles del SDK 58, y se limitó el override de `minimatch@11.0.1` a `@expo/fingerprint`.
- Se alinearon los módulos Expo con las versiones de parche recomendadas para el SDK 58, sin cambiar de versión mayor del SDK.
- Verificación: `npm audit` reporta cero vulnerabilidades; `npx expo install --check` confirma compatibilidad y las exportaciones web y Android finalizaron correctamente.

## Verificación de las actualizaciones recientes

- `cd mobile && npx tsc --noEmit --ignoreDeprecations 6.0`: correcto.
- `git diff --check`: correcto.
- La ruta de resumen se abrió en Expo Web, pero la cuenta de prueba no tenía una ruta activa asignada. Esa sesión web no permitió revisar datos reales; la verificación visual en dispositivo o emulador fue confirmada por el usuario.
- La app consulta rutas existentes: una prueba integral del resumen requiere una ruta activa con entregas y carga confirmada.

## Actualización: filtros y orden de paradas

- Bajo **Orden de visita** se agregó un selector desplegable en una capa modal anclada bajo el botón, para superponerse a las tarjetas con las opciones **No entregados**, **Entregados** y **Todos**. La lista inicia filtrada por **No entregados**.
- **No entregados** incluye pendientes y fallidos; las flechas solo aparecen para paradas reordenables que aún no estén entregadas. El nuevo orden se guarda también con la ruta en curso y mantiene fijas las paradas entregadas, parciales u omitidas.
- **Entregados** muestra las paradas entregadas, parciales y omitidas; **Todos** muestra todas. Ambas vistas permiten abrir el detalle, pero no muestran flechas.
- El mapa recalcula el recorrido vial respetando el orden guardado de las paradas que aún no se completan. En el detalle, la dirección deja de abrir el mapa para entregas completas, parciales u omitidas; llamar al cliente sigue disponible.
- Verificación: TypeScript, exportaciones Expo para web y Android y `git diff --check` correctos.

## Actualización: seguridad de la clave de OpenRouteService y de la sesión

### Problema
- La clave de OpenRouteService estaba en la app como `EXPO_PUBLIC_ORS_API_KEY`. Las variables `EXPO_PUBLIC_*` se incrustan en el código compilado, así que podía extraerse del APK o del bundle.
- La sesión de Supabase se guardaba sin cifrar en AsyncStorage.
- Las pantallas Detalle de parada, Registrar entrega, Entrega guardada y Omitir parada mostraban un ícono `?` arriba a la derecha que no hacía nada.

### Hecho
- **Proxy de rutas:** se creó la Edge Function `ors-directions`. Guarda la clave de ORS como secreto del servidor (`ORS_API_KEY`, el mismo que usa `optimizar-ruta`), exige la sesión de un usuario con perfil activo en `perfiles` y solo acepta de 2 a 50 coordenadas válidas. La app ya no necesita la clave.
- **`src/services/driverRouting.ts`:** ahora llama a `/functions/v1/ors-directions` con el token del conductor. Se mantienen la caché, la pausa por cuota (`OrsQuotaError`) y la recuperación por tramos. Los errores de sesión o permisos de la función se distinguen de los de cuota o clave de ORS mediante la cabecera `x-ors-upstream`, para que una sesión vencida no bloquee los cálculos de ruta por minutos.
- **Sesión cifrada:** se agregó `src/lib/secureStorage.ts`. Cifra la sesión con AES-256-CTR y un IV aleatorio por escritura. La clave de cifrado se guarda en Keystore (Android) o Keychain (iOS) mediante `expo-secure-store`, y la sesión cifrada queda en AsyncStorage. Las sesiones antiguas sin cifrar se migran solas al abrir la app, sin pedir iniciar sesión de nuevo. En web se mantiene AsyncStorage.
- **Íconos `?`:** se quitaron de las cuatro pantallas. En su lugar queda un espaciador del mismo ancho que el botón de volver, para que el código de ruta siga centrado. En `route-summary.tsx` (Finalizar ruta) no existía ese ícono en el código actual.

### Verificación
- Edge Function probada con `curl`, con una cuenta de conductor real:
  - con sesión: `200` y la cabecera `x-ors-upstream: 1`, con el trazado de la ruta;
  - con coordenadas inválidas: `400`;
  - sin sesión: `401`.
- La función `optimizar-ruta` de Administración no se modificó. Solo comparte el secreto `ORS_API_KEY`.
- Revisión de sintaxis de los archivos modificados: correcta.

### Archivos principales
- [`src/services/driverRouting.ts`](./src/services/driverRouting.ts): cálculo de rutas mediante el proxy.
- [`src/lib/secureStorage.ts`](./src/lib/secureStorage.ts): almacenamiento cifrado de la sesión.
- [`src/lib/supabase.ts`](./src/lib/supabase.ts): cliente de Supabase con la sesión cifrada.
- `supabase/functions/ors-directions/index.ts`: Edge Function, que vive en el proyecto de Supabase y no en la app.
- [`app/stop/[id].tsx`](./app/stop/[id].tsx), [`app/stop/omit/[id].tsx`](./app/stop/omit/[id].tsx) y [`app/delivery/[stopId].tsx`](./app/delivery/[stopId].tsx): se quitó el ícono `?`.