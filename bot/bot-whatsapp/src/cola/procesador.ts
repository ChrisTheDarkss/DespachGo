
import type { Mensajero } from "../mensajeria/interfaz.js";
import { ColaLocal } from "./colaLocal.js";

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ProcesadorCola {
  private ejecutando = false;

  constructor(
    private readonly cola: ColaLocal,
    private readonly mensajero: Mensajero
  ) {}

  async procesar(): Promise<void> {
    if (this.ejecutando) {
      console.log("La cola ya está en ejecución.");
      return;
    }

    this.ejecutando = true;

    try {
      while (true) {
        const mensaje = this.cola.obtenerPendiente();

        if (!mensaje) {
          console.log("No quedan mensajes pendientes.");
          break;
        }

        this.cola.actualizar(mensaje.id, {
          estado: "procesando",
          intentos: mensaje.intentos + 1
        });

        try {
          await this.mensajero.enviarMensaje(
            mensaje.telefono,
            mensaje.texto
          );

          this.cola.actualizar(mensaje.id, {
            estado: "enviado",
            error: undefined
          });

          console.log(`Mensaje ${mensaje.id}: enviado.`);
        } catch (error) {
          const detalle =
            error instanceof Error
              ? error.message
              : String(error);

          this.cola.actualizar(mensaje.id, {
            estado: "error",
            error: detalle
          });

          console.error(
            `Mensaje ${mensaje.id}: ${detalle}`
          );
        }

        if (this.cola.obtenerPendiente()) {
          const pausa =
            5000 + Math.floor(Math.random() * 5001);

          console.log(
            `Esperando ${pausa / 1000} segundos...`
          );

          await esperar(pausa);
        }
      }
    } finally {
      this.ejecutando = false;
    }
  }
}
