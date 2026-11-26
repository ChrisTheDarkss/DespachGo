
import { obtenerSupabase } from "./lib/supabase.js";

async function main(): Promise<void> {
  console.log("Conectando con Supabase...");

  const supabase = obtenerSupabase();

  const { error } = await supabase
    .from("configuracion")
    .select("clave")
    .limit(1);

  if (error) {
    throw new Error(
      `Error de Supabase: ${error.message}`
    );
  }

  console.log("✅ Conexión con Supabase exitosa.");
  console.log("✅ Consulta de lectura realizada.");
}

main().catch((error) => {
  console.error("❌", error.message);
  process.exitCode = 1;
});
