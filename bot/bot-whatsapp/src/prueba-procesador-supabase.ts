
import "dotenv/config";

import { obtenerSupabase } from "./lib/supabase.js";
import { RepositorioSupabase } from "./cola/repositorioSupabase.js";

async function main(): Promise<void> {
  console.log("=== DIAGNÓSTICO DEL PROCESADOR ===");

  const supabase = obtenerSupabase();
  const repositorio = new RepositorioSupabase(supabase);

  // Solo consulta. No reserva ni envía mensajes.
  const pendientes = await repositorio.consultarPendientes();

  console.log("Mensajes pendientes:", pendientes);

  // Comprobar mensajes de rutas activas.
  const { data, error } = await supabase
    .from("mensajes_whatsapp")
    .select(`
      id,
      estado,
      paradas!inner(
        rutas!inner(estado)
      )
    `)
    .eq("direccion", "enviado")
    .eq("estado", "pendiente")
    .eq("paradas.rutas.estado", "en_curso");

  if (error) {
    throw new Error(error.message);
  }

  console.log(
    "Mensajes pendientes de rutas activas:",
    data?.length ?? 0
  );

  console.log("No se reservaron mensajes.");
  console.log("No se enviaron mensajes.");
  console.log("No se modificó Supabase.");
}

main().catch((error) => {
  console.error("Error en diagnóstico:", error);
  process.exitCode = 1;
});
