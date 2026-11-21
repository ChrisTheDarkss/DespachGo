
import "dotenv/config";

import {
  conectarWhatsApp,
  obtenerSocket
} from "./whatsapp/conexion.js";

import { CicloSupabase } from "./cola/cicloSupabase.js";

const ciclo = new CicloSupabase();

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

  throw new Error(
    "WhatsApp no se conectó dentro del tiempo esperado."
  );
}

async function iniciarBot(): Promise<void> {
  console.log("==============================");
  console.log(" BOT DE WHATSAPP - DESPACHOS");
  console.log("==============================");

  console.log("Iniciando conexión con WhatsApp...");

  await conectarWhatsApp();
  await esperarConexion();

  console.log("Conexión con WhatsApp confirmada.");

  const envioAutomatico =
    process.env.BOT_ENVIO_AUTOMATICO === "true";

  if (!envioAutomatico) {
    console.log(
      "Envío automático desactivado. " +
      "El bot permanece conectado para recibir respuestas."
    );

    return;
  }

  console.log("Iniciando procesamiento automático...");

  await ciclo.iniciar();
}

iniciarBot().catch((error: unknown) => {
  console.error(
    "Error al iniciar el bot:",
    error instanceof Error
      ? error.message
      : "Error desconocido"
  );

  process.exitCode = 1;
});
