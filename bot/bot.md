/bot – Bot de WhatsApp
Servicio de Node.js que envía a los clientes el mensaje de «tu pedido va en camino» y recibe su confirmación. Usa Baileys (librería no oficial de WhatsApp) con un número dedicado.

Responsable: Persona 5. Respaldo: Persona 1.
Cómo funciona
1. El conductor pulsa «Iniciar ruta» en la app y se crean filas pendientes en la tabla mensajes_whatsapp.
2. El bot lee esas filas, envía cada mensaje con una pausa de 5 a 10 segundos entre ellos y los marca como enviados o con error.
3. Cuando el cliente responde 1, 2 o 3, el bot guarda la confirmación en la parada. Cualquier otro texto se guarda tal cual.
La app y el panel nunca hablan directo con WhatsApp; todo pasa por la base de datos. Así no hay que exponer el PC a internet y, si el PC se apaga, los mensajes quedan en cola.
Qué va en esta carpeta
- Todo el código del bot.
- El archivo .env.example con los nombres de las variables (sin valores reales).
Qué NO va aquí
- La carpeta de sesión de WhatsApp (por ejemplo auth/). Contiene credenciales: si alguien la obtiene, controla el número. Debe estar en .gitignore.
- Los archivos de logs.
- El archivo .env real.
- Código de la app o del panel.
Estructura sugerida
bot/
├── src/
│   ├── index.ts                 Punto de entrada
│   ├── whatsapp/                Conexión con Baileys, QR y reconexión
│   ├── mensajeria/
│   │   ├── interfaz.ts          enviarMensaje(telefono, texto)
│   │   └── baileys.ts           Implementación con Baileys
│   ├── cola/                    Lectura de mensajes pendientes y reintentos
│   ├── respuestas/              Interpretación de 1, 2 y 3
│   ├── plantillas/              Texto de los mensajes (una guía y varias guías)
│   ├── lib/                     Cliente de Supabase
│   └── utils/                   Normalizar teléfonos al formato +56 9
├── auth/                        Sesión de WhatsApp (NO se sube a Git)
├── logs/                        Registros (NO se suben a Git)
├── .env.example
└── package.json
Reglas importantes
- El resto del código solo usa enviarMensaje(telefono, texto). Así se puede migrar a la API oficial de Meta sin tocar nada más.
- Usar un chip dedicado en un Android viejo, nunca un número personal ni el de la empresa.
- Espaciar los mensajes y evitar ráfagas.
- Cuando una parada tiene varias guías, enviar un solo mensaje que las liste.
- No prometer turnos en el mensaje (el orden de la ruta cambia).
- Identificar siempre al negocio en el mensaje.
- El bot usa la clave privada de Supabase: debe vivir solo en el PC servidor, nunca en la app ni en el panel.
Operación
- El PC debe estar encendido y con internet durante el horario de despachos, con la suspensión automática desactivada.
- Si la sesión se cae, hay que escanear el QR de nuevo (procedimiento en la tarea 5-21 y documento de operación en /docs).
- Registrar los mensajes con error para revisarlos.
Primeras tareas
5-01 y 5-02 (preparar el número y enviar un primer mensaje), 5-03 (interfaz enviarMensaje) y 5-04 (normalizar teléfonos).
Etapa 1 – Preparación y configuración inicial (completada)
Objetivo: preparar el entorno de desarrollo y establecer una base funcional para implementar el servicio de mensajería.
Trabajo realizado
- Se creó el proyecto local bot-whatsapp y se abrió en Visual Studio Code.
- Se verificó la instalación de Node.js y npm, y se resolvió la restricción de PowerShell que impedía ejecutar npm directamente.
- Se inicializó el proyecto Node.js y se instalaron dotenv, typescript, tsx y @types/node.
- Se configuraron package.json y tsconfig.json para trabajar con TypeScript y módulos de Node.js.
- Se organizaron las carpetas del proyecto para separar conexión, mensajería, cola, respuestas, plantillas, acceso a datos y utilidades.
- Se creó src/index.ts como punto de entrada inicial del servicio.
- Se corrigió un error de reconocimiento de process al habilitar los tipos de Node.js en TypeScript.
- Se comprobó que el programa inicial se ejecuta correctamente y muestra el mensaje «Bot iniciado correctamente».
Seguridad y control de versiones
Se definió el uso de .gitignore y .env.example para separar la configuración pública de las credenciales privadas. También se revisó cómo incorporar el bot en una rama del repositorio de despachos, evitando mantener un repositorio Git anidado dentro de la carpeta del proyecto.
Resultado
El entorno de desarrollo quedó operativo y el punto de entrada del bot fue probado correctamente. Todavía no se ha confirmado la conexión real a WhatsApp ni la integración con Supabase; ambas corresponden a etapas posteriores.
Siguiente etapa
Etapa 2 – Conexión con WhatsApp: instalar y configurar Baileys, generar el código QR, vincular el número dedicado y realizar una primera prueba de mensajería.