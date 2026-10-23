# /admin – Panel del administrador

Aplicación web para que el administrador cree órdenes, arme rutas y supervise el día. Está hecha con React, Vite, TypeScript y Leaflet, y se despliega en Vercel.

**Responsable:** Persona 4. Respaldo: Persona 1.

## Qué va en esta carpeta

- Todo el código del panel web.
- Configuración de Vite y de despliegue.
- El archivo `.env.example` con los nombres de las variables (sin valores reales).

## Qué NO va aquí

- Código de la app del conductor (va en `/mobile`).
- Código del bot (va en `/bot`).
- La clave privada de Supabase ni la clave de OpenRouteService. El panel usa la clave pública y llama a las funciones de Supabase para optimizar y geocodificar.
- El archivo `.env` real.

## Estructura sugerida

```
admin/
├── src/
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Ordenes.tsx         Lista, filtros y búsqueda por guía
│   │   ├── OrdenForm.tsx       Crear y editar orden con mapa
│   │   ├── ArmarRuta.tsx       Elegir órdenes, optimizar, asignar
│   │   ├── ResumenDia.tsx      Rutas, paradas, fotos y mapa en vivo
│   │   └── Pendientes.tsx      Fallidas, omitidas y parciales
│   ├── components/             Tablas, mapa Leaflet, selector de productos...
│   ├── lib/                    Cliente de Supabase
│   ├── services/               Órdenes, rutas, geocodificación, optimización
│   ├── hooks/
│   ├── types/
│   └── main.tsx
├── public/
├── index.html
├── vite.config.ts
├── .env.example
└── package.json
```

## Pantallas de esta carpeta

Login (solo rol admin), Órdenes, Crear y editar orden, Armar ruta, Resumen del día y Pendientes de resolver.

## Reglas importantes

- El número de guía es obligatorio y único; avisar si ya existe.
- Los productos se eligen del catálogo, nunca se escriben a mano.
- El admin siempre valida el pin de la dirección en el mapa (la geocodificación gratuita puede fallar).
- Si varias órdenes del mismo cliente van en la misma ruta, proponer agruparlas en una sola parada y dejar que el admin confirme.
- Con la ruta ya iniciada, el admin solo puede agregar paradas al final; no reordena ni quita.
- Cancelar una orden no la borra: queda en estado «cancelada» con motivo.

## Primeras tareas

4-03 (proyecto Vite y despliegue en Vercel), 4-04 (login), 4-05 (lista de órdenes) y 4-06 a 4-09 (formulario de orden con mapa).