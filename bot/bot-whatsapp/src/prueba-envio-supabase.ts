
import "dotenv/config";

import { obtenerSupabase } from "./lib/supabase.js";
import { RepositorioSupabase } from "./cola/repositorioSupabase.js";
import { MensajeroBaileys } from "./mensajeria/baileys.js";
import { obtenerSocket, conectarWhatsApp } from "./whatsapp/conexion.js";

const MENSAJE_ID =
  "29770518-1c38-4a2f-9f99-2de55d224185";

const RUTA_ID =
  "9ef27947-3545-459b-ac1d-10e6e272e36e";

const TELEFONO = "+56938733544";

const TEXTO =
  "PRUEBA DEL BOT: Este es un mensaje de prueba del sistema de despacho. No corresponde a una entrega real.";

async function esperarConexion(): Promise<void> {
  for (let intento = 0; intento < 30; intento++) {
    const socket = obtenerSocket();

    if (socket?.user) {
      return;
    }

    await new Promise<void>((resolve) =>
      setTimeout(resolve, 1000)
    );
  }

  throw new Error(
    "WhatsApp no se conectó dentro de 30 segundos."
  );
}

async function main(): Promise<void> {
  const supabase = obtenerSupabase();
  const repositorio = new RepositorioSupabase(supabase);
  const mensajero = new MensajeroBaileys(obtenerSocket);

  // 1. Verificar el mensaje y su ruta.
  const { data: mensaje, error } = await supabase
    .from("mensajes_whatsapp")
    .select("id, telefono, texto, estado, intentos")
    .eq("id", MENSAJE_ID)
    .single();

  if (error || !mensaje) {
    throw new Error("No se encontró el mensaje de prueba.");
  }

  const estadoRuta =
    await repositorio.consultarEstadoRuta(MENSAJE_ID);

  if (
    mensaje.telefono !== TELEFONO ||
    mensaje.texto !== TEXTO ||
    mensaje.estado !== "pendiente" ||
    mensaje.intentos !== 0 ||
    estadoRuta !== "en_curso"
  ) {
    throw new Error(
      "El mensaje no cumple las condiciones de prueba."
    );
  }

  console.log("Mensaje de prueba validado.");

  // 2. Conectar WhatsApp antes de reservar.
  await conectarWhatsApp();
  await esperarConexion();

  console.log("WhatsApp conectado.");

  // 3. Reservar exclusivamente este mensaje.
  const { data: reservados, error: errorReserva } =
    await supabase.rpc("bot_reservar_mensaje_prueba", {
      p_mensaje: MENSAJE_ID
    });

  if (errorReserva) {
    throw new Error(errorReserva.message);
  }

  if (!reservados || reservados.length !== 1) {
    throw new Error(
      "No se pudo reservar el mensaje de prueba."
    );
  }

  // 4. Pasar a revision.
  const iniciado =
    await repositorio.iniciarEnvio(MENSAJE_ID);

  if (!iniciado) {
    throw new Error(
      "No se autorizó el inicio del envío."
    );
  }

  console.log("Mensaje en estado revision.");

  // 5. Intentar enviar una sola vez.
  try {
    await mensajero.enviarMensaje(TELEFONO, TEXTO);
  } catch (error) {
    console.error(
      "Resultado del envío incierto.",
      error
    );

    // No reintentar automáticamente.
    // El mensaje permanece en revision.
    return;
  }

  // 6. Registrar la aceptación de Baileys.
  try {
    await repositorio.marcarEnviado(MENSAJE_ID);

    console.log(
      "Mensaje registrado como enviado en Supabase."
    );
  } catch (error) {
    console.error(
      "Baileys aceptó el mensaje, pero falló el registro:",
      error
    );

    // Se conserva revision para conciliación.
  }
}

main().catch((error) => {
  console.error("Error en prueba:", error);
  process.exitCode = 1;
});
