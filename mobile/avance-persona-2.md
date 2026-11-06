# Avance de Persona 2

## Alcance de este avance

Se preparó la base de la app móvil y se implementaron las primeras tareas de Persona 2 definidas en el plan: **2-03 (login conectado a Supabase Auth)** y **2-04 (Mi ruta de hoy con datos de prueba)**. El diseño visual se mantiene deliberadamente simple y provisional, a la espera de los wireframes de Figma.

## Hecho

- Estructura inicial con Expo, Expo Router, TypeScript y perfiles de compilación EAS.
- Login de conductor con correo y contraseña mediante Supabase Auth, sesión persistida en el dispositivo y navegación protegida.
- Mensajes visibles cuando faltan variables de configuración o falla el inicio/cierre de sesión.
- Lista provisional de tres paradas de prueba con dirección, estado e indicador de confirmación del cliente.
- Controles con tamaño legible y adecuado para interacción táctil.
- `.env.example` contiene únicamente los nombres de las variables públicas requeridas.
- Exclusión local de `.env`, dependencias y archivos generados para evitar subir secretos o artefactos.

## Pendiente / bloqueado por dependencias

- Configurar las variables de Supabase con valores del proyecto y verificar el inicio de sesión con un usuario real.
- Sustituir los datos de prueba por la ruta real cuando estén disponibles las tablas, las políticas de acceso y la función de asignación.
- Completar detalle de parada, registro de entrega, motivos, fotos, almacenamiento sin conexión y reintentos (tareas 2-05 a 2-18).
- Revisar la interfaz con los wireframes cuando se compartan.
- Probar en un development build instalado en un Android real; esta implementación no se considera validada en dispositivo.

## Verificación realizada

- `npm run typecheck`: correcto.
- `npx expo install --check`: dependencias compatibles con el SDK configurado.
- La instalación de npm informó 8 vulnerabilidades en el árbol de dependencias; deben revisarse antes de preparar un build de distribución.
- No se ejecutó ni se probó un development build en un teléfono real.

## Archivos principales

- `app/login.tsx`: acceso del conductor.
- `app/(tabs)/index.tsx`: lista de ruta de prueba.
- `src/lib/supabase.ts`: cliente compartido de Supabase con configuración solo pública.
- `src/hooks/useAuth.tsx`: gestión de sesión de conductor con Supabase Auth.
- `src/data/mockStops.ts`: datos temporales de paradas.
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
- Se incorporaron el resumen y el cierre de ruta; no se permite finalizar mientras haya registros pendientes de sincronización.
- Se solucionó el requisito nativo de MapLibre para la pantalla del mapa. Para usarlo, debe instalarse un development build que incluya el módulo nativo; Expo Go o un binario anterior no bastan.

### Verificación y estado actual

- Pasaron el chequeo de TypeScript y las exportaciones de Expo para web y Android.
- El usuario confirmó que la app funciona después de instalar una build nueva.
- La app consulta rutas existentes; no crea ni asigna rutas automáticamente. Si no aparece una ruta en la cuenta del conductor, falta crearla y asignarla desde el flujo de administración/backend de Supabase.
- El ruteo vial requiere configurar un endpoint de la empresa; no se envían las coordenadas de clientes a un servicio público por defecto.
- El seguimiento en segundo plano depende de la plataforma y los permisos; en web funciona mientras la pestaña está abierta.
