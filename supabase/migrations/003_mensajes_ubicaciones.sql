-- =====================================================================
-- 003: mensajes_whatsapp (cola del bot) y ubicaciones_conductor
-- =====================================================================

-- ---------------------------------------------------------------------
-- mensajes_whatsapp
--   direccion = 'enviado'  -> mensaje que el bot debe enviar; usa estado
--                             (pendiente / enviado / error)
--   direccion = 'recibido' -> respuesta de un cliente; estado queda en NULL
-- El bot usa la service_role key (se salta las reglas de acceso).
-- ---------------------------------------------------------------------
create table public.mensajes_whatsapp (
  id             uuid primary key default gen_random_uuid(),
  parada_id      uuid references public.paradas (id) on delete restrict,
  telefono       text not null,
  texto          text not null,
  direccion      text not null check (direccion in ('enviado', 'recibido')),
  estado         text check (estado in ('pendiente', 'enviado', 'error')),
  intentos       integer not null default 0 check (intentos >= 0),
  error_detalle  text,
  enviado_en     timestamptz,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint mensajes_estado_segun_direccion
    check ((direccion = 'enviado' and estado is not null)
        or (direccion = 'recibido' and estado is null)),
  -- Los entrantes pueden venir con identificadores que no son teléfonos chilenos
  constraint mensajes_telefono_chileno
    check (direccion = 'recibido' or telefono ~ '^\+569[0-9]{8}$')
);

create index mensajes_pendientes_idx
  on public.mensajes_whatsapp (creado_en)
  where direccion = 'enviado' and estado = 'pendiente';
create index mensajes_parada_idx on public.mensajes_whatsapp (parada_id);

-- ---------------------------------------------------------------------
-- ubicaciones_conductor: solo la ÚLTIMA posición de cada conductor
-- (se sobrescribe; no se guarda historial)
-- ---------------------------------------------------------------------
create table public.ubicaciones_conductor (
  conductor_id   uuid primary key references public.perfiles (id) on delete restrict,
  latitud        numeric(9, 6) not null check (latitud between -90 and 90),
  longitud       numeric(9, 6) not null check (longitud between -180 and 180),
  precision_m    numeric(8, 2) check (precision_m is null or precision_m >= 0),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
