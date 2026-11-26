
export type EstadoMensaje =
  | "pendiente"
  | "procesando"
  | "enviado"
  | "error";

export interface MensajeCola {
  id: string;
  telefono: string;
  texto: string;
  estado: EstadoMensaje;
  intentos: number;
  error?: string;
}
