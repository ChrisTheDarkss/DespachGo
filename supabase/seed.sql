-- =====================================================================
-- seed.sql: datos de PRUEBA (no usar en producción)
--
--  * Catálogo de ejemplo: REEMPLAZAR por los productos reales del negocio.
--  * 20 órdenes con clientes, teléfonos y direcciones FICTICIAS de Temuco y
--    Padre Las Casas. Las calles son reales, pero los números y las
--    coordenadas son APROXIMADOS y no están verificados: sirven para probar
--    pantallas, no la geocodificación. Para esa prueba usar direcciones
--    reales (tarea 5-05).
--  * Los teléfonos +569000000NN son ficticios. Para probar el bot, cambiar
--    algunos por números conocidos del equipo (formato +569XXXXXXXX).
--  * Se puede ejecutar más de una vez (no duplica). Las fechas de entrega se
--    reparten entre hoy, mañana y pasado mañana (requiere la migración 008).
--    Para repartirlas en órdenes que ya estaban cargadas:
--      update public.ordenes set fecha_entrega = public.hoy_santiago() + (numero % 3)::int
--      where numero_guia like 'G-%' and estado = 'pendiente';
--  * Los usuarios (admin y conductores) se crean aparte: ver seed_usuarios.sql
-- =====================================================================

insert into public.productos (nombre, unidad) values
  ('Producto de ejemplo 01', 'unidad'),
  ('Producto de ejemplo 02', 'unidad'),
  ('Producto de ejemplo 03', 'caja'),
  ('Producto de ejemplo 04', 'caja'),
  ('Producto de ejemplo 05', 'saco'),
  ('Producto de ejemplo 06', 'saco'),
  ('Producto de ejemplo 07', 'pack'),
  ('Producto de ejemplo 08', 'pack')
on conflict (nombre) do nothing;

do $$
declare
  i            integer;
  v_orden      uuid;
  v_productos  uuid[];
  direcciones  text[] := array[
    'Av. Alemania 0671', 'Manuel Montt 1120', 'Av. Caupolicán 0450', 'Claro Solar 880',
    'Av. Francisco Salazar 01450', 'Av. San Martín 0320', 'Av. Pedro de Valdivia 0890',
    'Bulnes 560', 'Prieto Norte 1010', 'Av. Javiera Carrera 1250', 'Av. Balmaceda 410',
    'Av. Huichahue 1500', 'Av. Pablo Neruda 0230', 'Av. Rudecindo Ortega 02100',
    'Av. Gabriela Mistral 740', 'Aldunate 330', 'Av. Las Encinas 1180',
    'Av. Barros Arana 090', 'Maquehue 600', 'Av. Los Poetas 410'
  ];
  latitudes    numeric[] := array[
    -38.7396, -38.7352, -38.7281, -38.7425, -38.7463, -38.7210, -38.7330, -38.7512,
    -38.7188, -38.7440, -38.7305, -38.7570, -38.7258, -38.7475, -38.7380, -38.7120,
    -38.7535, -38.7345, -38.7605, -38.7165
  ];
  longitudes   numeric[] := array[
    -72.5905, -72.5938, -72.5871, -72.5822, -72.5990, -72.5790, -72.6020, -72.5880,
    -72.5960, -72.6100, -72.5760, -72.5950, -72.6075, -72.5740, -72.6155, -72.5870,
    -72.6030, -72.5690, -72.5815, -72.6040
  ];
begin
  select array_agg(id order by nombre) into v_productos
  from public.productos
  where nombre like 'Producto de ejemplo %';

  for i in 1..20 loop
    v_orden := null;  -- evita arrastrar el id de la vuelta anterior si hubo conflicto

    insert into public.ordenes
      (numero_guia, cliente_nombre, cliente_telefono, direccion, comuna, latitud, longitud, notas,
       fecha_entrega)
    values (
      'G-' || lpad(i::text, 4, '0'),
      'Cliente Prueba ' || lpad(i::text, 2, '0'),
      '+569' || lpad(i::text, 8, '0'),
      direcciones[i],
      case when i in (12, 19) then 'Padre Las Casas' else 'Temuco' end,
      latitudes[i],
      longitudes[i],
      case when i % 5 = 0 then 'Tocar el timbre dos veces' else null end,
      public.hoy_santiago() + (i % 3)   -- reparte las entregas: hoy, mañana y pasado mañana
    )
    on conflict (numero_guia) do nothing
    returning id into v_orden;

    if v_orden is not null then
      insert into public.orden_items (orden_id, producto_id, cantidad_pedida)
      values
        (v_orden, v_productos[(i % 8) + 1], (i % 5) + 1),
        (v_orden, v_productos[((i + 3) % 8) + 1], ((i + 1) % 4) + 1);

      if i % 2 = 0 then
        insert into public.orden_items (orden_id, producto_id, cantidad_pedida)
        values (v_orden, v_productos[((i + 5) % 8) + 1], 2);
      end if;
    end if;
  end loop;
end $$;
