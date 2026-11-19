
import { MensajeroBaileys } from "../mensajeria/baileys.js";
import { obtenerSocket } from "../whatsapp/conexion.js";
import { obtenerSupabase } from "../lib/supabase.js";
import { RepositorioSupabase } from "./repositorioSupabase.js";

const ESPERA_MINIMA = 5000;
const ESPERA_MAXIMA = 10000;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tiempoAleatorio(): number {
  return Math.floor(
    Math.random() * (ESPERA_MAXIMA - ESPERA_MINIMA + 1)
  ) + ESPERA_MINIMA;
}

export class ProcesadorSupabase {
  private ejecutando = false;

  private repositorio = new RepositorioSupabase(
    obtenerSupabase()
  );

  private mensajero = new MensajeroBaileys(obtenerSocket);

  async procesarUnaVez(): Promise<void> {
    if (this.ejecutando) {
      console.log("El procesador ya está ejecutándose.");
      return;
    }

    this.ejecutando = true;

    try {
      // 1. Reservar un mensaje de una ruta activa.
      const mensajes =
        await this.repositorio.reservarMensajes(1);

      if (mensajes.length === 0) {
        console.log("No hay mensajes para procesar.");
        return;
      }

      const mensaje = mensajes[0];

      console.log("Procesando mensaje:", mensaje.id);

      // 2. Comprobar nuevamente el estado de la ruta.
      let estadoRuta: string | null;

      try {
        estadoRuta =
          await this.repositorio.consultarEstadoRuta(
            mensaje.id
          );
      } catch (error) {
        console.error(
          "No se pudo verificar la ruta:",
          error
        );

        // Todavía no se intentó enviar.
        // No hacemos ninguna llamada a Baileys.
        return;
      }

      if (estadoRuta !== "en_curso") {
        await this.repositorio.marcarError(
          mensaje.id,
          "La ruta no está en curso",
          true
        );

        console.log(
          "Mensaje descartado: ruta no activa."
        );
        return;
      }

      // 3. Cambiar a 'revision' antes del envío.
      let iniciado: boolean;

      try {
        iniciado = await this.repositorio.iniciarEnvio(
          mensaje.id
        );
      } catch (error) {
        console.error(
          "No se pudo iniciar el envío:",
          error
        );
        return;
      }

      if (!iniciado) {
        console.log(
          "No se autorizó el inicio del envío."
        );
        return;
      }

      console.log(
        "Mensaje en revisión. Iniciando envío..."
      );

      // 4. Enviar mediante Baileys.
      try {
        await this.mensajero.enviarMensaje(
          mensaje.telefono,
          mensaje.texto
        );
      } catch (error) {
        console.error(
          "Resultado de envío incierto:",
          error
        );

        // NO llamamos a marcarError().
        // Conservamos el estado 'revision'
        // para evitar reintentos automáticos.
        return;
      }

      // 5. Registrar aceptación del envío.
      try {
        await this.repositorio.marcarEnviado(
          mensaje.id
        );

        console.log(
          "Mensaje registrado como enviado."
        );
      } catch (error) {
        console.error(
          "Baileys aceptó el mensaje, pero Supabase no confirmó el registro:",
          error
        );

        // Se mantiene 'revision'.
        // Requiere conciliación manual.
        return;
      }

    } finally {
      this.ejecutando = false;
    }
  }
}
