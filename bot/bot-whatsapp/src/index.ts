
import "dotenv/config";
import { conectarWhatsApp } from "./whatsapp/conexion.js";

async function iniciarBot(): Promise<void> {
  console.log("==============================");
  console.log(" BOT DE WHATSAPP - DESPACHOS");
  console.log("==============================");

  console.log("Iniciando conexión con WhatsApp...");

  await conectarWhatsApp();
}

iniciarBot().catch((error: unknown) => {
  console.error("Error al iniciar el bot:", error);
  process.exitCode = 1;
});
