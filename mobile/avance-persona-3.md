## Avance de Persona 3

### Alcance del desarrollo

Se trabajó en la aplicación móvil de DespachGo, desarrollada con React Native, Expo y TypeScript, incorporando mejoras relacionadas con la visualización de la carga total del conductor.

El objetivo inicial fue permitir que el conductor consultara los productos y cantidades correspondientes a su ruta asignada antes de comenzar el recorrido, sin exigir confirmación de carga.

Por acuerdo con Persona 2, se descartó la pantalla independiente de carga posterior a la autorización GPS y se adoptó un componente reutilizable para la pantalla principal.

Posteriormente, se amplió el desarrollo mediante la integración de **Leaflet, OpenStreetMap y OpenRouteService**, permitiendo visualizar recorridos viales desde la ubicación GPS del conductor hasta las entregas pendientes.

### 1. Adaptación del resumen general de productos

**Archivo:** `src/components/RouteProductsSummary.tsx`

**Estado:** Implementado; pendiente de validar completamente con datos reales.

Cambios realizados:

- Adaptación del componente para mostrar el total general consolidado de productos.
- Visualización del nombre, cantidad total y unidad de medida.
- Eliminación de productos separados por parada y botones de confirmación.
- Incorporación de estados de carga, error con reintento y vista vacía.
- Implementación como componente reutilizable, sin encabezado ni pantalla independiente.

El componente utiliza `getTodaysRouteProductTotals(conductorId)`, definido en `src/services/routeProducts.ts`.

No se modificaron los servicios ni los tipos de productos durante esta adaptación.

### 2. Eliminación del flujo antiguo de carga

**Archivos afectados:**

- `app/route-load.tsx` — eliminado.
- `app/gps-consent.tsx` — restaurado a la versión de `origin/feature/mobile`.

Se eliminó la pantalla independiente de carga que aparecía después de la autorización GPS.

El flujo de navegación volvió directamente a `/(tabs)`, conservando la funcionalidad existente de inicio de rutas y seguimiento GPS.

En las pruebas posteriores se verificó el cambio de estado de una ruta a «En curso» y la activación del seguimiento GPS.

### 3. Integración de la pestaña «Carga» y mejoras del mapa

**Archivo:** `app/(tabs)/index.tsx`

Por acuerdo con Persona 2, se autorizó incorporar la pestaña «Carga» en la navegación principal, respetando el orden:

1. Lista
2. Carga
3. Mapa

La integración inicial contempló utilizar `RouteProductsSummary` con el identificador del conductor autenticado, sin modificar el diseño de las tarjetas ni la lógica de entregas.

**Ampliación del mapa interactivo:**

Se trabajó principalmente en los siguientes archivos:

- `src/components/ActiveRouteMap.tsx`
- `src/components/RouteMap.leaflet.native.tsx`
- `src/components/RouteMap.maplibre.native.tsx`
- `src/services/driverRouting.ts`
- `src/services/gpsStore.ts`
- `src/hooks/useGpsTracking.ts`

Se implementaron las siguientes funcionalidades:

- Mapa interactivo con Leaflet, OpenStreetMap y React Native WebView.
- Cálculo de recorridos viales mediante OpenRouteService.
- Marcadores numerados según el orden de las entregas.
- Recorrido desde la ubicación GPS real del conductor hasta las paradas pendientes.
- Segmentos diferenciados mediante colores azul, naranja, violeta y verde azulado.
- Botón «Mi ubicación» para centrar el mapa en el conductor.
- Visualización de distancia total, duración estimada y siguiente entrega.
- Manejo de errores de OpenRouteService, incluidos los códigos `2009` y `2010`.
- Recuperación de recorridos parciales cuando un tramo no puede calcularse.

También se incorporó una mejora para **mantener visible el último recorrido calculado cuando el conductor permanece detenido**.

Si transcurren más de 90 segundos sin nuevas coordenadas GPS, el marcador pasa a representar la última ubicación conocida, pero el recorrido y sus estimaciones permanecen visibles, con una advertencia de posible desactualización.

No se modificó la frecuencia de captura ni de envío GPS a Supabase como parte de esta mejora.

### 4. Validaciones técnicas

Se realizaron las siguientes comprobaciones:

- `npm run typecheck -- --ignoreDeprecations 6.0` — aprobado.
- `git diff --check` — sin errores reportados.
- `git status --short` — revisión de archivos modificados.
- Revisión de dependencias y configuración mediante `git diff`.
- Verificación del funcionamiento de Leaflet y OpenRouteService en Android.

Se incorporaron las dependencias `leaflet`, `react-native-webview` y `@types/leaflet`.

Durante las pruebas se detectó un error de enrutamiento asociado a una parada. Se mejoró el diagnóstico de ORS y se implementó la recuperación de tramos válidos sin modificar las coordenadas originales ni unir puntos mediante líneas rectas artificiales.

### 5. Compilación y pruebas Android

Se realizó una compilación de desarrollo mediante:

`npx eas-cli build --profile development --platform android`

Posteriormente, se instaló y probó una APK de desarrollo en un dispositivo Android real, utilizando Expo para cargar las actualizaciones del código.

**Pruebas realizadas:**

- Visualización de paradas y recorridos sobre calles reales.
- Funcionamiento de los colores por tramo.
- Activación del seguimiento GPS.
- Representación del conductor mediante un marcador independiente.
- Funcionamiento del botón «Mi ubicación».
- Cálculo de distancia y duración desde la ubicación del conductor.

Con el Conductor 3 se comprobó una ruta con tres paradas:

- **Recorrido entre entregas:** 6,0 km y 12 minutos.
- **Recorrido desde el GPS del conductor:** 22,2 km y 38 minutos.

El 21 de noviembre de 2026 se realizó otra prueba con dos paradas pendientes, comprobando que el recorrido de **19,6 km y 34 minutos** permanecía visible después de superar los 90 segundos sin una nueva posición GPS.

Se obtuvieron capturas de pantalla como evidencia de estas pruebas.

**Pendiente:** generar una APK actualizada con todos los cambios para realizar pruebas de conducción sin depender del servidor Expo.

### 6. Control de versiones

Inicialmente se acordó dividir el trabajo de carga en dos commits:

**Commit 1:** adaptación del resumen general de productos.

`feat(mobile): adaptar resumen general de productos de ruta`

**Commit 2:** eliminación del flujo antiguo de carga.

`refactor(mobile): retirar pantalla de carga posterior al GPS`

La creación de esos commits no quedó confirmada en el registro inicial.

**Commit de ampliación realizado:**

- **Rama:** `feature/mobile`
- **Identificador:** `cc623df`
- **Mensaje:** `feat(mobile): integrar Leaflet, rutas ORS y seguimiento GPS`

El commit incluye 12 archivos relacionados con los mapas, seguimiento GPS, cálculo de rutas, dependencias y configuración Expo.

Se actualizó el propietario del proyecto EAS a `despachgoeass-team`.

**Estado:** Commit de código realizado localmente. Pendiente el commit de documentación y el push para coordinar el merge con el equipo.

### 7. Pendientes de verificación

- Completar la validación de los productos reales de Supabase.
- Verificar los estados de carga, error, reintento y vacío.
- Incorporar las capturas de Android como evidencias.
- Generar una APK de prueba actualizada e independiente del servidor Expo.
- Realizar una prueba de conducción con una ruta autorizada en Temuco.
- Verificar el recálculo GPS durante desplazamientos reales.
- Ampliar las pruebas de recuperación de rutas parciales de OpenRouteService.
- Comprobar el comportamiento cuando cambian las entregas pendientes.
- Confirmar el funcionamiento de los componentes después del merge.
- Crear el commit de documentación y compartir la rama con el equipo.

### Resultado del avance

Se completó la adaptación del componente informativo de carga total y la eliminación del flujo antiguo de pantalla independiente, manteniendo el alcance acordado inicialmente con Persona 2.

Posteriormente, se implementó el mapa interactivo con Leaflet y OpenStreetMap, incorporando recorridos viales calculados por OpenRouteService, ubicación GPS del conductor, marcadores numerados y tramos diferenciados por colores.

Se comprobó en Android que el recorrido puede comenzar desde la ubicación real del conductor y continuar hacia las entregas pendientes.

También se mejoró el comportamiento cuando el conductor permanece detenido, conservando el último recorrido calculado e informando cuándo la ubicación está desactualizada.

**Las principales funcionalidades del mapa fueron probadas en Android y las validaciones de TypeScript resultaron satisfactorias.**

Queda pendiente generar la APK actualizada, completar las pruebas de conducción y coordinar la integración del trabajo con el equipo.