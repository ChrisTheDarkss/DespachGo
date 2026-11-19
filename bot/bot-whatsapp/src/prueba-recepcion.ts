
import {
  conectarWhatsApp,
  obtenerSocket
} from "./whatsapp/conexion.js";

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

async function main(): Promise<void> {
  console.log("Iniciando prueba de recepción...");

  await conectarWhatsApp();
  await esperarConexion();

  console.log("WhatsApp conectado correctamente.");
  console.log("Esperando respuesta del cliente...");
  console.log("Envía 1 desde el WhatsApp de prueba.");
  console.log("Presiona Ctrl+C para finalizar.");
}

main().catch((error: unknown) => {
  console.error(
    "Error en la prueba:",
    error instanceof Error
      ? error.message
      : "Error desconocido"
  );

  process.exitCode = 1;
});
