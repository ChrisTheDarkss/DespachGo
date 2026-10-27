-- =====================================================================
-- rls_prueba.sql: comprueba que las reglas de acceso (RLS) funcionan
--
-- Requisitos: migraciones 001-004 aplicadas, seed.sql y seed_usuarios.sql
-- ejecutados. Si hay un error, la consulta se detiene con un mensaje
-- "FALLO: ...". Si todo está bien, termina con "RLS OK".
--
-- Todo ocurre dentro de una transacción que termina en ROLLBACK: no deja
-- datos. Ejecutar en el SQL Editor de Supabase o con psql como usuario
-- postgres. Si hoy ya existe una ruta real de conductor1 o conductor2,
-- elegir otros conductores de prueba (la ruta es única por conductor y día).
-- =====================================================================

begin;

do $$
declare
  v_admin uuid;
  c1 uuid;
  c2 uuid;
  r1 uuid;
  r2 uuid;
  p1 uuid;
  p2 uuid;
  o1 uuid;
  o2 uuid;
  o3 uuid;
  n  integer;
begin
  -- ---------- Preparación (como postgres, sin RLS) ----------
  select p.id into v_admin from public.perfiles p join auth.users u on u.id = p.id
    where u.email = 'admin@despachgo.test';
  select p.id into c1 from public.perfiles p join auth.users u on u.id = p.id
    where u.email = 'conductor1@despachgo.test';
  select p.id into c2 from public.perfiles p join auth.users u on u.id = p.id
    where u.email = 'conductor2@despachgo.test';
  select id into o1 from public.ordenes where numero_guia = 'G-0001';
  select id into o2 from public.ordenes where numero_guia = 'G-0002';
  select id into o3 from public.ordenes where numero_guia = 'G-0003';

  if v_admin is null or c1 is null or c2 is null or o1 is null or o2 is null or o3 is null then
    raise exception 'FALLO: faltan datos. Ejecutar seed.sql y seed_usuarios.sql antes de esta prueba';
  end if;

  insert into public.rutas (conductor_id, fecha, estado)
    values (c1, public.hoy_santiago(), 'en_curso') returning id into r1;
  insert into public.rutas (conductor_id, fecha, estado)
    values (c2, public.hoy_santiago(), 'en_curso') returning id into r2;

  insert into public.paradas (ruta_id, posicion_sugerida, posicion_final)
    values (r1, 1, 1) returning id into p1;
  insert into public.paradas (ruta_id, posicion_sugerida, posicion_final)
    values (r2, 1, 1) returning id into p2;

  insert into public.parada_ordenes (parada_id, orden_id)
    values (p1, o1), (p1, o2), (p2, o3);

  -- ---------- Conductor 1 ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c1::text, true);
  set local role authenticated;

  select count(*) into n from public.rutas;
  assert n = 1, 'FALLO: conductor1 deberia ver 1 ruta y ve ' || n;

  select count(*) into n from public.rutas where conductor_id = c2;
  assert n = 0, 'FALLO: conductor1 ve la ruta de conductor2';

  select count(*) into n from public.paradas;
  assert n = 1, 'FALLO: conductor1 deberia ver 1 parada y ve ' || n;

  select count(*) into n from public.ordenes;
  assert n = 2, 'FALLO: conductor1 deberia ver 2 ordenes (G-0001 y G-0002) y ve ' || n;

  select count(*) into n from public.ordenes where id = o3;
  assert n = 0, 'FALLO: conductor1 ve una orden de otra ruta';

  select count(*) into n from public.perfiles;
  assert n = 1, 'FALLO: conductor1 deberia ver solo su perfil y ve ' || n;

  -- Puede registrar una entrega en su parada en curso
  insert into public.entregas (parada_id, resultado) values (p1, 'entregada');

  -- No puede registrar una entrega en la parada de otro conductor
  begin
    insert into public.entregas (parada_id, resultado) values (p2, 'entregada');
    raise exception 'FALLO: conductor1 pudo insertar una entrega en la parada de conductor2';
  exception when insufficient_privilege then
    null;  -- correcto: la regla lo bloqueó
  end;

  -- No puede cambiar el estado de rutas (ni la suya ni la ajena)
  update public.rutas set estado = 'finalizada' where id in (r1, r2);
  get diagnostics n = row_count;
  assert n = 0, 'FALLO: conductor1 pudo modificar rutas (' || n || ' filas)';

  -- Ubicación: puede guardar la suya, no la de otro
  insert into public.ubicaciones_conductor (conductor_id, latitud, longitud)
    values (c1, -38.7396, -72.5905);
  begin
    insert into public.ubicaciones_conductor (conductor_id, latitud, longitud)
      values (c2, -38.7396, -72.5905);
    raise exception 'FALLO: conductor1 pudo guardar la ubicacion de conductor2';
  exception when insufficient_privilege then
    null;
  end;

  -- ---------- Conductor 2 ----------
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c2::text, true);
  set local role authenticated;

  select count(*) into n from public.entregas;
  assert n = 0, 'FALLO: conductor2 ve entregas de otro conductor (' || n || ')';

  select count(*) into n from public.ordenes;
  assert n = 1, 'FALLO: conductor2 deberia ver 1 orden (G-0003) y ve ' || n;

  -- ---------- Sin sesión (anon) ----------
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;

  begin
    select count(*) into n from public.ordenes;
    assert n = 0, 'FALLO: un usuario sin sesion ve ordenes (' || n || ')';
  exception when insufficient_privilege then
    null;  -- correcto: ni siquiera tiene permiso sobre la tabla
  end;

  -- ---------- Admin ----------
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;

  select count(*) into n from public.rutas;
  assert n >= 2, 'FALLO: el admin deberia ver todas las rutas y ve ' || n;

  select count(*) into n from public.ordenes;
  assert n >= 3, 'FALLO: el admin deberia ver todas las ordenes y ve ' || n;

  select count(*) into n from public.entregas;
  assert n >= 1, 'FALLO: el admin deberia ver las entregas y ve ' || n;

  -- Nadie borra por la API: ni siquiera el admin
  begin
    delete from public.ordenes where id = o1;
    get diagnostics n = row_count;
    assert n = 0, 'FALLO: el admin pudo borrar una orden';
  exception when insufficient_privilege then
    null;  -- correcto: no existe permiso de DELETE
  end;

  reset role;
  raise notice 'RLS OK: todas las pruebas de acceso pasaron';
end $$;

rollback;
