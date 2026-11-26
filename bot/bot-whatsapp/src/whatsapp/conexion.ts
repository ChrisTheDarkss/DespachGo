
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";

import type { WASocket } from "@whiskeysockets/baileys";

import { escucharRespuestas } from "../respuestas/entrante.js";

import qrcode from "qrcode-terminal";
import pino from "pino";

let socketActivo: WASocket | null = null;

let reconectando = false;
let conectando = false;

export function obtenerSocket(): WASocket | null {
  return socketActivo;
}

export async function conectarWhatsApp(): Promise<void> {
  if (conectando) {
    console.log("La conexión ya está en proceso.");
    return;
  }

  if (socketActivo) {
    console.log("WhatsApp ya está conectado.");
    return;
  }

  conectando = true;

  try {
    const { state, saveCreds } =
      await useMultiFileAuthState("./auth");

    const socket = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      markOnlineOnConnect: false
    });

    // Escuchar respuestas de los clientes.
    escucharRespuestas(socket);

    // Guardar credenciales de autenticación.
    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (connection === "connecting") {
        console.log("Conectando con WhatsApp...");
      }

      if (qr) {
        console.log(
          "\nEscanea este QR con WhatsApp:\n"
        );

        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") {
        socketActivo = socket;
        reconectando = false;

        console.log(
          "WhatsApp conectado correctamente."
        );
      }

      if (connection === "close") {
        if (socketActivo === socket) {
          socketActivo = null;
        }

        const error = lastDisconnect?.error as
          | { output?: { statusCode?: number } }
          | undefined;

        const codigo = error?.output?.statusCode;

        // Mostrar únicamente el código de desconexión.
        console.warn(
          "Conexión de WhatsApp cerrada.",
          "Código:",
          codigo ?? "desconocido"
        );

        if (codigo === DisconnectReason.loggedOut) {
          console.error(
            "La sesión de WhatsApp fue cerrada. " +
            "Es necesario vincular nuevamente."
          );

          return;
        }

        if (!reconectando) {
          reconectando = true;

          console.log(
            "Intentando reconectar en 5 segundos..."
          );

          setTimeout(() => {
            reconectando = false;

            void conectarWhatsApp().catch(
              (error: unknown) => {
                console.error(
                  "No se pudo reconectar:",
                  error instanceof Error
                    ? error.message
                    : "Error desconocido"
                );
              }
            );
          }, 5000);
        }
      }
    });
  } finally {
    conectando = false;
  }
}
