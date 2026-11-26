-- =====================================================================
-- 007: guardar_orden — crea o edita una orden y sus productos en UNA sola
--      transacción (o se guarda todo o no se guarda nada).
--
-- Por qué existe: el panel editaba una orden borrando sus productos y
-- volviéndolos a insertar, pero la base no permite DELETE por la API (por
-- diseño). Esta función reemplaza ese borrado: actualiza las cantidades,
-- agrega los productos nuevos y quita solo los que ya no están.
--
-- Solo el admin puede llamarla. Solo se pueden EDITAR órdenes pendientes
-- (una orden ya asignada o entregada no se modifica).
-- =====================================================================

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
  v_id        uuid;
  v_estado    text;
  v_productos uuid[];
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
    insert into public.ordenes
      (numero_guia, cliente_nombre, cliente_telefono, direccion, comuna,
       latitud, longitud, notas)
    values (
      btrim(p_datos ->> 'numero_guia'),
      btrim(p_datos ->> 'cliente_nombre'),
      p_datos ->> 'cliente_telefono',
      btrim(p_datos ->> 'direccion'),
      coalesce(nullif(btrim(p_datos ->> 'comuna'), ''), 'Temuco'),
      (p_datos ->> 'latitud')::numeric,
      (p_datos ->> 'longitud')::numeric,
      nullif(btrim(coalesce(p_datos ->> 'notas', '')), '')
    )
    returning id into v_id;
  else
    select estado into v_estado from public.ordenes where id = p_orden_id for update;
    if not found then
      raise exception 'La orden no existe' using errcode = 'P0002';
    end if;
    if v_estado <> 'pendiente' then
      raise exception 'Solo se pueden editar órdenes pendientes (esta orden está %)', v_estado;
    end if;

    update public.ordenes
       set numero_guia      = btrim(p_datos ->> 'numero_guia'),
           cliente_nombre   = btrim(p_datos ->> 'cliente_nombre'),
           cliente_telefono = p_datos ->> 'cliente_telefono',
           direccion        = btrim(p_datos ->> 'direccion'),
           comuna           = coalesce(nullif(btrim(p_datos ->> 'comuna'), ''), comuna),
           latitud          = (p_datos ->> 'latitud')::numeric,
           longitud         = (p_datos ->> 'longitud')::numeric,
           notas            = nullif(btrim(coalesce(p_datos ->> 'notas', '')), '')
     where id = p_orden_id;
    v_id := p_orden_id;

    -- Quita solo los productos que ya no están en la lista
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
