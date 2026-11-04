-- =====================================================================
-- 005: funciones de ruta y entrega (la app llama a estas funciones con
--      supabase.rpc; no modifica los estados directamente en las tablas)
--
--  Admin     : asignar_ruta
--  Conductor : iniciar_ruta, reordenar_paradas, omitir_parada,
--              registrar_entrega, registrar_entrega_fallida,
--              reintentar_parada, finalizar_ruta
--  Internas  : crear_mensaje_parada, obtener_ruta_del_conductor,
--              obtener_parada_del_conductor, cerrar_ruta,
--              cerrar_rutas_vencidas (esta última la llama pg_cron, ver 006)
--
-- Todas validan quién llama y en qué estado está lo que se modifica.
-- Cada llamada es una transacción: o se hace todo o no se hace nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- configuracion: textos y datos editables sin tocar código
-- ---------------------------------------------------------------------
create table public.configuracion (
  clave          text primary key check (length(btrim(clave)) > 0),
  valor          text not null,
  descripcion    text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

insert into public.configuracion (clave, valor, descripcion) values
  ('nombre_negocio', '[Negocio]',
   'Nombre del negocio que aparece en el WhatsApp. CAMBIAR antes de usar con clientes.'),
  ('mensaje_una_guia',
   'Hola {nombre}, soy {negocio}. Tu pedido va en camino. ¿Habrá alguien para recibirlo? Responde 1 = Sí, 2 = No, 3 = Hablar con alguien.',
   'Mensaje cuando la parada tiene una sola guía. Variables: {nombre}, {negocio}'),
  ('mensaje_varias_guias',
   'Hola {nombre}, soy {negocio}. Tus pedidos (guías {guias}) van en camino. ¿Habrá alguien para recibirlos? Responde 1 = Sí, 2 = No, 3 = Hablar con alguien.',
   'Mensaje cuando la parada agrupa varias guías. Variables: {nombre}, {negocio}, {guias}')
on conflict (clave) do nothing;

create trigger trg_configuracion_actualizado_en
  before update on public.configuracion
  for each row execute function public.set_actualizado_en();

alter table public.configuracion enable row level security;

create policy configuracion_admin_ver on public.configuracion
  for select to authenticated using (public.es_admin());
create policy configuracion_admin_crear on public.configuracion
  for insert to authenticated with check (public.es_admin());
create policy configuracion_admin_editar on public.configuracion
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

revoke all on public.configuracion from anon;
revoke delete, truncate, references, trigger on public.configuracion from authenticated;
grant select, insert, update on public.configuracion to authenticated;
grant all on public.configuracion to service_role;

-- ---------------------------------------------------------------------
-- Vista: entregas completas o parciales que todavía no tienen foto
-- (la app exige la foto, pero puede subirse después si no había señal)
-- ---------------------------------------------------------------------
create view public.entregas_sin_foto
with (security_invoker = true) as
select e.id as entrega_id, e.parada_id, e.resultado, e.creado_en
from public.entregas e
where e.resultado in ('entregada', 'parcial')
  and not exists (select 1 from public.entrega_fotos f where f.entrega_id = e.id);

revoke all on public.entregas_sin_foto from anon;
grant select on public.entregas_sin_foto to authenticated;

-- =====================================================================
-- FUNCIONES INTERNAS
-- =====================================================================

-- Crea el mensaje de WhatsApp de una parada (una sola vez por parada)
create or replace function public.crear_mensaje_parada(p_parada uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre    text;
  v_telefono  text;
  v_guias     text;
  v_n         integer;
  v_negocio   text;
  v_plantilla text;
  v_texto     text;
begin
  if exists (
    select 1 from public.mensajes_whatsapp
    where parada_id = p_parada and direccion = 'enviado'
  ) then
    return false;
  end if;

  select split_part(btrim(min(o.cliente_nombre)), ' ', 1),
         min(o.cliente_telefono),
         string_agg(o.numero_guia, ', ' order by o.numero_guia),
         count(*)
    into v_nombre, v_telefono, v_guias, v_n
  from public.parada_ordenes po
  join public.ordenes o on o.id = po.orden_id
  where po.parada_id = p_parada;

  if v_n = 0 or v_telefono is null then
    return false;
  end if;

  select valor into v_negocio
  from public.configuracion where clave = 'nombre_negocio';

  select valor into v_plantilla
  from public.configuracion
  where clave = case when v_n > 1 then 'mensaje_varias_guias' else 'mensaje_una_guia' end;

  v_plantilla := coalesce(
    v_plantilla,
    'Hola {nombre}, soy {negocio}. Tu pedido va en camino. ¿Habrá alguien para recibirlo? Responde 1 = Sí, 2 = No, 3 = Hablar con alguien.'
  );

  v_texto := replace(replace(replace(v_plantilla,
      '{nombre}', coalesce(nullif(v_nombre, ''), 'cliente')),
      '{negocio}', coalesce(v_negocio, '')),
      '{guias}', coalesce(v_guias, ''));

  insert into public.mensajes_whatsapp (parada_id, telefono, texto, direccion, estado)
  values (p_parada, v_telefono, v_texto, 'enviado', 'pendiente');

  return true;
end;
$$;

-- Bloquea la ruta y comprueba que el usuario es su conductor (o admin) y
-- que está en uno de los estados permitidos
create or replace function public.obtener_ruta_del_conductor(
  p_ruta uuid,
  p_estados text[],
  p_permitir_admin boolean default false
)
returns public.rutas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ruta public.rutas;
begin
  select * into v_ruta from public.rutas where id = p_ruta for update;
  if not found then
    raise exception 'La ruta no existe' using errcode = 'P0002';
  end if;

  if not ((v_ruta.conductor_id = auth.uid() and public.es_conductor())
          or (p_permitir_admin and public.es_admin())) then
    raise exception 'No tienes permiso sobre esta ruta' using errcode = '42501';
  end if;

  if not (v_ruta.estado = any (p_estados)) then
    raise exception 'La ruta está en estado %, y esta acción requiere: %',
      v_ruta.estado, array_to_string(p_estados, ', ');
  end if;

  return v_ruta;
end;
$$;

-- Bloquea la parada y comprueba permisos y estados (ruta y parada)
create or replace function public.obtener_parada_del_conductor(
  p_parada uuid,
  p_estados_ruta text[],
  p_estados_parada text[] default null
)
returns public.paradas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parada public.paradas;
begin
  select * into v_parada from public.paradas where id = p_parada for update;
  if not found then
    raise exception 'La parada no existe' using errcode = 'P0002';
  end if;

  perform public.obtener_ruta_del_conductor(v_parada.ruta_id, p_estados_ruta);

  if p_estados_parada is not null and not (v_parada.estado = any (p_estados_parada)) then
    raise exception 'La parada está en estado %, y esta acción requiere: %',
      v_parada.estado, array_to_string(p_estados_parada, ', ');
  end if;

  return v_parada;
end;
$$;

-- Cierra una ruta aplicando las reglas de negocio. La usan finalizar_ruta
-- (conductor o admin) y cerrar_rutas_vencidas (pg_cron):
--   * paradas sin visitar            -> omitida; sus órdenes vuelven a pendiente
--   * paradas omitidas               -> sus órdenes vuelven a pendiente
--   * paradas fallidas por reintentar-> fallida; sus órdenes pasan a fallida
--   * mensajes de WhatsApp aún sin enviar -> se marcan con error (ya no aplican)
create or replace function public.cerrar_ruta(p_ruta uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sin_visitar integer;
  v_fallidas    integer;
  v_omitidas    integer;
  v_entregadas  integer;
  v_parciales   integer;
  v_sin_foto    integer;
begin
  with u as (
    update public.paradas
       set estado = 'omitida',
           motivo_omision = 'otro',
           comentario_omision = 'Ruta cerrada sin visitar esta parada'
     where ruta_id = p_ruta and estado = 'pendiente'
    returning id
  )
  select count(*) into v_sin_visitar from u;

  update public.ordenes
     set estado = 'pendiente'
   where estado in ('asignada', 'en_ruta')
     and id in (select po.orden_id
                from public.parada_ordenes po
                join public.paradas p on p.id = po.parada_id
                where p.ruta_id = p_ruta and p.estado = 'omitida');

  with f as (
    update public.paradas set estado = 'fallida'
     where ruta_id = p_ruta and estado = 'fallida_por_reintentar'
    returning id
  )
  select count(*) into v_fallidas from f;

  update public.ordenes
     set estado = 'fallida'
   where estado in ('asignada', 'en_ruta')
     and id in (select po.orden_id
                from public.parada_ordenes po
                join public.paradas p on p.id = po.parada_id
                where p.ruta_id = p_ruta and p.estado = 'fallida');

  update public.mensajes_whatsapp
     set estado = 'error',
         error_detalle = 'La ruta se cerró antes de enviar este mensaje'
   where direccion = 'enviado' and estado = 'pendiente'
     and parada_id in (select id from public.paradas where ruta_id = p_ruta);

  update public.rutas
     set estado = 'finalizada', finalizada_en = now()
   where id = p_ruta;

  select count(*) filter (where estado = 'entregada'),
         count(*) filter (where estado = 'parcial'),
         count(*) filter (where estado = 'omitida')
    into v_entregadas, v_parciales, v_omitidas
  from public.paradas where ruta_id = p_ruta;

  select count(*) into v_sin_foto
  from public.entregas e
  join public.paradas p on p.id = e.parada_id
  where p.ruta_id = p_ruta
    and e.resultado in ('entregada', 'parcial')
    and not exists (select 1 from public.entrega_fotos f where f.entrega_id = e.id);

  return jsonb_build_object(
    'ruta_id', p_ruta,
    'entregadas', v_entregadas,
    'parciales', v_parciales,
    'fallidas', v_fallidas,
    'omitidas', v_omitidas,
    'sin_visitar', v_sin_visitar,
    'entregas_sin_foto', v_sin_foto
  );
end;
$$;

-- Cierra las rutas de días anteriores que quedaron abiertas.
-- Rutas en curso: misma regla que "Finalizar ruta".
-- Rutas asignadas que nunca se iniciaron: sus órdenes vuelven a pendiente.
-- La llama pg_cron (migración 006); compara con la fecha de Santiago, así que
-- no importa si Chile está en horario de verano o de invierno.
create or replace function public.cerrar_rutas_vencidas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_n  integer := 0;
begin
  for v_id in
    select id from public.rutas
    where estado in ('asignada', 'en_curso') and fecha < public.hoy_santiago()
    order by fecha, id
  loop
    perform public.cerrar_ruta(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- =====================================================================
-- FUNCIONES QUE USA LA APP
-- =====================================================================

-- ADMIN: crea (o completa) la ruta de un conductor para una fecha.
-- p_ordenes: ids de órdenes PENDIENTES, en el orden sugerido (el optimizado).
-- Con p_agrupar, las órdenes del mismo teléfono y dirección forman una sola
-- parada con varias guías.
-- Si la ruta ya está en curso, solo agrega paradas al final y crea sus mensajes.
create or replace function public.asignar_ruta(
  p_conductor uuid,
  p_fecha     date,
  p_ordenes   uuid[],
  p_agrupar   boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ruta         public.rutas;
  v_validas      uuid[];
  v_pos          integer;
  v_parada       uuid;
  v_mapa         jsonb := '{}'::jsonb;
  v_clave        text;
  v_nuevas       uuid[] := '{}';
  v_estado_orden text;
  r              record;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede asignar rutas' using errcode = '42501';
  end if;
  if p_ordenes is null or cardinality(p_ordenes) = 0 then
    raise exception 'Debes indicar al menos una orden';
  end if;
  if (select count(distinct x) from unnest(p_ordenes) as x) <> cardinality(p_ordenes) then
    raise exception 'La lista de órdenes tiene órdenes repetidas';
  end if;
  if not exists (
    select 1 from public.perfiles where id = p_conductor and rol = 'conductor' and activo
  ) then
    raise exception 'El conductor no existe o está inactivo';
  end if;
  if p_fecha is null or p_fecha < public.hoy_santiago() then
    raise exception 'La fecha no puede ser anterior a hoy';
  end if;

  select array_agg(id) into v_validas
  from (
    select id from public.ordenes
    where id = any (p_ordenes) and estado = 'pendiente'
    order by id
    for update
  ) s;
  if coalesce(cardinality(v_validas), 0) <> cardinality(p_ordenes) then
    raise exception 'Todas las órdenes deben existir y estar en estado pendiente';
  end if;

  select * into v_ruta
  from public.rutas where conductor_id = p_conductor and fecha = p_fecha for update;

  if not found then
    insert into public.rutas (conductor_id, fecha, estado, creado_por)
    values (p_conductor, p_fecha, 'asignada', auth.uid())
    returning * into v_ruta;
  elsif v_ruta.estado = 'finalizada' then
    raise exception 'La ruta de ese conductor para esa fecha ya fue finalizada';
  end if;

  select coalesce(max(posicion_final), 0) into v_pos
  from public.paradas where ruta_id = v_ruta.id;

  v_estado_orden := case when v_ruta.estado = 'en_curso' then 'en_ruta' else 'asignada' end;

  for r in
    select o.id,
           o.cliente_telefono,
           lower(btrim(o.direccion)) as dir,
           u.ord
    from unnest(p_ordenes) with ordinality as u(id, ord)
    join public.ordenes o on o.id = u.id
    order by u.ord
  loop
    v_clave := r.cliente_telefono || '|' || r.dir;

    if p_agrupar and (v_mapa ->> v_clave) is not null then
      v_parada := (v_mapa ->> v_clave)::uuid;
    else
      v_pos := v_pos + 1;
      insert into public.paradas (ruta_id, posicion_sugerida, posicion_final)
      values (v_ruta.id, v_pos, v_pos)
      returning id into v_parada;
      v_nuevas := v_nuevas || v_parada;
      if p_agrupar then
        v_mapa := v_mapa || jsonb_build_object(v_clave, v_parada);
      end if;
    end if;

    insert into public.parada_ordenes (parada_id, orden_id) values (v_parada, r.id);
  end loop;

  update public.ordenes set estado = v_estado_orden where id = any (p_ordenes);

  if v_ruta.estado = 'borrador' then
    update public.rutas set estado = 'asignada' where id = v_ruta.id;
  end if;

  if v_ruta.estado = 'en_curso' then
    foreach v_parada in array v_nuevas loop
      perform public.crear_mensaje_parada(v_parada);
    end loop;
  end if;

  return v_ruta.id;
end;
$$;

-- CONDUCTOR: inicia su ruta. Pasa las órdenes a "en ruta" y crea un mensaje
-- de WhatsApp por parada (el bot los envía). Devuelve cuántos mensajes creó.
create or replace function public.iniciar_ruta(p_ruta uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ruta   public.rutas;
  v_parada uuid;
  v_n      integer := 0;
begin
  v_ruta := public.obtener_ruta_del_conductor(p_ruta, array['asignada']);

  if v_ruta.fecha > public.hoy_santiago() then
    raise exception 'Esta ruta es para el %, todavía no puede iniciarse', v_ruta.fecha;
  end if;
  if not exists (select 1 from public.paradas where ruta_id = p_ruta) then
    raise exception 'La ruta no tiene paradas';
  end if;

  update public.rutas set estado = 'en_curso', iniciada_en = now() where id = p_ruta;

  update public.ordenes
     set estado = 'en_ruta'
   where estado = 'asignada'
     and id in (select po.orden_id
                from public.parada_ordenes po
                join public.paradas p on p.id = po.parada_id
                where p.ruta_id = p_ruta);

  for v_parada in
    select id from public.paradas
    where ruta_id = p_ruta and estado = 'pendiente'
    order by posicion_final
  loop
    if public.crear_mensaje_parada(v_parada) then
      v_n := v_n + 1;
    end if;
  end loop;

  return v_n;
end;
$$;

-- CONDUCTOR: guarda el orden que eligió. p_paradas debe traer TODAS las
-- paradas de la ruta, en el nuevo orden. El orden sugerido no se modifica.
create or replace function public.reordenar_paradas(p_ruta uuid, p_paradas uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ruta  public.rutas;
  v_total integer;
begin
  v_ruta := public.obtener_ruta_del_conductor(p_ruta, array['asignada', 'en_curso']);

  select count(*) into v_total from public.paradas where ruta_id = p_ruta;

  if p_paradas is null
     or cardinality(p_paradas) <> v_total
     or (select count(distinct x) from unnest(p_paradas) as x) <> v_total
     or exists (
       select 1 from unnest(p_paradas) as x
       where not exists (select 1 from public.paradas p where p.id = x and p.ruta_id = p_ruta)
     )
  then
    raise exception 'Debes enviar todas las paradas de la ruta, sin repetir ni incluir paradas ajenas';
  end if;

  update public.paradas p
     set posicion_final = u.ord
    from unnest(p_paradas) with ordinality as u(id, ord)
   where p.id = u.id;
end;
$$;

-- CONDUCTOR: omite una parada pendiente (calle cerrada, accidente, etc.)
create or replace function public.omitir_parada(
  p_parada     uuid,
  p_motivo     text,
  p_comentario text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parada public.paradas;
begin
  v_parada := public.obtener_parada_del_conductor(p_parada, array['en_curso'], array['pendiente']);

  if p_motivo is null or p_motivo not in ('calle_cerrada', 'accidente', 'cliente_ausente', 'otro') then
    raise exception 'Motivo de omisión no válido';
  end if;
  if p_motivo = 'otro' and length(btrim(coalesce(p_comentario, ''))) = 0 then
    raise exception 'Con el motivo otro debes escribir un comentario';
  end if;

  update public.paradas
     set estado = 'omitida', motivo_omision = p_motivo, comentario_omision = p_comentario
   where id = p_parada;
end;
$$;

-- CONDUCTOR: registra una entrega. p_items debe traer TODOS los productos de
-- la parada:  [{"orden_item_id": "...", "cantidad_entregada": 3, "motivo": "faltante"}, ...]
-- El resultado se calcula solo: todo completo = entregada; algo = parcial;
-- nada = fallida (en ese caso hay que indicar p_motivo).
-- p_entrega_id (opcional): id generado por la app; si se repite la llamada con
-- el mismo id (doble toque, reintento sin señal) NO se duplica la entrega.
-- Las fotos se suben después, con el id que devuelve esta función.
create or replace function public.registrar_entrega(
  p_parada       uuid,
  p_items        jsonb,
  p_motivo       text    default null,
  p_comentario   text    default null,
  p_recibido_por text    default null,
  p_latitud      numeric default null,
  p_longitud     numeric default null,
  p_entrega_id   uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parada       public.paradas;
  v_existente    public.entregas;
  v_entrega_id   uuid;
  v_n_items      integer;
  v_n_completos  integer;
  v_n_con_algo   integer;
  v_resultado    text;
  v_estado_parada text;
begin
  v_parada := public.obtener_parada_del_conductor(p_parada, array['en_curso']);

  if p_entrega_id is not null then
    select * into v_existente from public.entregas where id = p_entrega_id;
    if found then
      if v_existente.parada_id <> p_parada then
        raise exception 'Ese identificador de entrega ya se usó en otra parada';
      end if;
      return jsonb_build_object(
        'entrega_id', v_existente.id,
        'resultado', v_existente.resultado,
        'parada_estado', v_parada.estado,
        'requiere_foto', v_existente.resultado in ('entregada', 'parcial'),
        'repetida', true
      );
    end if;
  end if;

  if v_parada.estado <> 'pendiente' then
    raise exception 'La parada está en estado %, solo se puede registrar una entrega en una parada pendiente',
      v_parada.estado;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debes enviar la lista de productos (items)';
  end if;

  if (select count(*) <> count(distinct x.orden_item_id)
        from jsonb_to_recordset(p_items)
             as x(orden_item_id uuid, cantidad_entregada numeric, motivo text)) then
    raise exception 'La lista de productos tiene productos repetidos';
  end if;

  if exists (
    select 1
    from public.orden_items oi
    join public.parada_ordenes po on po.orden_id = oi.orden_id
    where po.parada_id = p_parada
      and not exists (
        select 1 from jsonb_to_recordset(p_items)
               as x(orden_item_id uuid, cantidad_entregada numeric, motivo text)
        where x.orden_item_id = oi.id)
  ) then
    raise exception 'Faltan productos: debes enviar todos los productos de la parada';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
         as x(orden_item_id uuid, cantidad_entregada numeric, motivo text)
    where not exists (
      select 1
      from public.orden_items oi
      join public.parada_ordenes po on po.orden_id = oi.orden_id
      where po.parada_id = p_parada and oi.id = x.orden_item_id)
  ) then
    raise exception 'La lista incluye productos que no pertenecen a esta parada';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
         as x(orden_item_id uuid, cantidad_entregada numeric, motivo text)
    join public.orden_items oi on oi.id = x.orden_item_id
    where x.cantidad_entregada is null
       or x.cantidad_entregada < 0
       or x.cantidad_entregada > oi.cantidad_pedida
  ) then
    raise exception 'Hay cantidades entregadas inválidas (negativas o mayores a lo pedido)';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
         as x(orden_item_id uuid, cantidad_entregada numeric, motivo text)
    join public.orden_items oi on oi.id = x.orden_item_id
    where x.cantidad_entregada < oi.cantidad_pedida
      and (x.motivo is null
           or x.motivo not in ('faltante', 'danado', 'rechazado_por_cliente', 'otro'))
  ) then
    raise exception 'Cada producto con diferencia necesita un motivo válido';
  end if;

  select count(*),
         count(*) filter (where x.cantidad_entregada = oi.cantidad_pedida),
         count(*) filter (where x.cantidad_entregada > 0)
    into v_n_items, v_n_completos, v_n_con_algo
  from jsonb_to_recordset(p_items)
       as x(orden_item_id uuid, cantidad_entregada numeric, motivo text)
  join public.orden_items oi on oi.id = x.orden_item_id;

  v_resultado := case
    when v_n_completos = v_n_items then 'entregada'
    when v_n_con_algo = 0          then 'fallida'
    else 'parcial'
  end;

  if v_resultado = 'fallida'
     and (p_motivo is null
          or p_motivo not in ('cliente_ausente', 'direccion_incorrecta', 'rechazo',
                              'problema_vehiculo_transito', 'otro')) then
    raise exception 'No se entregó ningún producto: indica el motivo de la falla';
  end if;

  insert into public.entregas
    (id, parada_id, resultado, motivo, comentario, recibido_por, latitud, longitud, creado_por)
  values (
    coalesce(p_entrega_id, gen_random_uuid()),
    p_parada,
    v_resultado,
    case when v_resultado = 'fallida' then p_motivo end,
    p_comentario,
    nullif(btrim(coalesce(p_recibido_por, '')), ''),
    p_latitud,
    p_longitud,
    auth.uid()
  )
  returning id into v_entrega_id;

  insert into public.entrega_items (entrega_id, orden_item_id, cantidad_entregada, motivo)
  select v_entrega_id,
         x.orden_item_id,
         x.cantidad_entregada,
         case when x.cantidad_entregada < oi.cantidad_pedida then x.motivo end
  from jsonb_to_recordset(p_items)
       as x(orden_item_id uuid, cantidad_entregada numeric, motivo text)
  join public.orden_items oi on oi.id = x.orden_item_id;

  v_estado_parada := case v_resultado
    when 'entregada' then 'entregada'
    when 'parcial'   then 'parcial'
    else 'fallida_por_reintentar'
  end;

  update public.paradas set estado = v_estado_parada where id = p_parada;

  -- Estado de cada orden de la parada (si todo falló, siguen "en ruta" hasta
  -- que el conductor reintente o finalice la ruta)
  if v_resultado <> 'fallida' then
    update public.ordenes o
       set estado = s.nuevo
      from (
        select oi.orden_id,
               case
                 when bool_and(x.cantidad_entregada = oi.cantidad_pedida) then 'entregada'
                 when bool_or(x.cantidad_entregada > 0)                   then 'entregada_parcial'
                 else 'fallida'
               end as nuevo
        from jsonb_to_recordset(p_items)
             as x(orden_item_id uuid, cantidad_entregada numeric, motivo text)
        join public.orden_items oi on oi.id = x.orden_item_id
        group by oi.orden_id
      ) s
     where o.id = s.orden_id;
  end if;

  return jsonb_build_object(
    'entrega_id', v_entrega_id,
    'resultado', v_resultado,
    'parada_estado', v_estado_parada,
    'requiere_foto', v_resultado in ('entregada', 'parcial')
  );
end;
$$;

-- CONDUCTOR: registra una entrega fallida (cliente ausente, dirección
-- incorrecta, problema del vehículo o del tránsito...). La foto es opcional.
create or replace function public.registrar_entrega_fallida(
  p_parada     uuid,
  p_motivo     text,
  p_comentario text    default null,
  p_latitud    numeric default null,
  p_longitud   numeric default null,
  p_entrega_id uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parada    public.paradas;
  v_existente public.entregas;
  v_entrega_id uuid;
begin
  v_parada := public.obtener_parada_del_conductor(p_parada, array['en_curso']);

  if p_entrega_id is not null then
    select * into v_existente from public.entregas where id = p_entrega_id;
    if found then
      if v_existente.parada_id <> p_parada then
        raise exception 'Ese identificador de entrega ya se usó en otra parada';
      end if;
      return jsonb_build_object(
        'entrega_id', v_existente.id,
        'resultado', v_existente.resultado,
        'parada_estado', v_parada.estado,
        'requiere_foto', false,
        'repetida', true
      );
    end if;
  end if;

  if v_parada.estado <> 'pendiente' then
    raise exception 'La parada está en estado %, solo se puede registrar una entrega en una parada pendiente',
      v_parada.estado;
  end if;

  if p_motivo is null
     or p_motivo not in ('cliente_ausente', 'direccion_incorrecta', 'rechazo',
                         'problema_vehiculo_transito', 'otro') then
    raise exception 'Motivo de falla no válido';
  end if;
  if p_motivo = 'otro' and length(btrim(coalesce(p_comentario, ''))) = 0 then
    raise exception 'Con el motivo otro debes escribir un comentario';
  end if;

  insert into public.entregas
    (id, parada_id, resultado, motivo, comentario, latitud, longitud, creado_por)
  values (
    coalesce(p_entrega_id, gen_random_uuid()),
    p_parada, 'fallida', p_motivo, p_comentario, p_latitud, p_longitud, auth.uid()
  )
  returning id into v_entrega_id;

  update public.paradas set estado = 'fallida_por_reintentar' where id = p_parada;

  return jsonb_build_object(
    'entrega_id', v_entrega_id,
    'resultado', 'fallida',
    'parada_estado', 'fallida_por_reintentar',
    'requiere_foto', false
  );
end;
$$;

-- CONDUCTOR: vuelve a intentar una parada que falló (el historial se conserva)
create or replace function public.reintentar_parada(p_parada uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parada public.paradas;
begin
  v_parada := public.obtener_parada_del_conductor(
    p_parada, array['en_curso'], array['fallida_por_reintentar']);
  update public.paradas set estado = 'pendiente' where id = p_parada;
end;
$$;

-- CONDUCTOR (o admin): finaliza la ruta aplicando las reglas de cierre.
-- Devuelve un resumen con los conteos.
create or replace function public.finalizar_ruta(p_ruta uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ruta public.rutas;
begin
  v_ruta := public.obtener_ruta_del_conductor(p_ruta, array['en_curso'], true);
  return public.cerrar_ruta(p_ruta);
end;
$$;

-- =====================================================================
-- PERMISOS DE EJECUCIÓN
-- Supabase concede EXECUTE a todos por defecto: se quita explícitamente.
-- =====================================================================

-- Internas: nadie las llama desde la app
revoke execute on function public.crear_mensaje_parada(uuid) from public, anon, authenticated;
revoke execute on function public.obtener_ruta_del_conductor(uuid, text[], boolean) from public, anon, authenticated;
revoke execute on function public.obtener_parada_del_conductor(uuid, text[], text[]) from public, anon, authenticated;
revoke execute on function public.cerrar_ruta(uuid) from public, anon, authenticated;
revoke execute on function public.cerrar_rutas_vencidas() from public, anon, authenticated;

-- Las que usa la app: solo con sesión iniciada (cada una valida el rol por dentro)
revoke execute on function public.asignar_ruta(uuid, date, uuid[], boolean) from public, anon;
revoke execute on function public.iniciar_ruta(uuid) from public, anon;
revoke execute on function public.reordenar_paradas(uuid, uuid[]) from public, anon;
revoke execute on function public.omitir_parada(uuid, text, text) from public, anon;
revoke execute on function public.registrar_entrega(uuid, jsonb, text, text, text, numeric, numeric, uuid) from public, anon;
revoke execute on function public.registrar_entrega_fallida(uuid, text, text, numeric, numeric, uuid) from public, anon;
revoke execute on function public.reintentar_parada(uuid) from public, anon;
revoke execute on function public.finalizar_ruta(uuid) from public, anon;

grant execute on function public.asignar_ruta(uuid, date, uuid[], boolean) to authenticated;
grant execute on function public.iniciar_ruta(uuid) to authenticated;
grant execute on function public.reordenar_paradas(uuid, uuid[]) to authenticated;
grant execute on function public.omitir_parada(uuid, text, text) to authenticated;
grant execute on function public.registrar_entrega(uuid, jsonb, text, text, text, numeric, numeric, uuid) to authenticated;
grant execute on function public.registrar_entrega_fallida(uuid, text, text, numeric, numeric, uuid) to authenticated;
grant execute on function public.reintentar_parada(uuid) to authenticated;
grant execute on function public.finalizar_ruta(uuid) to authenticated;
