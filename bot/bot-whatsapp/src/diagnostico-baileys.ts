
import "dotenv/config";

import { conectarWhatsApp, obtenerSocket }
  from "./whatsapp/conexion.js";

import { normalizarTelefono }
  from "./utils/telefono.js";

async function main(): Promise<void> {
  const numeroIngresado = process.argv[2];

  if (!numeroIngresado) {
    throw new Error(
      "Debes indicar un número de prueba"
    );
  }

  const telefono = normalizarTelefono(numeroIngresado);

  if (!telefono) {
    throw new Error("Número chileno inválido");
  }

  await conectarWhatsApp();

  const inicio = Date.now();

  while (!obtenerSocket()) {
    if (Date.now() - inicio > 30000) {
      throw new Error("WhatsApp no conectó");
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  const socket = obtenerSocket();

  if (!socket) {
    throw new Error("Socket no disponible");
  }

  const numero = telefono.slice(1);
  const jid = `${numero}@s.whatsapp.net`;

  console.log("=== DIAGNÓSTICO BAILEYS ===");

  const pruebas = [
    { nombre: "Número", destino: numero },
    { nombre: "JID", destino: jid }
  ];

  for (const prueba of pruebas) {
    try {
      const resultado =
        await socket.onWhatsApp(prueba.destino);

      console.log(prueba.nombre, {
        cantidad: resultado?.length ?? 0,
        existe: resultado?.[0]?.exists ?? null,
        tieneJid: Boolean(resultado?.[0]?.jid)
      });
    } catch (error) {
      console.error(
        prueba.nombre,
        error instanceof Error
          ? error.message
          : String(error)
      );
    }
  }

  console.log("Diagnóstico finalizado.");
  console.log("No se enviaron mensajes.");
}

main().catch(console.error);
