export type StopStatus =
  | "pendiente"
  | "entregada"
  | "parcial"
  | "fallida_por_reintentar"
  | "fallida"
  | "omitida";

export type CustomerConfirmation =
  | "sin_respuesta"
  | "confirmo"
  | "no_habra_nadie"
  | "quiere_hablar";

export type MockStop = {
  id: string;
  cliente: string;
  direccion: string;
  estado: StopStatus;
  confirmacion_cliente: CustomerConfirmation;
};
