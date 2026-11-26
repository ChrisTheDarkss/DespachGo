
import type { MensajeCola } from "./tipos.js";

export class ColaLocal {
  private mensajes: MensajeCola[] = [];

  agregar(mensaje: MensajeCola): void {
    const existe = this.mensajes.some(
      (item) => item.id === mensaje.id
    );

    if (existe) {
      console.log(`Mensaje ${mensaje.id} ya existe.`);
      return;
    }

    this.mensajes.push({ ...mensaje });
  }

  obtenerPendiente(): MensajeCola | undefined {
    return this.mensajes.find(
      (mensaje) => mensaje.estado === "pendiente"
    );
  }

  actualizar(
    id: string,
    cambios: Partial<MensajeCola>
  ): void {
    const mensaje = this.mensajes.find(
      (item) => item.id === id
    );

    if (mensaje) {
      Object.assign(mensaje, cambios);
    }
  }

  listar(): MensajeCola[] {
    return this.mensajes.map((mensaje) => ({
      ...mensaje
    }));
  }
}
