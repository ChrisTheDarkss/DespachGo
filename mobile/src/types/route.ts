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
  | "quiere_hablar"
  | "otro";

export type StopOrder = {
  id: string;
  cliente: string;
  direccion: string;
  comuna: string;
  numero_guia: string;
  telefono: string;
  latitud: number | null;
  longitud: number | null;
  notas: string | null;
};

export type RouteStop = {
  id: string;
  posicion: number;
  estado: StopStatus;
  confirmacion_cliente: CustomerConfirmation;
  ordenes: StopOrder[];
};

export type DriverRoute = {
  id: string;
  fecha: string;
  estado: "asignada" | "en_curso";
  paradas: RouteStop[];
  offlineCopy?: boolean;
};

export type OmissionReason =
  | "calle_cerrada"
  | "accidente"
  | "cliente_ausente"
  | "otro";

export type StopDetail = {
  id: string;
  ruta_id: string;
  estado: StopStatus;
  ruta_estado: DriverRoute["estado"];
  posicion: number;
  confirmacion_cliente: CustomerConfirmation;
  motivo_omision: OmissionReason | null;
  comentario_omision: string | null;
  ordenes: (StopOrder & {
    items: {
      id: string;
      producto: string;
      unidad: string;
      cantidad_pedida: number;
    }[];
  })[];
  offlineCopy?: boolean;
};

export type MockStop = Pick<
  RouteStop,
  "id" | "estado" | "confirmacion_cliente"
> & {
  cliente: string;
  direccion: string;
};
