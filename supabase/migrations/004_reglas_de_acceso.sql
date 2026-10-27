-- =====================================================================
-- 004: reglas de acceso (RLS), triggers, permisos y bucket de fotos
--
-- Resumen:
--  * Admin: ve y crea/edita todo. NADIE puede borrar por la API (no hay
--    política ni permiso de DELETE): se cambia el estado, no se borra.
--  * Conductor: solo ve SU ruta del día (no borrador, fecha <= hoy), sus
--    paradas, las órdenes de esas paradas y sus entregas. Puede registrar
--    entregas (con items y fotos) en paradas de su ruta EN CURSO y
--    actualizar su última ubicación.
--  * Los cambios de estado (iniciar ruta, reordenar, omitir, finalizar...)
--    NO se permiten directo: irán por funciones (siguiente avance).
--  * El bot usa service_role (se salta RLS). Nunca poner esa clave en la
--    app ni en el panel.
-- =====================================================================

-- ---------- Funciones auxiliares (security definer: evitan recursión de RLS) ----------

create or replace function public.hoy_santiago()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/Santiago')::date $$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'admin' and activo
  )
$$;

create or replace function public.es_conductor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'conductor' and activo
  )
$$;

-- ¿La ruta es del conductor actual y ya puede verla? (no borrador, fecha <= hoy)
create or replace function public.ruta_es_del_conductor(p_ruta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_conductor() and exists (
    select 1 from public.rutas r
    where r.id = p_ruta
      and r.conductor_id = auth.uid()
      and r.estado <> 'borrador'
      and r.fecha <= public.hoy_santiago()
  )
$$;

create or replace function public.parada_es_del_conductor(p_parada uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.paradas p
    where p.id = p_parada and public.ruta_es_del_conductor(p.ruta_id)
  )
$$;

-- Igual que la anterior, pero exige que la ruta esté EN CURSO
create or replace function public.parada_en_curso_del_conductor(p_parada uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_conductor() and exists (
    select 1
    from public.paradas p
    join public.rutas r on r.id = p.ruta_id
    where p.id = p_parada
      and r.conductor_id = auth.uid()
      and r.estado = 'en_curso'
  )
$$;

create or replace function public.orden_es_del_conductor(p_orden uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.parada_ordenes po
    where po.orden_id = p_orden and public.parada_es_del_conductor(po.parada_id)
  )
$$;

create or replace function public.entrega_es_del_conductor(p_entrega uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entregas e
    where e.id = p_entrega and public.parada_es_del_conductor(e.parada_id)
  )
$$;

-- Versión con texto para las políticas del bucket (la carpeta es el id de la entrega)
create or replace function public.entrega_texto_es_del_conductor(p_entrega text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entregas e
    where e.id::text = p_entrega and public.parada_es_del_conductor(e.parada_id)
  )
$$;

-- Solo usuarios con sesión pueden ejecutar las funciones
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- ---------- Permisos de tabla (las reglas RLS filtran lo que cada uno ve) ----------
-- Supabase puede conceder permisos amplios por defecto a las tablas nuevas:
-- aquí se dejan solo los necesarios. anon (sin sesión) no accede a nada y
-- authenticated no puede borrar; solo service_role puede borrar.
-- Las tablas que se creen después deben repetir este patrón.
revoke all on all tables in schema public from anon;
revoke delete, truncate, references, trigger on all tables in schema public from authenticated;
grant usage on schema public to authenticated, service_role;
grant select, insert, update on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- ---------- Triggers de actualizado_en y activación de RLS ----------
do $$
declare
  t text;
  tablas text[] := array[
    'perfiles', 'productos', 'ordenes', 'orden_items', 'rutas', 'paradas',
    'parada_ordenes', 'entregas', 'entrega_items', 'entrega_fotos',
    'mensajes_whatsapp', 'ubicaciones_conductor'
  ];
begin
  foreach t in array tablas loop
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.set_actualizado_en()',
      'trg_' || t || '_actualizado_en', t);

    execute format('alter table public.%I enable row level security', t);

    -- Admin: ver, crear y editar (sin borrar)
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.es_admin())', t || '_admin_ver', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (public.es_admin())', t || '_admin_crear', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.es_admin()) with check (public.es_admin())', t || '_admin_editar', t);
  end loop;
end $$;

-- ---------- Conductor: lectura ----------

create policy perfiles_propio_ver on public.perfiles
  for select to authenticated
  using (id = auth.uid());

create policy productos_ver on public.productos
  for select to authenticated
  using (true);

create policy ordenes_conductor_ver on public.ordenes
  for select to authenticated
  using (public.orden_es_del_conductor(id));

create policy orden_items_conductor_ver on public.orden_items
  for select to authenticated
  using (public.orden_es_del_conductor(orden_id));

create policy rutas_conductor_ver on public.rutas
  for select to authenticated
  using (public.ruta_es_del_conductor(id));

create policy paradas_conductor_ver on public.paradas
  for select to authenticated
  using (public.parada_es_del_conductor(id));

create policy parada_ordenes_conductor_ver on public.parada_ordenes
  for select to authenticated
  using (public.parada_es_del_conductor(parada_id));

create policy entregas_conductor_ver on public.entregas
  for select to authenticated
  using (public.parada_es_del_conductor(parada_id));

create policy entrega_items_conductor_ver on public.entrega_items
  for select to authenticated
  using (public.entrega_es_del_conductor(entrega_id));

create policy entrega_fotos_conductor_ver on public.entrega_fotos
  for select to authenticated
  using (public.entrega_es_del_conductor(entrega_id));

-- mensajes_whatsapp: el conductor no tiene acceso (la confirmación del
-- cliente se lee desde paradas.confirmacion_cliente)

create policy ubicaciones_conductor_ver on public.ubicaciones_conductor
  for select to authenticated
  using (conductor_id = auth.uid());

-- ---------- Conductor: escritura limitada ----------

-- Registrar una entrega solo en paradas de su ruta EN CURSO
create policy entregas_conductor_crear on public.entregas
  for insert to authenticated
  with check (
    public.parada_en_curso_del_conductor(parada_id)
    and creado_por = auth.uid()
  );

create policy entrega_items_conductor_crear on public.entrega_items
  for insert to authenticated
  with check (public.entrega_es_del_conductor(entrega_id));

create policy entrega_fotos_conductor_crear on public.entrega_fotos
  for insert to authenticated
  with check (public.entrega_es_del_conductor(entrega_id));

-- Última ubicación: solo la propia (insert + update = upsert)
create policy ubicaciones_conductor_crear on public.ubicaciones_conductor
  for insert to authenticated
  with check (conductor_id = auth.uid() and public.es_conductor());

create policy ubicaciones_conductor_editar on public.ubicaciones_conductor
  for update to authenticated
  using (conductor_id = auth.uid() and public.es_conductor())
  with check (conductor_id = auth.uid() and public.es_conductor());

-- ---------- Bucket privado de fotos de guías ----------
-- Ruta del objeto: <entrega_id>/<nombre_de_archivo>
-- Orden recomendado en la app: 1) crear la entrega  2) subir la foto
-- 3) crear la fila en entrega_fotos.
insert into storage.buckets (id, name, public)
values ('entregas', 'entregas', false)
on conflict (id) do nothing;

create policy entregas_storage_admin_ver on storage.objects
  for select to authenticated
  using (bucket_id = 'entregas' and public.es_admin());

create policy entregas_storage_conductor_ver on storage.objects
  for select to authenticated
  using (
    bucket_id = 'entregas'
    and public.entrega_texto_es_del_conductor((storage.foldername(name))[1])
  );

create policy entregas_storage_conductor_subir on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'entregas'
    and public.entrega_texto_es_del_conductor((storage.foldername(name))[1])
  );

-- Permite reintentos de subida con el mismo nombre (upsert)
create policy entregas_storage_conductor_reemplazar on storage.objects
  for update to authenticated
  using (
    bucket_id = 'entregas'
    and public.entrega_texto_es_del_conductor((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'entregas'
    and public.entrega_texto_es_del_conductor((storage.foldername(name))[1])
  );
