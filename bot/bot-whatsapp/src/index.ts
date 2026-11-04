
import "dotenv/config";

async function iniciarBot(): Promise<void> {
  console.log("==============================");
  console.log("BOT DE WHATSAPP - DESPACHOS");
  console.log("==============================");

  console.log("Iniciando sistema...");
  console.log("Node.js:", process.version);
  console.log("Bot iniciado correctamente.");
}

iniciarBot().catch((error: unknown) => {
  console.error("Error al iniciar:", error);
  process.exitCode = 1;
});
