
import { obtenerSupabase } from "./lib/supabase.js";
import { RepositorioSupabase } from "./cola/repositorioSupabase.js";

async function main(): Promise<void> {
  console.log("Consultando cola de Supabase...");

  const supabase = obtenerSupabase();
  const repositorio = new RepositorioSupabase(supabase);

  const pendientes =
    await repositorio.consultarPendientes();

  console.log("Conexión exitosa.");
  console.log(`Mensajes pendientes: ${pendientes}`);
  console.log("No se modificó ningún registro.");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exitCode = 1;
});
