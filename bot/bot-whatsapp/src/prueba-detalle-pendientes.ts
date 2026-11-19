
import { obtenerSupabase } from "./lib/supabase.js";
import { normalizarTelefono } from "./utils/telefono.js";

async function main(): Promise<void> {
  const supabase = obtenerSupabase();

  const { data, error } = await supabase
    .from("mensajes_whatsapp")
    .select("id, telefono, texto, estado, intentos, parada_id, reservado_hasta")
    .eq("direccion", "enviado")
    .eq("estado", "pendiente")
    .order("creado_en", { ascending: true })
    .limit(10);

  if (error) {
    throw new Error(error.message);
  }

  const resumen = (data ?? []).map((mensaje) => ({
    id: mensaje.id,
    telefono_valido:
      normalizarTelefono(mensaje.telefono) !== null,
    tiene_texto: Boolean(mensaje.texto?.trim()),
    estado: mensaje.estado,
    intentos: mensaje.intentos,
    tiene_parada: Boolean(mensaje.parada_id),
    reservado:
      mensaje.reservado_hasta !== null &&
      new Date(mensaje.reservado_hasta).getTime() > Date.now()
  }));

  console.table(resumen);
  console.log("Consulta finalizada sin modificar registros.");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exitCode = 1;
});
