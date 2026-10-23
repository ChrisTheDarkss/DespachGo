# Acuerdos del equipo

Propuesta de convenciones para que app, panel, bot y base de datos hablen el mismo idioma. **Se confirma entre todos el Día 1** (tarea 1-02); lo que se cambie se actualiza aquí el mismo día.

## 1. Nombres en la base de datos

- Todo en español, minúsculas y con guion bajo (`snake_case`): `numero_guia`, `cantidad_pedida`.
- Nombres de tablas en plural: `ordenes`, `paradas`, `entregas`.
- Clave primaria de cada tabla: `id`. Claves foráneas: nombre en singular + `_id` (`orden_id`, `ruta_id`).
- Fechas y horas de registro: `creado_en` y `actualizado_en` en todas las tablas.
- Nunca se borran filas de órdenes, paradas ni entregas: se cambia su estado.

Tablas: perfiles, productos, ordenes, orden_items, rutas, paradas, parada_ordenes, entregas, entrega_items, entrega_fotos, mensajes_whatsapp, ubicaciones_conductor.

## 2. Teléfonos

- Formato guardado: `+569XXXXXXXX` (código de Chile y 8 dígitos, sin espacios ni guiones).
- Al ingresar un teléfono se normaliza antes de guardarlo (función compartida del bot, tarea 5-04).
- Ejemplo: `9 1234 5678`, `91234567` y `+56 9 1234 5678` se guardan como `+56912345678`.

## 3. Fechas y horas

- En la base de datos: formato ISO 8601 en UTC (`timestamptz`).
- Para el usuario: zona horaria `America/Santiago`, formato `dd/mm/aaaa` y hora de 24 horas.
- La fecha de una ruta (`fecha`) es solo día, sin hora.

## 4. Estados (se guardan exactamente así)

| Entidad | Valores |
|---|---|
| Orden | `pendiente`, `asignada`, `en_ruta`, `entregada`, `entregada_parcial`, `fallida`, `cancelada` |
| Parada | `pendiente`, `entregada`, `parcial`, `fallida_por_reintentar`, `fallida`, `omitida` |
| Ruta | `borrador`, `asignada`, `en_curso`, `finalizada` |
| Resultado de entrega | `entregada`, `parcial`, `fallida` |
| Confirmación del cliente | `sin_respuesta`, `confirmo`, `no_habra_nadie`, `quiere_hablar`, `otro` |
| Mensaje de WhatsApp: estado | `pendiente`, `enviado`, `error` |
| Mensaje de WhatsApp: dirección | `enviado`, `recibido` |
| Rol de usuario | `admin`, `conductor` |

Los textos que ve el usuario (por ejemplo «Entregada parcial») se definen en un solo lugar de cada aplicación, no se escriben sueltos en las pantallas.

## 5. Motivos

- **Entrega fallida:** `cliente_ausente`, `direccion_incorrecta`, `rechazo`, `problema_vehiculo_transito`, `otro`.
- **Parada omitida:** `calle_cerrada`, `accidente`, `cliente_ausente`, `otro`.
- **Diferencia en un producto:** `faltante`, `danado`, `rechazado_por_cliente`, `otro`.
- Cuando el motivo es `otro`, se exige un comentario corto.

## 6. Código

- Lenguaje: TypeScript en `/mobile`, `/admin` y `/bot`.
- Variables y funciones en `camelCase` (`cantidadEntregada`); componentes en `PascalCase` (`TarjetaParada`); archivos de utilidades en `camelCase` o `kebab-case`, pero el mismo estilo dentro de cada carpeta.
- Los nombres de campos que vienen de la base de datos se mantienen como están (`numero_guia`), sin renombrarlos al leerlos.
- Validar los datos de entrada (por ejemplo con Zod) antes de guardarlos.
- Textos de la interfaz en español.
- Sin claves ni secretos en el código: siempre variables de entorno.

## 6.1. Mensajes de commit

Prefijo + descripción corta en español:

```
feat: agrega pantalla de registro de entrega
fix: corrige el cálculo de entrega parcial
docs: actualiza acuerdos
chore: actualiza dependencias
```

## 7. Ramas y Pull Requests

- Rama por tarea: `feature/<id>-<descripcion>`, por ejemplo `feature/2-07-motivo-parcial`.
- Nunca se sube directo a `main`.
- Todo cambio entra por Pull Request con la plantilla del repositorio.
- Quien revisa:

| Quien escribe | Quien revisa |
|---|---|
| Persona 1 | Persona 5 |
| Persona 2 | Persona 3 |
| Persona 3 | Persona 2 |
| Persona 4 | Persona 1 |
| Persona 5 | Persona 4 |

- Los cambios de base de datos (`supabase/`) los revisa además la Persona 1.
- Un Pull Request no debería quedar más de un día sin revisar.

## 8. Fotos

- Una foto por hoja de la guía; puede haber varias por entrega.
- Tamaño: unos 1000 px de ancho (entre 300 y 600 KB).
- Ruta en Storage: `entregas/<entrega_id>/<nombre_de_archivo>`.
- Bucket privado, acceso solo por enlace temporal.

## 9. Mensaje de WhatsApp

- Siempre identifica al negocio.
- Nunca promete un turno u hora de llegada.
- Opciones de respuesta: `1` = sí, `2` = no, `3` = hablar con alguien.
- Un solo mensaje por parada, aunque tenga varias guías.
- Pausa de 5 a 10 segundos entre un mensaje y otro.

## 10. Por definir (completar el Día 1)

- Nombre del negocio que aparecerá en el mensaje de WhatsApp (el producto se llama DespachGo).
- Idioma de los nombres de variables si el equipo prefiere inglés en el código.
- Horario en que el bot y el PC servidor deben estar encendidos.