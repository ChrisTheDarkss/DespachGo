
import type { WASocket } from "@whiskeysockets/baileys";

import { telefonoAJid } from "../utils/telefono.js";

import {
  type Mensajero,
  NumeroSinWhatsAppError,
  WhatsAppDesconectadoError
} from "./interfaz.js";

export class MensajeroBaileys implements Mensajero {
  constructor(
    private readonly obtenerSocket: () => WASocket | null
  ) {}

  
async enviarMensaje(
  telefono: string,
  texto: string
): Promise<void> {
  const socket = this.obtenerSocket();

  if (!socket) {
    throw new WhatsAppDesconectadoError();
  }

  if (!texto.trim()) {
    throw new Error("El mensaje no puede estar vacío");
  }

  const jid = telefonoAJid(telefono);

  // Consultamos si WhatsApp reconoce el número.
  const resultado = await socket.onWhatsApp(jid);

  const contacto = resultado?.[0];

  // Si WhatsApp devuelve explícitamente que no existe,
  // rechazamos el envío.
  if (contacto && !contacto.exists) {
    throw new NumeroSinWhatsAppError();
  }

  // Si la consulta devuelve [], no asumimos que el
  // número es inválido. Intentamos el envío con el JID.
  const destino = contacto?.jid || jid;

  const mensaje = await socket.sendMessage(
    destino,
    { text: texto }
  );

  if (!mensaje?.key?.id) {
    throw new Error(
      "WhatsApp no devolvió un identificador de mensaje"
    );
  }

  console.log(
    "Mensaje aceptado por Baileys:",
    mensaje.key.id
  );
}

}

