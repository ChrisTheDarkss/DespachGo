-- =====================================================================
-- guardar_orden_prueba.sql: comprueba crear y editar órdenes con la función
-- Requisitos: migraciones 001-008, seed.sql y seed_usuarios.sql.
-- Termina con "GUARDAR_ORDEN OK" o con "FALLO: ...". Termina en ROLLBACK.
-- =====================================================================
begin;

do $$
declare
  v_admin uuid;
  c1      uuid;
  pr1 uuid; pr2 uuid; pr3 uuid;
  v_id    uuid;
  n       integer;
  v_fallo boolean;
  v_datos jsonb := jsonb_build_object(
    'numero_guia', 'T-0001', 'cliente_nombre', 'Cliente Test',
    'cliente_telefono', '+56911112222', 'direccion', 'Av. Alemania 0671',
    'notas', null, 'latitud', -38.7396, 'longitud', -72.5905,
    'fecha_entrega', public.hoy_santiago() + 1);
begin
  select p.id into v_admin from public.perfiles p join auth.users u on u.id = p.id
    where u.email = 'admin@despachgo.test';
  select p.id into c1 from public.perfiles p join auth.users u on u.id = p.id
    where u.email = 'conductor1@despachgo.test';
  select id into pr1 from public.productos where nombre = 'Producto de ejemplo 01';
  select id into pr2 from public.productos where nombre = 'Producto de ejemplo 02';
  select id into pr3 from public.productos where nombre = 'Producto de ejemplo 03';
  if v_admin is null or c1 is null or pr1 is null or pr2 is null or pr3 is null then
    raise exception 'FALLO: faltan datos. Ejecutar seed.sql y seed_usuarios.sql';
  end if;

  -- Un conductor NO puede guardar órdenes
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c1::text, true);
  set local role authenticated;
  v_fallo := false;
  begin
    perform public.guardar_orden(null, v_datos,
      jsonb_build_array(jsonb_build_object('producto_id', pr1, 'cantidad', 1)));
    v_fallo := true;
  exception when insufficient_privilege then
    null;
  end;
  assert not v_fallo, 'FALLO: un conductor pudo guardar una orden';
  reset role;

  -- Admin: crear
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;

  v_id := public.guardar_orden(null, v_datos, jsonb_build_array(
    jsonb_build_object('producto_id', pr1, 'cantidad', 2),
    jsonb_build_object('producto_id', pr2, 'cantidad', 3)));
  assert v_id is not null, 'FALLO: no devolvió el id de la orden';

  -- Guía duplicada
  v_fallo := false;
  begin
    perform public.guardar_orden(null, v_datos, jsonb_build_array(
      jsonb_build_object('producto_id', pr1, 'cantidad', 1)));
    v_fallo := true;
  exception when unique_violation then
    null;
  end;
  assert not v_fallo, 'FALLO: se aceptó una guía duplicada';

  -- Editar: cambia cantidad de pr1, quita pr2, agrega pr3
  perform public.guardar_orden(
    v_id,
    v_datos || jsonb_build_object('cliente_nombre', 'Cliente Editado'),
    jsonb_build_array(
      jsonb_build_object('producto_id', pr1, 'cantidad', 5),
      jsonb_build_object('producto_id', pr3, 'cantidad', 1)));
  reset role;

  assert (select cliente_nombre from public.ordenes where id = v_id) = 'Cliente Editado',
    'FALLO: no se actualizó el cliente';
  select count(*) into n from public.orden_items where orden_id = v_id;
  assert n = 2, 'FALLO: la orden debía tener 2 productos y tiene ' || n;
  assert (select cantidad_pedida from public.orden_items where orden_id = v_id and producto_id = pr1) = 5,
    'FALLO: no se actualizó la cantidad de pr1';
  select count(*) into n from public.orden_items where orden_id = v_id and producto_id = pr2;
  assert n = 0, 'FALLO: el producto quitado sigue en la orden';

  -- No se edita una orden que ya no está pendiente
  update public.ordenes set estado = 'asignada' where id = v_id;
  set local role authenticated;
  v_fallo := false;
  begin
    perform public.guardar_orden(v_id, v_datos, jsonb_build_array(
      jsonb_build_object('producto_id', pr1, 'cantidad', 1)));
    v_fallo := true;
  exception when others then
    null;
  end;
  assert not v_fallo, 'FALLO: se editó una orden que ya no estaba pendiente';
  reset role;

  -- Fecha de entrega: obligatoria y no anterior a hoy
  set local role authenticated;
  v_fallo := false;
  begin
    perform public.guardar_orden(null,
      (v_datos - 'fecha_entrega') || jsonb_build_object('numero_guia', 'T-0002'),
      jsonb_build_array(jsonb_build_object('producto_id', pr1, 'cantidad', 1)));
    v_fallo := true;
  exception when others then
    null;
  end;
  assert not v_fallo, 'FALLO: se aceptó una orden sin fecha de entrega';

  v_fallo := false;
  begin
    perform public.guardar_orden(null,
      v_datos || jsonb_build_object('numero_guia', 'T-0003',
                                    'fecha_entrega', (public.hoy_santiago() - 1)::text),
      jsonb_build_array(jsonb_build_object('producto_id', pr1, 'cantidad', 1)));
    v_fallo := true;
  exception when others then
    null;
  end;
  assert not v_fallo, 'FALLO: se aceptó una fecha de entrega anterior a hoy';
  reset role;

  -- Reprogramar: una orden fallida vuelve a pendiente con nueva fecha
  update public.ordenes set estado = 'fallida' where id = v_id;
  set local role authenticated;

  v_fallo := false;
  begin
    perform public.reprogramar_orden(v_id, public.hoy_santiago() - 1);
    v_fallo := true;
  exception when others then
    null;
  end;
  assert not v_fallo, 'FALLO: se reprogramó con una fecha pasada';

  perform public.reprogramar_orden(v_id, public.hoy_santiago() + 3);
  reset role;
  assert (select estado from public.ordenes where id = v_id) = 'pendiente',
    'FALLO: la orden reprogramada debía quedar pendiente';
  assert (select fecha_entrega from public.ordenes where id = v_id) = public.hoy_santiago() + 3,
    'FALLO: no se actualizó la fecha de entrega';

  raise notice 'GUARDAR_ORDEN OK';
end $$;

rollback;
