-- =====================================================================
-- 009: funciones para el bot de WhatsApp
--
-- El bot usa la clave SECRET (rol service_role) y solo habla con la base a
-- través de estas funciones. Ningún usuario con sesión (conductor o admin)
-- puede llamarlas.
--
--   bot_reservar_mensajes   toma mensajes pendientes y los "reserva" 2 minutos
--                           (así no se envían dos veces; si el bot se cae a la
--                           mitad, el mensaje vuelve a la cola solo)
--   bot_marcar_enviado      el mensaje salió
--   bot_marcar_error        falló: se reintenta (máx. 3 veces) o queda con error
--   bot_registrar_respuesta responde un cliente: guarda 1/2/3 o el texto libre
-- =====================================================================

alter table public.mensajes_whatsapp
  add column reservado_hasta timestamptz,
  add column id_externo text;

comment on column public.mensajes_whatsapp.reservado_hasta is
  'Mientras sea futuro, el bot ya tomó este mensaje y no debe tomarlo otro intento';
comment on column public.mensajes_whatsapp.id_externo is
  'Id del mensaje en WhatsApp (evita guardar dos veces la misma respuesta)';

create unique index mensajes_id_externo_idx
  on public.mensajes_whatsapp (id_externo)
  where id_externo is not null;

-- ---------------------------------------------------------------------
-- Toma hasta p_limite mensajes pendientes (los más antiguos primero)
-- ---------------------------------------------------------------------
create or replace function public.bot_reservar_mensajes(
  p_limite        integer default 1,
  p_max_intentos  integer default 3
)
returns setof public.mensajes_whatsapp
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Los que ya agotaron sus intentos pasan a error
  update public.mensajes_whatsapp m
     set estado = 'error',
         error_detalle = coalesce(m.error_detalle, 'Se agotaron los intentos de envío'),
         reservado_hasta = null
   where m.direccion = 'enviado'
     and m.estado = 'pendiente'
     and m.intentos >= p_max_intentos
     and (m.reservado_hasta is null or m.reservado_hasta < now());

  return query
  with candidatos as (
    select m.id
    from public.mensajes_whatsapp m
    where m.direccion = 'enviado'
      and m.estado = 'pendiente'
      and m.intentos < p_max_intentos
      and (m.reservado_hasta is null or m.reservado_hasta < now())
    order by m.creado_en, m.id
    limit greatest(coalesce(p_limite, 1), 1)
    for update skip locked
  )
  update public.mensajes_whatsapp m
     set reservado_hasta = now() + interval '2 minutes',
         intentos = m.intentos + 1
    from candidatos c
   where m.id = c.id
  returning m.*;
end;
$$;

-- ---------------------------------------------------------------------
-- El mensaje salió
-- ---------------------------------------------------------------------
create or replace function public.bot_marcar_enviado(p_mensaje uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.mensajes_whatsapp
     set estado = 'enviado',
         enviado_en = now(),
         reservado_hasta = null,
         error_detalle = null
   where id = p_mensaje and direccion = 'enviado' and estado = 'pendiente';
end;
$$;

-- ---------------------------------------------------------------------
-- El envío falló. Si es definitivo (por ejemplo, el número no tiene WhatsApp)
-- o ya se usaron todos los intentos, queda con error; si no, se reintenta
-- después de 30 segundos.
-- ---------------------------------------------------------------------
create or replace function public.bot_marcar_error(
  p_mensaje       uuid,
  p_detalle       text,
  p_definitivo    boolean default false,
  p_max_intentos  integer default 3
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.mensajes_whatsapp m
     set error_detalle = left(coalesce(p_detalle, 'Error desconocido'), 500),
         estado = case when p_definitivo or m.intentos >= p_max_intentos
                       then 'error' else m.estado end,
         reservado_hasta = case when p_definitivo or m.intentos >= p_max_intentos
                                then null else now() + interval '30 seconds' end
   where m.id = p_mensaje and m.direccion = 'enviado' and m.estado = 'pendiente';
end;
$$;

-- ---------------------------------------------------------------------
-- Respuesta de un cliente.
--  * Se asocia al último mensaje ENVIADO a ese teléfono cuya ruta siga en curso.
--  * 1 = confirmo, 2 = no habrá nadie, 3 = quiere hablar. Cualquier otro texto
--    queda como "otro" y se guarda tal cual en respuesta_cliente.
--  * Un texto libre posterior NO pisa una confirmación ya dada (solo actualiza
--    el texto que ve el conductor); un número nuevo sí la cambia.
--  * Si no hay ruta en curso (o el teléfono no corresponde), el mensaje se
--    guarda igual como "recibido" sin parada, para no perderlo.
-- Devuelve: parada_id, confirmacion, actualizada, duplicado
-- ---------------------------------------------------------------------
create or replace function public.bot_registrar_respuesta(
  p_telefono   text,
  p_texto      text,
  p_id_externo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_texto          text := left(btrim(coalesce(p_texto, '')), 1000);
  v_parada         uuid;
  v_parada_estado  text;
  v_actual         text;
  v_nueva          text;
  v_actualiza      boolean := false;
begin
  if p_telefono is null or length(btrim(p_telefono)) = 0 or length(v_texto) = 0 then
    raise exception 'Faltan el teléfono o el texto del mensaje';
  end if;

  if p_id_externo is not null
     and exists (select 1 from public.mensajes_whatsapp where id_externo = p_id_externo) then
    return jsonb_build_object('parada_id', null, 'confirmacion', null,
                              'actualizada', false, 'duplicado', true);
  end if;

  select m.parada_id into v_parada
  from public.mensajes_whatsapp m
  join public.paradas p on p.id = m.parada_id
  join public.rutas r on r.id = p.ruta_id
  where m.direccion = 'enviado'
    and m.estado = 'enviado'
    and m.telefono = btrim(p_telefono)
    and r.estado = 'en_curso'
  order by m.enviado_en desc nulls last, m.creado_en desc
  limit 1;

  v_nueva := case
    when v_texto ~ '^\s*1\s*[.!)]*\s*$' then 'confirmo'
    when v_texto ~ '^\s*2\s*[.!)]*\s*$' then 'no_habra_nadie'
    when v_texto ~ '^\s*3\s*[.!)]*\s*$' then 'quiere_hablar'
    else 'otro'
  end;

  if v_parada is not null then
    select estado, confirmacion_cliente into v_parada_estado, v_actual
    from public.paradas where id = v_parada for update;

    if v_parada_estado in ('pendiente', 'fallida_por_reintentar') then
      v_actualiza := true;
      update public.paradas
         set confirmacion_cliente =
               case when v_nueva = 'otro' and v_actual <> 'sin_respuesta'
                    then v_actual else v_nueva end,
             respuesta_cliente = v_texto
       where id = v_parada;
      select confirmacion_cliente into v_actual from public.paradas where id = v_parada;
    end if;
  end if;

  begin
    insert into public.mensajes_whatsapp
      (parada_id, telefono, texto, direccion, estado, id_externo)
    values (v_parada, left(btrim(p_telefono), 60), v_texto, 'recibido', null, p_id_externo);
  exception when unique_violation then
    return jsonb_build_object('parada_id', null, 'confirmacion', null,
                              'actualizada', false, 'duplicado', true);
  end;

  return jsonb_build_object(
    'parada_id', v_parada,
    'confirmacion', case when v_actualiza then v_actual else null end,
    'actualizada', v_actualiza,
    'duplicado', false
  );
end;
$$;

-- Solo el bot (service_role) puede ejecutarlas
revoke execute on function public.bot_reservar_mensajes(integer, integer) from public, anon, authenticated;
revoke execute on function public.bot_marcar_enviado(uuid) from public, anon, authenticated;
revoke execute on function public.bot_marcar_error(uuid, text, boolean, integer) from public, anon, authenticated;
revoke execute on function public.bot_registrar_respuesta(text, text, text) from public, anon, authenticated;

grant execute on function public.bot_reservar_mensajes(integer, integer) to service_role;
grant execute on function public.bot_marcar_enviado(uuid) to service_role;
grant execute on function public.bot_marcar_error(uuid, text, boolean, integer) to service_role;
grant execute on function public.bot_registrar_respuesta(text, text, text) to service_role;
