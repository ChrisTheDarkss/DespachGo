import type { MockStop } from "@/src/types/route";

export const mockStops: MockStop[] = [
  {
    id: "demo-1",
    cliente: "Comercial del Sur",
    direccion: "Av. Alemania 0450, Temuco",
    estado: "pendiente",
    confirmacion_cliente: "confirmo",
  },
  {
    id: "demo-2",
    cliente: "María González",
    direccion: "Claro Solar 812, Temuco",
    estado: "pendiente",
    confirmacion_cliente: "sin_respuesta",
  },
  {
    id: "demo-3",
    cliente: "Minimarket Los Robles",
    direccion: "Manuel Rodríguez 1320, Temuco",
    estado: "pendiente",
    confirmacion_cliente: "no_habra_nadie",
  },
];
