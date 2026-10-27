-- =====================================================================
-- seed_usuarios.sql: crea los PERFILES de prueba (admin y 3 conductores)
-- Este archivo NO se ejecuta solo con "supabase db reset": se corre a mano.
--
-- Pasos:
--  1) En Supabase: Authentication > Users > Add user, crear estos 4 usuarios
--     con "Auto Confirm User" activado y una contraseña de prueba (NO subir
--     contraseñas al repositorio):
--        admin@despachgo.test
--        conductor1@despachgo.test
--        conductor2@despachgo.test
--        conductor3@despachgo.test
--  2) Ejecutar este archivo en el SQL Editor (o con psql).
--
-- En producción usar los correos reales y borrar los usuarios de prueba.
-- =====================================================================

insert into public.perfiles (id, nombre, telefono, rol)
select u.id, v.nombre, v.telefono, v.rol
from auth.users u
join (values
  ('admin@despachgo.test',      'Admin Prueba', '+56900000100', 'admin'),
  ('conductor1@despachgo.test', 'Conductor 1',  '+56900000101', 'conductor'),
  ('conductor2@despachgo.test', 'Conductor 2',  '+56900000102', 'conductor'),
  ('conductor3@despachgo.test', 'Conductor 3',  '+56900000103', 'conductor')
) as v (email, nombre, telefono, rol) on v.email = u.email
on conflict (id) do update
  set nombre = excluded.nombre,
      telefono = excluded.telefono,
      rol = excluded.rol,
      activo = true;

-- Verificación: deben aparecer 4 filas
select p.nombre, p.rol, u.email
from public.perfiles p
join auth.users u on u.id = p.id
order by p.rol, p.nombre;
