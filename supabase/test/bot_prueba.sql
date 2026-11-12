-- =====================================================================
-- bot_prueba.sql: comprueba las funciones del bot (cola y respuestas)
-- Requisitos: migraciones 001-009, seed.sql y seed_usuarios.sql.
-- Termina con "BOT OK" o con "FALLO: ...". Termina en ROLLBACK.
-- Si conductor1 ya tiene una ruta HOY, la prueba se detiene.
-- =====================================================================
begin;

do $$
declare
  v_hoy   date := public.hoy_santiago();
  v_admin uuid;
  c1      uuid;
  o1 uuid;  o2 uuid;
  r1 uuid;
  p1 uuid;  p2 uuid;
  t1 text;  t2 text;
  m1 uuid;  m2 uuid;
  j       jsonb;
  n       integer;
  v_fallo boolean;
begin
  select p.id into v_admin from public.perfiles p join auth.users u on u.id = p.id
    where u.email = 'admin@despachgo.test';
  select p.id into c1 from public.perfiles p join auth.users u on u.id = p.id
    where u.email = 'conductor1@despachgo.test';
  select id into o1 from public.ordenes where numero_guia = 'G-0001';
  select id into o2 from public.ordenes where numero_guia = 'G-0002';
  if v_admin is null or c1 is null or o1 is null or o2 is null then
    raise exception 'FALLO: faltan datos. Ejecutar seed.sql y seed_usuarios.sql antes de esta prueba';
  end if;
  if exists (select 1 from public.rutas where conductor_id = c1 and fecha = v_hoy) then
    raise exception 'FALLO: conductor1 ya tiene una ruta hoy; usar otro conductor de prueba';
  end if;

  update public.ordenes set estado = 'pendiente' where id in (o1, o2);

  -- ---------- Preparación: el admin asigna y el conductor inicia la ruta ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  r1 := public.asignar_ruta(c1, v_hoy, array[o1, o2], true);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c1::text, true);
  set local role authenticated;
  n := public.iniciar_ruta(r1);
  assert n = 2, 'FALLO: se esperaban 2 mensajes y se crearon ' || n;

  -- Un usuario con sesión NO puede usar las funciones del bot
  v_fallo := false;
  begin
    perform public.bot_reservar_mensajes(5, 3);
    v_fallo := true;
  exception when insufficient_privilege then
    null;
  end;
  assert not v_fallo, 'FALLO: un conductor pudo llamar a bot_reservar_mensajes';
  reset role;

  select pa.id into p1 from public.paradas pa join public.parada_ordenes po on po.parada_id = pa.id
    where pa.ruta_id = r1 and po.orden_id = o1;
  select pa.id into p2 from public.paradas pa join public.parada_ordenes po on po.parada_id = pa.id
    where pa.ruta_id = r1 and po.orden_id = o2;
  select cliente_telefono into t1 from public.ordenes where id = o1;
  select cliente_telefono into t2 from public.ordenes where id = o2;
  select id into m1 from public.mensajes_whatsapp where parada_id = p1 and direccion = 'enviado';
  select id into m2 from public.mensajes_whatsapp where parada_id = p2 and direccion = 'enviado';

  -- ---------- Cola: reservar ----------
  select count(*) into n from public.bot_reservar_mensajes(10, 3);
  assert n = 2, 'FALLO: debía reservar 2 mensajes y reservó ' || n;
  select count(*) into n from public.bot_reservar_mensajes(10, 3);
  assert n = 0, 'FALLO: los mensajes ya reservados no deben volver a entregarse (' || n || ')';
  assert (select intentos from public.mensajes_whatsapp where id = m1) = 1,
    'FALLO: el primer intento debía contarse';

  -- ---------- Enviado ----------
  perform public.bot_marcar_enviado(m1);
  assert (select estado from public.mensajes_whatsapp where id = m1) = 'enviado', 'FALLO: m1 debía quedar enviado';
  assert (select enviado_en from public.mensajes_whatsapp where id = m1) is not null, 'FALLO: falta enviado_en';

  -- ---------- Error no definitivo: sigue pendiente y espera ----------
  perform public.bot_marcar_error(m2, 'fallo de red', false, 3);
  assert (select estado from public.mensajes_whatsapp where id = m2) = 'pendiente',
    'FALLO: un error no definitivo debía dejar el mensaje pendiente';
  assert (select reservado_hasta from public.mensajes_whatsapp where id = m2) > now(),
    'FALLO: el mensaje debía esperar antes de reintentarse';

  update public.mensajes_whatsapp set reservado_hasta = now() - interval '1 second' where id = m2;
  select count(*) into n from public.bot_reservar_mensajes(10, 3);
  assert n = 1, 'FALLO: el mensaje con error debía volver a la cola (' || n || ')';
  assert (select intentos from public.mensajes_whatsapp where id = m2) = 2, 'FALLO: debía ir en el intento 2';

  -- ---------- Error definitivo ----------
  perform public.bot_marcar_error(m2, 'El número no tiene WhatsApp', true, 3);
  assert (select estado from public.mensajes_whatsapp where id = m2) = 'error', 'FALLO: m2 debía quedar con error';

  -- ---------- Respuestas de clientes ----------
  j := public.bot_registrar_respuesta(t1, '1', 'WA-001');
  assert (j ->> 'parada_id')::uuid = p1, 'FALLO: la respuesta debía asociarse a la parada 1';
  assert j ->> 'confirmacion' = 'confirmo', 'FALLO: 1 debía confirmar';
  assert (j ->> 'actualizada')::boolean, 'FALLO: debía actualizar la parada';
  assert (select confirmacion_cliente from public.paradas where id = p1) = 'confirmo', 'FALLO: la parada debía quedar confirmada';

  j := public.bot_registrar_respuesta(t1, '1', 'WA-001');   -- mismo mensaje otra vez
  assert (j ->> 'duplicado')::boolean, 'FALLO: debía detectar el mensaje duplicado';
  select count(*) into n from public.mensajes_whatsapp where parada_id = p1 and direccion = 'recibido';
  assert n = 1, 'FALLO: el duplicado no debía guardarse (' || n || ')';

  j := public.bot_registrar_respuesta(t1, ' 2 ', 'WA-002');  -- cambia de opinión
  assert j ->> 'confirmacion' = 'no_habra_nadie', 'FALLO: 2 debía marcar que no habrá nadie';

  j := public.bot_registrar_respuesta(t1, 'llego en 10 minutos', 'WA-003');
  assert j ->> 'confirmacion' = 'no_habra_nadie', 'FALLO: un texto libre no debe pisar la confirmación';
  assert (select respuesta_cliente from public.paradas where id = p1) = 'llego en 10 minutos',
    'FALLO: el texto libre debía quedar visible para el conductor';

  j := public.bot_registrar_respuesta(t1, '3.', 'WA-004');
  assert j ->> 'confirmacion' = 'quiere_hablar', 'FALLO: 3 debía marcar que quiere hablar';

  -- Un texto libre como PRIMERA respuesta queda como "otro"
  j := public.bot_registrar_respuesta(t2, 'hola', 'WA-005');   -- m2 nunca se envió
  assert not (j ->> 'actualizada')::boolean, 'FALLO: no debía asociarse a un mensaje que no salió';
  assert (j ->> 'parada_id') is null, 'FALLO: debía guardarse sin parada';
  assert (select confirmacion_cliente from public.paradas where id = p2) = 'sin_respuesta',
    'FALLO: la parada 2 debía seguir sin respuesta';

  j := public.bot_registrar_respuesta('+56911119999', 'hola', 'WA-006');   -- número desconocido
  assert not (j ->> 'actualizada')::boolean, 'FALLO: un número desconocido no debe actualizar paradas';

  select count(*) into n from public.mensajes_whatsapp
    where direccion = 'recibido' and id_externo like 'WA-00%' and estado is null;
  assert n = 5, 'FALLO: debían guardarse 5 mensajes recibidos y hay ' || n;

  -- ---------- Con la ruta cerrada, ya no se actualizan paradas ----------
  perform public.cerrar_ruta(r1);
  j := public.bot_registrar_respuesta(t1, '1', 'WA-007');
  assert not (j ->> 'actualizada')::boolean, 'FALLO: con la ruta cerrada no debía actualizarse la parada';

  raise notice 'BOT OK: cola y respuestas funcionan';
end $$;

rollback;
