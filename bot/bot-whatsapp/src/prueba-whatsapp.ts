
import { conectarWhatsApp, obtenerSocket } from "./whatsapp/conexion.js";
import { MensajeroBaileys } from "./mensajeria/baileys.js";

const mensajero = new MensajeroBaileys(obtenerSocket);

// Reemplaza este número por uno tuyo o autorizado.
const telefonoPrueba = "56938733544";

async function iniciarPrueba(): Promise<void> {
  console.log("Iniciando prueba de WhatsApp...");

  await conectarWhatsApp();

  console.log("Esperando conexión...");

  const tiempoMaximo = 30000;
  const inicio = Date.now();

  while (!obtenerSocket()) {
    if (Date.now() - inicio > tiempoMaximo) {
      throw new Error("WhatsApp no se conectó en 30 segundos");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("WhatsApp conectado. Enviando mensaje...");

  await mensajero.enviarMensaje(
    telefonoPrueba,
    "🚚 Hola, este es un mensaje de prueba del bot de despachos. Tu pedido va en camino."
  );

  console.log("Solicitud de envío completada.");
}

iniciarPrueba().catch((error) => {
  console.error("Error durante la prueba:", error);
  process.exitCode = 1;
});
