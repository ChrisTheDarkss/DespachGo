
import { ProcesadorSupabase } from "./procesadorSupabase.js";

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

export class CicloSupabase {
  private activo = false;
  private procesador = new ProcesadorSupabase();

  async iniciar(): Promise<void> {
    if (this.activo) {
      console.log("El ciclo ya está activo.");
      return;
    }

    this.activo = true;
    console.log("Ciclo de Supabase iniciado.");

    try {
      while (this.activo) {
        try {
          await this.procesador.procesarUnaVez();
        } catch (error) {
          console.error(
            "Error durante el procesamiento:",
            error
          );
        }

        if (!this.activo) {
          break;
        }

        const espera = tiempoAleatorio();
        console.log(`Próxima revisión en ${espera} ms`);

        await esperar(espera);
      }
    } finally {
      this.activo = false;
      console.log("Ciclo de Supabase detenido.");
    }
  }

  detener(): void {
    this.activo = false;
  }
}
