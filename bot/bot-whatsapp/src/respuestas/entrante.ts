
import { procesarRespuesta } from "./procesador.js";
import type { WASocket } from "@whiskeysockets/baileys";
import { resolverTelefonoWhatsApp } from "../utils/resolverTelefonoWhatsApp.js";

export type TipoRespuesta =
  | "confirmo"
  | "no_habra_nadie"
  | "quiere_hablar"
  | "otro";

export interface RespuestaCliente {
  telefono: string;
  mensaje: string;
  tipo: TipoRespuesta;
  fecha: Date;
  idExterno?: string;
}

export function interpretarRespuesta(
  texto: string
): TipoRespuesta {
  switch (texto.trim()) {
    case "1":
      return "confirmo";

    case "2":
      return "no_habra_nadie";

    case "3":
      return "quiere_hablar";

    default:
      return "otro";
  }
}

export function escucharRespuestas(socket: WASocket): void {
  socket.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;

    void (async () => {
      for (const mensaje of messages) {
        if (mensaje.key.fromMe) continue;

        const jid = mensaje.key.remoteJid;

        if (
          !jid ||
          jid.endsWith("@g.us") ||
          jid === "status@broadcast"
        ) {
          continue;
        }

        const contenido = mensaje.message;

        const texto =
          contenido?.conversation ??
          contenido?.extendedTextMessage?.text;

        if (!texto?.trim()) continue;

        // Resolver el número telefónico, incluyendo @lid
        const telefono = await resolverTelefonoWhatsApp(
          socket,
          jid
        );

        if (!telefono) {
          console.log(
            "Respuesta omitida: no se pudo identificar el teléfono."
          );
          continue;
        }

        const respuesta: RespuestaCliente = {
          telefono,
          mensaje: texto.trim(),
          tipo: interpretarRespuesta(texto),
          fecha: new Date(),
          idExterno: mensaje.key.id ?? undefined
        };

        // Por ahora, solo procesamos localmente.
        // Todavía no guardamos respuestas en Supabase.
        procesarRespuesta(respuesta);
      }
    })().catch((error: unknown) => {
      console.error(
        "Error al procesar mensajes entrantes:",
        error instanceof Error ? error.message : "Error desconocido"
      );
    });
  });
}
