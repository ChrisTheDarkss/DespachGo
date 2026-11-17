export type RouteProductTotal = {
  producto_id: string;
  nombre: string;
  unidad: string;
  cantidad_total: number;
};

export type RouteStopProducts = {
  parada_id: string;
  posicion: number;
  cliente: string;
  direccion: string;
  guias: string[];
  productos: RouteProductTotal[];
};

export type RouteProductsSummary = {
  paradas: RouteStopProducts[];
  total_general: RouteProductTotal[];
};
