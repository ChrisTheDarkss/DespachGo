# Avance de Persona 3

## Alcance de este avance

Tareas 3-01, 3-02 y 3-03 del plan de trabajo: development build con EAS, instalación en un Android real y revisión de la base de navegación y cliente Supabase dejada por Persona 2. No se crearon pantallas ni componentes, y no se modificaron archivos de Persona 2 ni .env.example.

## Hecho
- 3-01 (hecha):
 - Se restauraron las dependencias con npm ci.
 - Se instaló expo-dev-client (~6.0.21, compatible con SDK 54).
 - Se vinculó el proyecto a EAS (despachgo-team / despachgo-mobile); app.json ahora incluye el projectId.
 - Se generó el development build Android con eas build --profile development --platform android. Estado Finished, duración 8 min 53 s. Las credenciales de firma (keystore) quedaron en los servidores de Expo.
- 3-02 (hecha):
 - El APK (162 MB) se instaló en un celular Android real y abre la pantalla "DespachGo – Development Build".
 - Incidente: la primera descarga con datos móviles dio "el paquete no es válido" (archivo incompleto). Se resolvió descargándolo de nuevo.
- 3-03 (en curso): se leyó la base de Persona 2 (app/_layout.tsx, src/lib/supabase.ts, src/hooks/useAuth.tsx) sin modificarla. Falta la conclusión escrita sobre si sirve para las pantallas de mapa y ruta.
## Pendiente / bloqueado
 - Conexión al servidor de desarrollo: el celular no logra conectarse al PC (npx expo start --dev-client). Falló con redes distintas y también en el wifi de la universidad (probable aislamiento de clientes). Un intento con túnel mostró "Android internal error". Por probar: túnel con revisión del log de la terminal, hotspot del celular o wifi doméstico.
 - Login no probado: depende de lo anterior y de que existan las variables de Supabase.
 - Variables de entorno: hay que cargar EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en EAS para los builds, con los valores que entregue Persona 1.
 - .env.example de mobile/: tiene variables que la app no usa (SUPABASE_SECRET_KEY, SUPABASE_JWKS_URL, etc.) en vez de las EXPO_PUBLIC_... que lee src/lib/supabase.ts. No se tocó; el equipo debe revisarlo.
 - Vulnerabilidades de npm: 17 reportadas (9 low, 6 moderate, 2 high). No se ejecutó npm audit fix. Revisar antes del APK de producción.
 - Cuenta de Expo: se creó una contraseña de Expo para la cuenta del equipo (antes solo entraba con Google). Compartirla de forma segura dentro del equipo; no va en el repo.
 - Para 3-05 (mapa): se necesitará una clave de Google Maps restringida, que debe crear alguien del equipo y que no puede quedar versionada.
 - 3-04 (wireframes en Figma): no iniciada.
 - Por indicación del equipo, se avanza solo con 3-01 y 3-02 hasta que el resto tenga su parte adelantada; 3-05 y 3-06 quedan para después.
## Verificación realizada
 - npm run typecheck: correcto.
 - npx expo install --check: dependencias al día.
 - Build en EAS: Finished.
 - APK instalado y abierto en un Android real (pantalla de development build visible).
 - No verificado: carga del código de la app en el celular, login con Supabase y navegación, porque no se logró conectar al servidor de desarrollo.
## Archivos principales
 - package.json y package-lock.json: se agregó expo-dev-client.
 - app.json: se agregó el projectId de EAS.
 - avance-persona-3.md: este documento.
