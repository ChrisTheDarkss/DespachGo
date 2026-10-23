# Despacho – Registro de avance

Este documento es la memoria del proyecto: dice en qué punto vamos, qué se decidió y qué sigue. Se actualiza al cierre de cada día de trabajo. Al retomar una conversación con Claude, compartan el enlace de este documento (o escriban el día en que van) para continuar sin perder contexto.

## 1. Estado actual

| Campo | Valor |
| --- | --- |
| Semana actual | Semana 1 (todavía sin iniciar) |
| Último día completado | Ninguno |
| Próximo día | Día 1 |
| Avance general | 0 de 128 tareas |
| Próximo hito | Demo de la semana 1: el admin crea una orden, un conductor inicia sesión y el bot envía un mensaje de prueba |
| Bloqueos abiertos | Ninguno |

## 2. Avance por semana

| Semana | Días | Tareas totales | Hechas | Estado |
| --- | --- | --- | --- | --- |
| 1 | 1–3 | 29 | 0 | Pendiente |
| 2 | 4–6 | 36 | 0 | Pendiente |
| 3 | 7–9 | 30 | 0 | Pendiente |
| 4 | 10–12 | 33 | 0 | Pendiente |

## 3. Avance por persona

| Persona | Responsabilidad | Tareas hechas | Tarea actual | Bloqueo |
| --- | --- | --- | --- | --- |
| Persona 1 | Base de datos, seguridad, integración y lanzamiento | 0 | – | – |
| Persona 2 | App: entrega, fotos y reintentos | 0 | – | – |
| Persona 3 | App: mapa, ruta y GPS | 0 | – | – |
| Persona 4 | Panel admin | 0 | – | – |
| Persona 5 | Bot de WhatsApp, geocodificación y optimización | 0 | – | – |

## 4. Bitácora diaria

Agregar una fila por día de trabajo, la más reciente al final.

| Día | Fecha | Qué se hizo | Bloqueos o problemas | Decisiones | Para el próximo día |
| --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |

## 5. Decisiones tomadas (resumen del diseño)

- **Producto:** app de conductores para órdenes de despacho en Temuco, 3 conductores, rutas de más de 8 paradas, equipo de 5 personas, todas junior.
- **Stack:** React Native con Expo (development build), panel en React con Vite, Supabase, bot con Baileys en un PC con Android de chip dedicado, OpenRouteService y Nominatim, Leaflet para el mapa del panel.
- **Órdenes:** las ingresa el admin; una orden es una compra y tiene una guía impresa antes de salir. El número de guía es obligatorio y único.
- **Agrupación:** órdenes del mismo cliente en la misma ruta se agrupan en una sola parada con varias guías y un solo mensaje de WhatsApp.
- **Conductor:** puede reordenar y omitir paradas con motivo. Las omitidas vuelven a pendiente.
- **Entregas:** completa, parcial o fallida. Foto de la guía firmada obligatoria en completa y parcial, opcional en fallida. Reintento el mismo día; las que sigan fallidas al finalizar la ruta pasan a orden fallida y el admin reprograma o cancela.
- **WhatsApp:** se envía al iniciar la ruta, con respuestas 1 (sí), 2 (no) y 3 (hablar con alguien). Sin promesa de turno. Los clientes son avisados antes.
- **GPS:** en segundo plano solo entre Iniciar y Finalizar ruta, con consentimiento; se guarda solo la última posición. Es una función deseable: si hay atraso se pospone.
- **Admin con ruta en curso:** solo puede agregar paradas al final.
- **Plan:** 1 mes = 4 semanas × 3 días = 12 días, con integración y demo los días 3, 6, 9 y 12.

## 6. Bloqueos abiertos

| Fecha | Quién | Descripción | Quién ayuda | Estado |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 7. Preguntas pendientes del equipo

- ¿Los 3 conductores usan Android? Hay que confirmar marcas y versiones, por la optimización de batería.
- ¿Cuál es el nombre real del negocio y del producto? Se necesita para el mensaje de WhatsApp.
- ¿Qué días y horario trabaja el equipo? Define la fecha real de cada día del plan.
- ¿Dónde estará el PC que hace de servidor del bot y quién lo cuida?

## 8. Lista para después del lanzamiento

| Idea o mejora | Origen | Prioridad |
| --- | --- | --- |
|  |  |  |
