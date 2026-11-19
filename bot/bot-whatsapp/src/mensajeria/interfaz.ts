
export interface Mensajero {
  enviarMensaje(
    telefono: string,
    texto: string
  ): Promise<void>;
}

export class WhatsAppDesconectadoError extends Error {
  constructor() {
    super("WhatsApp no está conectado");
    this.name = "WhatsAppDesconectadoError";
  }
}

export class NumeroSinWhatsAppError extends Error {
  constructor() {
    super("El número indicado no tiene WhatsApp");
    this.name = "NumeroSinWhatsAppError";
  }
}
