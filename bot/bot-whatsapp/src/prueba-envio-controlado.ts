
import { conectarWhatsApp, obtenerSocket } from "./whatsapp/conexion.js";
import { ProcesadorSupabase } from "./cola/procesadorSupabase.js";
import { obtenerSupabase } from "./lib/supabase.js";

const MENSAJE_PRUEBA =
  "1bab90f4-07c8-4609-8933-8c3e41cd3b88";

const RUTA_PRUEBA =
  "d27c71db-d244-487b-b0ab-c3d78a49047e";

const TELEFONO_PRUEBA = "+56938733544";

async function esperarConexion(): Promise<void> {
  const tiempoMaximo = 60000;
  const inicio = Date.now();

  while (Date.now() - inicio < tiempoMaximo) {
    if (obtenerSocket()?.user) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("WhatsApp no se conectó dentro del tiempo esperado.");
}

async function main(): Promise<void> {
  const supabase = obtenerSupabase();

  // Comprobar que el mensaje de prueba sigue pendiente.
  const { data, error } = await supabase
    .from("mensajes_whatsapp")
    .select("id, telefono, estado, parada_id")
    .eq("id", MENSAJE_PRUEBA)
    .single();

  if (error || !data) {
    throw new Error("No se encontró el mensaje de prueba.");
  }

  if (
    data.estado !== "pendiente" ||
    data.telefono !== TELEFONO_PRUEBA
  ) {
    throw new Error("El mensaje no cumple las condiciones de prueba.");
  }

  const { data: parada, error: errorParada } = await supabase
    .from("paradas")
    .select("ruta_id")
    .eq("id", data.parada_id)
    .single();

  if (
    errorParada ||
    !parada ||
    parada.ruta_id !== RUTA_PRUEBA
  ) {
    throw new Error("El mensaje no pertenece a la ruta de prueba.");
  }

  console.log("Mensaje de prueba validado.");

  // Conectar WhatsApp.
  await conectarWhatsApp();
  await esperarConexion();

  console.log("WhatsApp conectado.");

  // Comprobar que no haya otros pendientes en rutas activas.
  const { data: pendientes, error: errorPendientes } =
    await supabase
      .from("mensajes_whatsapp")
      .select("id, paradas!inner(rutas!inner(estado))")
      .eq("direccion", "enviado")
      .eq("estado", "pendiente")
      .eq("paradas.rutas.estado", "en_curso");

  if (errorPendientes) {
    throw new Error(
      `No se pudo comprobar la cola: ${errorPendientes.message}`
    );
  }

  if (
    pendientes?.length !== 1 ||
    pendientes[0]?.id !== MENSAJE_PRUEBA
  ) {
    throw new Error(
      "La cola contiene otros mensajes pendientes. Prueba cancelada."
    );
  }

  console.log("Cola validada. Procesando mensaje de prueba...");

  const procesador = new ProcesadorSupabase();

  await procesador.procesarUnaVez();

  console.log("Procesamiento finalizado.");
}

main().catch((error: unknown) => {
  console.error(
    "Error en la prueba:",
    error instanceof Error ? error.message : "Error desconocido"
  );

  process.exitCode = 1;
});
