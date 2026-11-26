-- =====================================================================
-- 010: tiempo real (Supabase Realtime)
--
-- Activa los cambios en vivo de:
--   * paradas               -> la app del conductor ve al instante cuando un cliente
--                              responde 1/2/3 (el bot actualiza confirmacion_cliente)
--   * ubicaciones_conductor -> el panel del admin verá a los conductores en el mapa
--
-- Realtime respeta las reglas de acceso (RLS): cada conductor solo recibe cambios
-- de SU ruta, y el admin recibe todo.
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array['paradas', 'ubicaciones_conductor'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
