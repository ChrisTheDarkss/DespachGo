-- =====================================================================
-- 002: rutas, paradas, parada_ordenes, entregas, entrega_items, entrega_fotos
-- =====================================================================

-- ---------------------------------------------------------------------
-- rutas: recorrido de un conductor en un día (una ruta por conductor y día)
-- Si más adelante necesitan dos rutas el mismo día, se elimina la restricción
-- rutas_conductor_fecha_unica.
-- ---------------------------------------------------------------------
create table public.rutas (
  id             uuid primary key default gen_random_uuid(),
  conductor_id   uuid not null references public.perfiles (id) on delete restrict,
  fecha          date not null,
  estado         text not null default 'borrador'
                 check (estado in ('borrador', 'asignada', 'en_curso', 'finalizada')),
  iniciada_en    timestamptz,
  finalizada_en  timestamptz,
  creado_por     uuid references public.perfiles (id) on delete restrict default auth.uid(),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint rutas_conductor_fecha_unica unique (conductor_id, fecha)
);

-- ---------------------------------------------------------------------
-- paradas: un punto de la ruta; puede agrupar varias órdenes (parada_ordenes)
-- posicion_sugerida = orden optimizado; posicion_final = orden del conductor
-- ---------------------------------------------------------------------
create table public.paradas (
  id                  uuid primary key default gen_random_uuid(),
  ruta_id             uuid not null references public.rutas (id) on delete restrict,
  posicion_sugerida   integer check (posicion_sugerida > 0),
  posicion_final      integer check (posicion_final > 0),
  estado              text not null default 'pendiente'
                      check (estado in ('pendiente', 'entregada', 'parcial',
                                        'fallida_por_reintentar', 'fallida', 'omitida')),
  motivo_omision      text check (motivo_omision is null
                                  or motivo_omision in ('calle_cerrada', 'accidente',
                                                        'cliente_ausente', 'otro')),
  comentario_omision  text,
  confirmacion_cliente text not null default 'sin_respuesta'
                      check (confirmacion_cliente in ('sin_respuesta', 'confirmo',
                                                      'no_habra_nadie', 'quiere_hablar', 'otro')),
  respuesta_cliente   text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  -- Diferida: permite intercambiar posiciones dentro de una misma transacción
  constraint paradas_posicion_final_unica
    unique (ruta_id, posicion_final) deferrable initially deferred,
  constraint paradas_omitida_con_motivo
    check (estado <> 'omitida' or motivo_omision is not null)
);

create index paradas_ruta_idx on public.paradas (ruta_id);

-- ---------------------------------------------------------------------
-- parada_ordenes: qué órdenes (guías) se entregan en cada parada
-- ---------------------------------------------------------------------
create table public.parada_ordenes (
  parada_id      uuid not null references public.paradas (id) on delete restrict,
  orden_id       uuid not null references public.ordenes (id) on delete restrict,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  primary key (parada_id, orden_id)
);

create index parada_ordenes_orden_idx on public.parada_ordenes (orden_id);

-- ---------------------------------------------------------------------
-- entregas: cada intento de entrega de una parada (el historial se conserva)
-- ---------------------------------------------------------------------
create table public.entregas (
  id             uuid primary key default gen_random_uuid(),
  parada_id      uuid not null references public.paradas (id) on delete restrict,
  resultado      text not null check (resultado in ('entregada', 'parcial', 'fallida')),
  motivo         text check (motivo is null
                             or motivo in ('cliente_ausente', 'direccion_incorrecta', 'rechazo',
                                           'problema_vehiculo_transito', 'otro')),
  comentario     text,
  recibido_por   text,
  latitud        numeric(9, 6) check (latitud between -90 and 90),
  longitud       numeric(9, 6) check (longitud between -180 and 180),
  creado_por     uuid references public.perfiles (id) on delete restrict default auth.uid(),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint entregas_fallida_con_motivo
    check (resultado <> 'fallida' or motivo is not null),
  constraint entregas_otro_con_comentario
    check (motivo is distinct from 'otro' or length(btrim(coalesce(comentario, ''))) > 0)
);

create index entregas_parada_idx on public.entregas (parada_id);

-- ---------------------------------------------------------------------
-- entrega_items: cantidad entregada de cada producto (entregas parciales)
-- ---------------------------------------------------------------------
create table public.entrega_items (
  id                 uuid primary key default gen_random_uuid(),
  entrega_id         uuid not null references public.entregas (id) on delete restrict,
  orden_item_id      uuid not null references public.orden_items (id) on delete restrict,
  cantidad_entregada numeric(10, 2) not null check (cantidad_entregada >= 0),
  motivo             text check (motivo is null
                                 or motivo in ('faltante', 'danado', 'rechazado_por_cliente', 'otro')),
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  unique (entrega_id, orden_item_id)
);

create index entrega_items_orden_item_idx on public.entrega_items (orden_item_id);

-- ---------------------------------------------------------------------
-- entrega_fotos: foto(s) de la guía firmada
-- ruta_archivo = ruta del objeto en el bucket privado "entregas":
--   <entrega_id>/<nombre_de_archivo>
-- orden_id (opcional) indica a qué guía corresponde la foto cuando una
-- parada agrupa varias órdenes.
-- ---------------------------------------------------------------------
create table public.entrega_fotos (
  id             uuid primary key default gen_random_uuid(),
  entrega_id     uuid not null references public.entregas (id) on delete restrict,
  orden_id       uuid references public.ordenes (id) on delete restrict,
  ruta_archivo   text not null unique check (length(btrim(ruta_archivo)) > 0),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index entrega_fotos_entrega_idx on public.entrega_fotos (entrega_id);
