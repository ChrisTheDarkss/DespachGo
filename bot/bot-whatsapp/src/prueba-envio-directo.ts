
import "dotenv/config";

import {
  conectarWhatsApp,
  obtenerSocket
} from "./whatsapp/conexion.js";

import { MensajeroBaileys } from "./mensajeria/baileys.js";

async function main(): Promise<void> {
  const telefono = process.argv[2];

  if (!telefono) {
    throw new Error(
      "Debes indicar un número de teléfono"
    );
  }

  await conectarWhatsApp();

  const inicio = Date.now();

  while (!obtenerSocket()) {
    if (Date.now() - inicio > 30000) {
      throw new Error("WhatsApp no conectó en 30 segundos");
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 500)
    );
  }

  const mensajero = new MensajeroBaileys(obtenerSocket);

  await mensajero.enviarMensaje(
    telefono,
    "Hola, esta es una prueba de envío del bot de WhatsApp. No necesitas responder."
  );

  console.log("Envío solicitado correctamente.");
  console.log("Verifica si el mensaje llegó al teléfono.");
}

main().catch((error) => {
  console.error("Error en la prueba:", error);
  process.exitCode = 1;
});
