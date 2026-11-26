
import {
  conectarWhatsApp,
  obtenerSocket
} from "./whatsapp/conexion.js";

import { obtenerSupabase } from "./lib/supabase.js";
import { RepositorioSupabase } from "./cola/repositorioSupabase.js";
import { MensajeroBaileys } from "./mensajeria/baileys.js";

const MENSAJE_ID = "1bab90f4-07c8-4609-8933-8c3e41cd3b88";
const PARADA_ID = "e19cde4e-1594-489a-8cfd-33e882cf2209";
const TELEFONO = "+56938733544";

async function esperarConexion(): Promise<void> {
  const inicio = Date.now();

  while (Date.now() - inicio < 60000) {
    if (obtenerSocket()?.user) {
      return;
    }

    await new Promise<void>((resolve) =>
      setTimeout(resolve, 1000)
    );
  }

  throw new Error("WhatsApp no se conectó.");
}

async function main(): Promise<void> {
  const supabase = obtenerSupabase();
  const repositorio = new RepositorioSupabase(supabase);

  // 1. Verificar el mensaje antes de conectar WhatsApp.
  const { data: mensaje, error: errorConsulta } =
    await supabase
      .from("mensajes_whatsapp")
      .select("id, parada_id, telefono, texto, estado")
      .eq("id", MENSAJE_ID)
      .single();

  if (errorConsulta || !mensaje) {
    throw new Error("No se encontró el mensaje de prueba.");
  }

  if (
    mensaje.parada_id !== PARADA_ID ||
    mensaje.telefono !== TELEFONO ||
    mensaje.estado !== "pendiente"
  ) {
    throw new Error(
      "El mensaje no cumple las condiciones de prueba."
    );
  }

  console.log("Mensaje de prueba validado.");

  // 2. Conectar WhatsApp.
  await conectarWhatsApp();
  await esperarConexion();

  console.log("WhatsApp conectado.");

  // 3. Reservar exclusivamente el mensaje de prueba.
  const { data: reservados, error: errorReserva } =
    await supabase.rpc("bot_reservar_mensaje_prueba", {
      p_mensaje: MENSAJE_ID
    });

  if (errorReserva) {
    throw new Error(
      `No se pudo reservar: ${errorReserva.message}`
    );
  }

  if (
    !reservados ||
    reservados.length !== 1 ||
    reservados[0].id !== MENSAJE_ID
  ) {
    throw new Error(
      "No se reservó el mensaje esperado. No se enviará nada."
    );
  }

  console.log("Mensaje reservado exclusivamente.");

  // 4. Autorizar el inicio del envío.
  const iniciado = await repositorio.iniciarEnvio(MENSAJE_ID);

  if (!iniciado) {
    throw new Error(
      "No se autorizó el envío. No se enviará nada."
    );
  }

  console.log("Mensaje en estado revision.");

  // 5. Enviar mediante Baileys.
  const mensajero = new MensajeroBaileys(obtenerSocket);

  try {
    await mensajero.enviarMensaje(
      TELEFONO,
      mensaje.texto
    );
  } catch (error) {
    console.error(
      "Resultado de envío incierto. No se reintentará automáticamente.",
      error
    );
    return;
  }

  // 6. Marcar como enviado en Supabase.
  try {
    await repositorio.marcarEnviado(MENSAJE_ID);

    console.log(
      "Mensaje registrado como enviado en Supabase."
    );
  } catch (error) {
    console.error(
      "WhatsApp aceptó el mensaje, pero Supabase no confirmó el registro.",
      error
    );
  }
}

main().catch((error: unknown) => {
  console.error(
    "Error de prueba:",
    error instanceof Error ? error.message : "Error desconocido"
  );

  process.exitCode = 1;
});

