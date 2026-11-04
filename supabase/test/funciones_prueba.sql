-- =====================================================================
-- funciones_prueba.sql: recorre el flujo completo de un día de despacho
--   asignar -> iniciar -> reordenar -> omitir -> entrega parcial ->
--   fallida y reintento -> agregar parada con la ruta en curso ->
--   finalizar -> cierre nocturno
--
-- Requisitos: migraciones 001-005, seed.sql y seed_usuarios.sql aplicados.
-- Termina con "FUNCIONES OK" o con un mensaje "FALLO: ...".
-- Todo ocurre en una transacción que termina en ROLLBACK (no deja datos).
-- Si conductor1 o conductor2 ya tienen una ruta HOY, la prueba se detiene.
-- =====================================================================

begin;

do $$
declare
  v_hoy   date := public.hoy_santiago();
  v_admin uuid;
  c1 uuid;  c2 uuid;
  o1 uuid;  o2 uuid;  o3 uuid;  o4 uuid;  o5 uuid;  o6 uuid;
  r1 uuid;  r2 uuid;
  p1 uuid;  p2 uuid;  p3 uuid;  p4 uuid;
  v_item  uuid;
  v_items jsonb;
  v_id    uuid;
  v_id2   uuid;
  j       jsonb;
  j2      jsonb;
  n       integer;
  t       text;
  v_fallo boolean;
begin
  -- ---------------------------------------------------------------
  -- Preparación (como postgres, sin reglas de acceso)
  -- ---------------------------------------------------------------
  select p.id into v_admin from public.perfiles p join auth.users u on u.id = p.id
    where u.email = 'admin@despachgo.test';
  select p.id into c1 from public.perfiles p join auth.users u on u.id = p.id
    where u.email = 'conductor1@despachgo.test';
  select p.id into c2 from public.perfiles p join auth.users u on u.id = p.id
    where u.email = 'conductor2@despachgo.test';
  select id into o1 from public.ordenes where numero_guia = 'G-0001';
  select id into o2 from public.ordenes where numero_guia = 'G-0002';
  select id into o3 from public.ordenes where numero_guia = 'G-0003';
  select id into o4 from public.ordenes where numero_guia = 'G-0004';
  select id into o5 from public.ordenes where numero_guia = 'G-0005';
  select id into o6 from public.ordenes where numero_guia = 'G-0006';

  if v_admin is null or c1 is null or c2 is null
     or o1 is null or o2 is null or o3 is null or o4 is null or o5 is null or o6 is null then
    raise exception 'FALLO: faltan datos. Ejecutar seed.sql y seed_usuarios.sql antes de esta prueba';
  end if;
  if exists (select 1 from public.rutas where conductor_id in (c1, c2) and fecha = v_hoy) then
    raise exception 'FALLO: conductor1 o conductor2 ya tienen una ruta hoy; usar otros conductores de prueba';
  end if;

  update public.ordenes set estado = 'pendiente' where id in (o1, o2, o3, o4, o5, o6);
  -- G-0002 es del mismo cliente y dirección que G-0001: deben agruparse
  update public.ordenes
     set (cliente_nombre, cliente_telefono, direccion) =
         (select cliente_nombre, cliente_telefono, direccion from public.ordenes where id = o1)
   where id = o2;

  -- ---------------------------------------------------------------
  -- Un conductor NO puede asignar rutas
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c1::text, true);
  set local role authenticated;

  v_fallo := false;
  begin
    perform public.asignar_ruta(c2, v_hoy, array[o5], true);
    v_fallo := true;
  exception when insufficient_privilege then
    null;
  end;
  assert not v_fallo, 'FALLO: un conductor pudo asignar una ruta';
  reset role;

  -- ---------------------------------------------------------------
  -- ADMIN: asigna la ruta de conductor1 con 4 órdenes (2 se agrupan)
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;

  r1 := public.asignar_ruta(c1, v_hoy, array[o1, o2, o3, o4], true);

  -- No se puede asignar dos veces la misma orden (ya no está pendiente)
  v_fallo := false;
  begin
    perform public.asignar_ruta(c2, v_hoy, array[o1], true);
    v_fallo := true;
  exception when others then
    null;
  end;
  assert not v_fallo, 'FALLO: se asignó una orden que ya no estaba pendiente';
  reset role;

  select count(*) into n from public.paradas where ruta_id = r1;
  assert n = 3, 'FALLO: se esperaban 3 paradas (G-0001 y G-0002 agrupadas) y hay ' || n;

  select count(*) into n from public.ordenes where id in (o1, o2, o3, o4) and estado = 'asignada';
  assert n = 4, 'FALLO: las 4 órdenes debían quedar asignadas y hay ' || n;

  select pa.id into p1 from public.paradas pa join public.parada_ordenes po on po.parada_id = pa.id
    where pa.ruta_id = r1 and po.orden_id = o1;
  select pa.id into p2 from public.paradas pa join public.parada_ordenes po on po.parada_id = pa.id
    where pa.ruta_id = r1 and po.orden_id = o3;
  select pa.id into p3 from public.paradas pa join public.parada_ordenes po on po.parada_id = pa.id
    where pa.ruta_id = r1 and po.orden_id = o4;

  select count(*) into n from public.parada_ordenes where parada_id = p1;
  assert n = 2, 'FALLO: la parada de G-0001 debía tener 2 guías y tiene ' || n;

  -- ---------------------------------------------------------------
  -- Conductor2 NO puede iniciar la ruta de conductor1
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c2::text, true);
  set local role authenticated;

  v_fallo := false;
  begin
    perform public.iniciar_ruta(r1);
    v_fallo := true;
  exception when insufficient_privilege then
    null;
  end;
  assert not v_fallo, 'FALLO: conductor2 pudo iniciar la ruta de conductor1';
  reset role;

  -- ---------------------------------------------------------------
  -- CONDUCTOR 1: inicia la ruta
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c1::text, true);
  set local role authenticated;

  n := public.iniciar_ruta(r1);
  assert n = 3, 'FALLO: se esperaban 3 mensajes de WhatsApp y se crearon ' || n;

  v_fallo := false;
  begin
    perform public.iniciar_ruta(r1);   -- no se puede iniciar dos veces
    v_fallo := true;
  exception when others then
    null;
  end;
  assert not v_fallo, 'FALLO: se pudo iniciar la ruta dos veces';
  reset role;

  select count(*) into n from public.mensajes_whatsapp
    where parada_id in (p1, p2, p3) and direccion = 'enviado' and estado = 'pendiente';
  assert n = 3, 'FALLO: debía haber 3 mensajes pendientes y hay ' || n;

  select texto into t from public.mensajes_whatsapp where parada_id = p1;
  assert t like '%G-0001%' and t like '%G-0002%',
    'FALLO: el mensaje de la parada agrupada debía listar ambas guías: ' || t;
  select texto into t from public.mensajes_whatsapp where parada_id = p2;
  assert t not like '%guías%', 'FALLO: el mensaje de una sola guía no debía listar guías: ' || t;

  select count(*) into n from public.ordenes where id in (o1, o2, o3, o4) and estado = 'en_ruta';
  assert n = 4, 'FALLO: las órdenes debían quedar en ruta y hay ' || n;

  -- ---------------------------------------------------------------
  -- Reordenar y omitir
  -- ---------------------------------------------------------------
  set local role authenticated;
  perform public.reordenar_paradas(r1, array[p2, p1, p3]);
  perform public.omitir_parada(p3, 'calle_cerrada');

  v_fallo := false;
  begin
    perform public.reordenar_paradas(r1, array[p2, p1]);  -- faltan paradas
    v_fallo := true;
  exception when others then
    null;
  end;
  assert not v_fallo, 'FALLO: se aceptó un orden incompleto';
  reset role;

  assert (select posicion_final from public.paradas where id = p2) = 1, 'FALLO: p2 debía quedar primera';
  assert (select posicion_final from public.paradas where id = p1) = 2, 'FALLO: p1 debía quedar segunda';
  assert (select posicion_sugerida from public.paradas where id = p1) = 1, 'FALLO: se modificó el orden sugerido';
  assert (select estado from public.paradas where id = p3) = 'omitida', 'FALLO: p3 debía quedar omitida';

  -- ---------------------------------------------------------------
  -- Entrega PARCIAL en la parada agrupada (G-0001 completa, G-0002 con faltante)
  -- ---------------------------------------------------------------
  set local role authenticated;

  select id into v_item from public.orden_items where orden_id = o2 order by id limit 1;
  select jsonb_agg(jsonb_build_object(
           'orden_item_id', oi.id,
           'cantidad_entregada', case when oi.id = v_item then 0 else oi.cantidad_pedida end,
           'motivo', case when oi.id = v_item then 'faltante' else null end))
    into v_items
  from public.orden_items oi where oi.orden_id in (o1, o2);

  j := public.registrar_entrega(p1, v_items, p_recibido_por => 'Juan Perez');
  assert j ->> 'resultado' = 'parcial', 'FALLO: debía ser parcial y fue ' || (j ->> 'resultado');
  assert j ->> 'parada_estado' = 'parcial', 'FALLO: la parada debía quedar parcial';
  assert (j ->> 'requiere_foto')::boolean, 'FALLO: una entrega parcial requiere foto';
  v_id := (j ->> 'entrega_id')::uuid;

  -- Repetir la misma llamada (doble toque) no duplica la entrega
  j2 := public.registrar_entrega(p1, v_items, p_entrega_id => v_id);
  assert (j2 ->> 'entrega_id')::uuid = v_id, 'FALLO: la repetición debía devolver la misma entrega';

  -- No se puede registrar otra entrega en una parada ya entregada
  v_fallo := false;
  begin
    perform public.registrar_entrega(p1, v_items);
    v_fallo := true;
  exception when others then
    null;
  end;
  assert not v_fallo, 'FALLO: se registró una segunda entrega en una parada ya entregada';

  -- Lista de productos incompleta
  v_fallo := false;
  begin
    perform public.registrar_entrega(p2, '[]'::jsonb);
    v_fallo := true;
  exception when others then
    null;
  end;
  assert not v_fallo, 'FALLO: se aceptó una entrega sin productos';
  reset role;

  select count(*) into n from public.entregas where parada_id = p1;
  assert n = 1, 'FALLO: debía haber 1 entrega en p1 y hay ' || n;
  assert (select estado from public.ordenes where id = o1) = 'entregada', 'FALLO: G-0001 debía quedar entregada';
  assert (select estado from public.ordenes where id = o2) = 'entregada_parcial', 'FALLO: G-0002 debía quedar entregada_parcial';
  select count(*) into n from public.entrega_items where entrega_id = v_id;
  assert n >= 3, 'FALLO: faltan items de la entrega (' || n || ')';
  select count(*) into n from public.entregas_sin_foto where entrega_id = v_id;
  assert n = 1, 'FALLO: la entrega sin foto debía aparecer en la vista entregas_sin_foto';

  -- ---------------------------------------------------------------
  -- Entrega FALLIDA, reintento e idempotencia
  -- ---------------------------------------------------------------
  set local role authenticated;
  j := public.registrar_entrega_fallida(p2, 'cliente_ausente');
  assert j ->> 'parada_estado' = 'fallida_por_reintentar', 'FALLO: la parada debía quedar fallida_por_reintentar';
  perform public.reintentar_parada(p2);
  reset role;
  assert (select estado from public.paradas where id = p2) = 'pendiente', 'FALLO: tras reintentar debía quedar pendiente';

  set local role authenticated;
  v_id2 := gen_random_uuid();
  perform public.registrar_entrega_fallida(p2, 'problema_vehiculo_transito', p_entrega_id => v_id2);
  perform public.registrar_entrega_fallida(p2, 'problema_vehiculo_transito', p_entrega_id => v_id2);
  reset role;

  select count(*) into n from public.entregas where parada_id = p2;
  assert n = 2, 'FALLO: p2 debía tener 2 intentos en el historial y tiene ' || n;
  assert (select estado from public.paradas where id = p2) = 'fallida_por_reintentar', 'FALLO: p2 debía quedar fallida_por_reintentar';

  -- ---------------------------------------------------------------
  -- ADMIN agrega una parada al final con la ruta YA en curso
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  perform public.asignar_ruta(c1, v_hoy, array[o5], true);
  reset role;

  select pa.id into p4 from public.paradas pa join public.parada_ordenes po on po.parada_id = pa.id
    where pa.ruta_id = r1 and po.orden_id = o5;
  assert p4 is not null, 'FALLO: no se agregó la parada nueva';
  assert (select posicion_final from public.paradas where id = p4) = 4, 'FALLO: la parada nueva debía quedar al final';
  assert (select estado from public.ordenes where id = o5) = 'en_ruta', 'FALLO: la orden agregada debía quedar en_ruta';
  select count(*) into n from public.mensajes_whatsapp where parada_id = p4 and estado = 'pendiente';
  assert n = 1, 'FALLO: la parada agregada debía tener su mensaje de WhatsApp';

  -- ---------------------------------------------------------------
  -- Conductor2 NO puede finalizar; conductor1 finaliza
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c2::text, true);
  set local role authenticated;
  v_fallo := false;
  begin
    perform public.finalizar_ruta(r1);
    v_fallo := true;
  exception when insufficient_privilege then
    null;
  end;
  assert not v_fallo, 'FALLO: conductor2 pudo finalizar la ruta de conductor1';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c1::text, true);
  set local role authenticated;
  j := public.finalizar_ruta(r1);
  reset role;

  assert (j ->> 'parciales')::int = 1,    'FALLO: resumen: debía haber 1 parcial';
  assert (j ->> 'fallidas')::int = 1,     'FALLO: resumen: debía haber 1 fallida';
  assert (j ->> 'omitidas')::int = 2,     'FALLO: resumen: debían ser 2 omitidas (p3 y la sin visitar)';
  assert (j ->> 'sin_visitar')::int = 1,  'FALLO: resumen: debía haber 1 sin visitar';
  assert (j ->> 'entregas_sin_foto')::int = 1, 'FALLO: resumen: debía haber 1 entrega sin foto';

  assert (select estado from public.rutas where id = r1) = 'finalizada', 'FALLO: la ruta debía quedar finalizada';
  assert (select estado from public.ordenes where id = o3) = 'fallida',   'FALLO: G-0003 debía quedar fallida';
  assert (select estado from public.ordenes where id = o4) = 'pendiente', 'FALLO: G-0004 (omitida) debía volver a pendiente';
  assert (select estado from public.ordenes where id = o5) = 'pendiente', 'FALLO: G-0005 (sin visitar) debía volver a pendiente';
  assert (select estado from public.ordenes where id = o1) = 'entregada', 'FALLO: G-0001 debía seguir entregada';
  assert (select estado from public.ordenes where id = o2) = 'entregada_parcial', 'FALLO: G-0002 debía seguir entregada_parcial';

  select count(*) into n from public.mensajes_whatsapp
    where parada_id in (p1, p2, p3, p4) and direccion = 'enviado' and estado = 'pendiente';
  assert n = 0, 'FALLO: no deben quedar mensajes pendientes tras cerrar la ruta (' || n || ')';

  -- ---------------------------------------------------------------
  -- Cierre nocturno: ruta en curso de AYER que el conductor olvidó finalizar
  -- ---------------------------------------------------------------
  insert into public.rutas (conductor_id, fecha, estado)
    values (c2, v_hoy - 1, 'en_curso') returning id into r2;
  insert into public.paradas (ruta_id, posicion_sugerida, posicion_final)
    values (r2, 1, 1) returning id into v_id;
  insert into public.parada_ordenes (parada_id, orden_id) values (v_id, o6);
  update public.ordenes set estado = 'en_ruta' where id = o6;

  n := public.cerrar_rutas_vencidas();
  assert n >= 1, 'FALLO: el cierre nocturno debía cerrar al menos 1 ruta';
  assert (select estado from public.rutas where id = r2) = 'finalizada', 'FALLO: la ruta de ayer debía quedar finalizada';
  assert (select estado from public.ordenes where id = o6) = 'pendiente', 'FALLO: G-0006 debía volver a pendiente';

  raise notice 'FUNCIONES OK: todo el flujo de ruta y entrega pasó';
end $$;

rollback;
