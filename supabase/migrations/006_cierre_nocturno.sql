-- =====================================================================
-- 006: cierre automático de rutas olvidadas (pg_cron)
--
-- pg_cron trabaja en hora UTC y Chile cambia de horario (UTC-3 en verano,
-- UTC-4 en invierno). Por eso se programa a las 03:05 y a las 04:05 UTC:
-- la función solo cierra rutas cuya fecha es ANTERIOR a hoy en Santiago, así
-- que en cada época del año solo una de las dos ejecuciones hace algo.
--
-- Si esta migración falla por permisos de la extensión: activar pg_cron en
-- el panel (Database > Extensions) y ejecutar solo la sentencia cron.schedule.
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'cerrar-rutas-vencidas',
  '5 3,4 * * *',
  $$select public.cerrar_rutas_vencidas()$$
);

-- Para ver el trabajo programado:  select * from cron.job;
-- Para quitarlo:                   select cron.unschedule('cerrar-rutas-vencidas');
