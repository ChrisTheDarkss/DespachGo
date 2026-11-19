
import type { WASocket } from "@whiskeysockets/baileys";
import {
  telefonoDesdeJid
} from "./telefono.js";

export async function resolverTelefonoWhatsApp(
  socket: WASocket,
  jid: string
): Promise<string | null> {

  // Caso 1: identificador con número telefónico
  const telefonoDirecto = telefonoDesdeJid(jid);

  if (telefonoDirecto) {
    return telefonoDirecto;
  }

  // Caso 2: identificador LID
  if (!jid.endsWith("@lid")) {
    return null;
  }

  try {
    const numeroJid =
      await socket.signalRepository.lidMapping.getPNForLID(jid);

    if (!numeroJid) {
      return null;
    }

    // Validar el número obtenido desde Baileys
    return telefonoDesdeJid(numeroJid);

  } catch {
    console.error(
      "No se pudo resolver el identificador LID."
    );

    return null;
  }
}
