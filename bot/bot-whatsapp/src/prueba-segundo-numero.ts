
import "dotenv/config";

import { obtenerSupabase } from "./lib/supabase.js";
import { conectarWhatsApp, obtenerSocket } from "./whatsapp/conexion.js";
import { normalizarTelefono, telefonoAJid } from "./utils/telefono.js";

const ID_MENSAJE = "b0cd9074-386f-45c6-807b-c67bbfbbac14";

async function main(): Promise<void> {
  const supabase = obtenerSupabase();

  const { data, error } = await supabase
    .from("mensajes_whatsapp")
    .select("telefono")
    .eq("id", ID_MENSAJE)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Mensaje no encontrado");
  }

  const telefono = normalizarTelefono(data.telefono);

  if (!telefono) {
    throw new Error("El segundo teléfono tiene un formato inválido");
  }

  await conectarWhatsApp();

  const inicio = Date.now();

  while (!obtenerSocket()) {
    if (Date.now() - inicio > 30000) {
      throw new Error("WhatsApp no se conectó en 30 segundos");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const socket = obtenerSocket();

  if (!socket) {
    throw new Error("No hay conexión de WhatsApp");
  }

 const numero = telefono.replace(/\D/g, "");

const resultado = await socket.onWhatsApp(numero);

console.log("=== DIAGNÓSTICO CON NÚMERO ===");
console.log("Cantidad de resultados:", resultado?.length ?? 0);
console.log("Existe:", resultado?.[0]?.exists ?? null);
console.log("Tiene JID:", Boolean(resultado?.[0]?.jid));
console.log("Formato del teléfono:", {
  longitud: telefono.length,
  comienzaCon569: telefono.startsWith("+569")
});

console.log("Resultado de Baileys:", {
  cantidad: resultado?.length ?? 0,
  existe: resultado?.[0]?.exists ?? null,
  tieneJid: Boolean(resultado?.[0]?.jid)
});

  console.log("=== VERIFICACIÓN DEL SEGUNDO NÚMERO ===");
  console.log("Cantidad de resultados:", resultado?.length ?? 0);
  console.log("Existe en WhatsApp:", resultado?.[0]?.exists ?? false);
  console.log("Tiene identificador:", Boolean(resultado?.[0]?.jid));
  console.log("No se enviaron mensajes ni se modificó Supabase.");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exitCode = 1;
});
