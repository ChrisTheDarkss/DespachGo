-- =====================================================================
-- 008: fecha de entrega de cada orden (el día en que debe despacharse)
--
-- La columna ordenes.fecha ya existía (por defecto, el día en que se creaba
-- la orden) pero nada la usaba, y creado_en ya guarda ese dato. Se renombra a
-- fecha_entrega en vez de agregar una columna nueva y repetida.
--
-- Reglas:
--  * Toda orden nueva debe traer fecha de entrega, no anterior a hoy (Santiago).
--  * Al editar una orden pendiente solo se valida la fecha si se cambia.
--  * Es una FECHA PREVISTA, no una restricción: el admin puede asignar la orden
--    a una ruta de otro día; el panel lo advierte.
--  * Las órdenes que vuelven a pendiente (fallidas u omitidas) conservan su
--    fecha anterior y el panel las muestra como "atrasadas" hasta reprogramarlas.
-- =====================================================================

alter table public.ordenes rename column fecha to fecha_entrega;
alter index public.ordenes_fecha_idx rename to ordenes_fecha_entrega_idx;

comment on column public.ordenes.fecha_entrega is
  'Día en que la orden debe entregarse (fecha prevista, hora de Santiago)';

-- ---------------------------------------------------------------------
-- guardar_orden (reemplaza la versión de la 007): ahora exige fecha_entrega
-- ---------------------------------------------------------------------
create or replace function public.guardar_orden(
  p_orden_id uuid,
  p_datos    jsonb,
  p_items    jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id           uuid;
  v_estado       text;
  v_productos    uuid[];
  v_fecha        date;
  v_fecha_actual date;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede guardar órdenes' using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Faltan los datos de la orden';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto';
  end if;

  if length(btrim(coalesce(p_datos ->> 'fecha_entrega', ''))) = 0 then
    raise exception 'La fecha de entrega es obligatoria';
  end if;
  begin
    v_fecha := (p_datos ->> 'fecha_entrega')::date;
  exception when others then
    raise exception 'La fecha de entrega no es válida';
  end;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad numeric)
    where x.producto_id is null or x.cantidad is null or x.cantidad <= 0
  ) then
    raise exception 'Cada producto necesita una cantidad mayor que 0';
  end if;

  if (select count(*) <> count(distinct x.producto_id)
        from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad numeric)) then
    raise exception 'La lista tiene productos repetidos';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad numeric)
    left join public.productos p on p.id = x.producto_id
    where p.id is null or not p.activo
  ) then
    raise exception 'Hay productos que no existen o están inactivos';
  end if;

  select array_agg(x.producto_id) into v_productos
  from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad numeric);

  if p_orden_id is null then
    if v_fecha < public.hoy_santiago() then
      raise exception 'La fecha de entrega no puede ser anterior a hoy';
    end if;

    insert into public.ordenes
      (numero_guia, cliente_nombre, cliente_telefono, direccion, comuna,
       latitud, longitud, notas, fecha_entrega)
    values (
      btrim(p_datos ->> 'numero_guia'),
      btrim(p_datos ->> 'cliente_nombre'),
      p_datos ->> 'cliente_telefono',
      btrim(p_datos ->> 'direccion'),
      coalesce(nullif(btrim(p_datos ->> 'comuna'), ''), 'Temuco'),
      (p_datos ->> 'latitud')::numeric,
      (p_datos ->> 'longitud')::numeric,
      nullif(btrim(coalesce(p_datos ->> 'notas', '')), ''),
      v_fecha
    )
    returning id into v_id;
  else
    select estado, fecha_entrega into v_estado, v_fecha_actual
    from public.ordenes where id = p_orden_id for update;
    if not found then
      raise exception 'La orden no existe' using errcode = 'P0002';
    end if;
    if v_estado <> 'pendiente' then
      raise exception 'Solo se pueden editar órdenes pendientes (esta orden está %)', v_estado;
    end if;
    -- Una orden atrasada se puede seguir editando sin cambiar su fecha
    if v_fecha <> v_fecha_actual and v_fecha < public.hoy_santiago() then
      raise exception 'La fecha de entrega no puede ser anterior a hoy';
    end if;

    update public.ordenes
       set numero_guia      = btrim(p_datos ->> 'numero_guia'),
           cliente_nombre   = btrim(p_datos ->> 'cliente_nombre'),
           cliente_telefono = p_datos ->> 'cliente_telefono',
           direccion        = btrim(p_datos ->> 'direccion'),
           comuna           = coalesce(nullif(btrim(p_datos ->> 'comuna'), ''), comuna),
           latitud          = (p_datos ->> 'latitud')::numeric,
           longitud         = (p_datos ->> 'longitud')::numeric,
           notas            = nullif(btrim(coalesce(p_datos ->> 'notas', '')), ''),
           fecha_entrega    = v_fecha
     where id = p_orden_id;
    v_id := p_orden_id;

    begin
      delete from public.orden_items
       where orden_id = v_id and not (producto_id = any (v_productos));
    exception when foreign_key_violation then
      raise exception 'No se puede quitar un producto que ya tiene entregas registradas';
    end;
  end if;

  insert into public.orden_items (orden_id, producto_id, cantidad_pedida)
  select v_id, x.producto_id, x.cantidad
  from jsonb_to_recordset(p_items) as x(producto_id uuid, cantidad numeric)
  on conflict (orden_id, producto_id)
  do update set cantidad_pedida = excluded.cantidad_pedida;

  return v_id;
end;
$$;

revoke execute on function public.guardar_orden(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_orden(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- reprogramar_orden: devuelve una orden fallida a pendiente con NUEVA fecha
-- de entrega (así no queda "atrasada" para siempre)
-- ---------------------------------------------------------------------
create or replace function public.reprogramar_orden(p_orden uuid, p_fecha date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede reprogramar órdenes' using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha < public.hoy_santiago() then
    raise exception 'La nueva fecha de entrega no puede ser anterior a hoy';
  end if;

  select estado into v_estado from public.ordenes where id = p_orden for update;
  if not found then
    raise exception 'La orden no existe' using errcode = 'P0002';
  end if;
  if v_estado not in ('fallida', 'pendiente') then
    raise exception 'Solo se pueden reprogramar órdenes fallidas o pendientes (esta orden está %)', v_estado;
  end if;

  update public.ordenes
     set estado = 'pendiente', fecha_entrega = p_fecha
   where id = p_orden;
end;
$$;

revoke execute on function public.reprogramar_orden(uuid, date) from public, anon;
grant execute on function public.reprogramar_orden(uuid, date) to authenticated;
