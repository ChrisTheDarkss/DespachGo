-- =====================================================================
-- 001: perfiles, productos, ordenes y orden_items
-- Convenciones: ver docs/acuerdos.md (español, snake_case, estados fijos)
-- Nunca se borran filas: las FK usan ON DELETE RESTRICT (salvo perfiles->auth).
-- =====================================================================

-- Actualiza actualizado_en en cada UPDATE (se conecta a las tablas en la 004)
create or replace function public.set_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- perfiles: un perfil por usuario de Supabase Auth (admin o conductor)
-- Se crean a mano o con supabase/seed_usuarios.sql (no hay registro libre)
-- ---------------------------------------------------------------------
create table public.perfiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  nombre         text not null check (length(btrim(nombre)) > 0),
  telefono       text check (telefono is null or telefono ~ '^\+569[0-9]{8}$'),
  rol            text not null default 'conductor' check (rol in ('admin', 'conductor')),
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- productos: catálogo conocido (el admin elige de una lista)
-- ---------------------------------------------------------------------
create table public.productos (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null unique check (length(btrim(nombre)) > 0),
  unidad         text not null default 'unidad',
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ordenes: una compra = una orden = una guía de despacho
-- ---------------------------------------------------------------------
create table public.ordenes (
  id                 uuid primary key default gen_random_uuid(),
  numero             bigint generated always as identity unique,
  numero_guia        text not null unique check (length(btrim(numero_guia)) > 0),
  cliente_nombre     text not null check (length(btrim(cliente_nombre)) > 0),
  cliente_telefono   text not null check (cliente_telefono ~ '^\+569[0-9]{8}$'),
  direccion          text not null check (length(btrim(direccion)) > 0),
  comuna             text not null default 'Temuco',
  latitud            numeric(9, 6) check (latitud between -90 and 90),
  longitud           numeric(9, 6) check (longitud between -180 and 180),
  notas              text,
  estado             text not null default 'pendiente'
                     check (estado in ('pendiente', 'asignada', 'en_ruta', 'entregada',
                                       'entregada_parcial', 'fallida', 'cancelada')),
  motivo_cancelacion text,
  fecha              date not null default (now() at time zone 'America/Santiago')::date,
  creado_por         uuid references public.perfiles (id) on delete restrict default auth.uid(),
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  constraint ordenes_cancelada_con_motivo
    check (estado <> 'cancelada' or length(btrim(coalesce(motivo_cancelacion, ''))) > 0)
);

create index ordenes_estado_idx on public.ordenes (estado);
create index ordenes_fecha_idx on public.ordenes (fecha);

-- ---------------------------------------------------------------------
-- orden_items: productos de cada orden
-- ---------------------------------------------------------------------
create table public.orden_items (
  id              uuid primary key default gen_random_uuid(),
  orden_id        uuid not null references public.ordenes (id) on delete restrict,
  producto_id     uuid not null references public.productos (id) on delete restrict,
  cantidad_pedida numeric(10, 2) not null check (cantidad_pedida > 0),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (orden_id, producto_id)
);

create index orden_items_producto_idx on public.orden_items (producto_id);
