/** Colores para distinguir las rutas de un mismo día (se evita el rojo, reservado a peligro). */
export const COLORES_RUTA = [
  '#15803d', // verde
  '#2563eb', // azul
  '#ea580c', // naranjo
  '#9333ea', // morado
  '#0891b2', // turquesa
  '#ca8a04', // mostaza
  '#db2777', // rosado
  '#4d7c0f', // oliva
]

/** Color de la ruta número `indice` (se repite si hay más rutas que colores). */
export function colorDeRuta(indice: number): string {
  return COLORES_RUTA[indice % COLORES_RUTA.length]
}

/** Colores de tramo: pocos, saturados y bien separados entre sí (sin rojo, reservado a peligro). */
const COLORES_TRAMO = [
  '#2563eb', // azul
  '#16a34a', // verde
  '#ea580c', // naranjo
  '#9333ea', // morado
  '#0891b2', // turquesa
  '#ca8a04', // mostaza
  '#db2777', // rosado
  '#475569', // gris azulado
]

/** Color del tramo número `indice` (la línea entre una parada y la siguiente). */
export function colorDeTramo(indice: number): string {
  return COLORES_TRAMO[indice % COLORES_TRAMO.length]
}

/**
 * Grosor del tramo según su prioridad (el orden de visita: el tramo 0 es el más prioritario).
 * Cuando varias rutas pasan por la misma calle, el tramo más prioritario se dibuja encima y
 * más delgado, y los de menor prioridad asoman por los bordes, así se ven todos (máx. 7 px).
 */
export function pesoDeTramo(indice: number): number {
  return 4 + 1.5 * Math.min(indice, 2)
}

export interface TramoDibujable {
  clave: string
  /** Orden de visita del tramo dentro de su ruta (0 = primero). */
  orden: number
  /** Posición de su ruta en la lista, para desempatar. */
  ruta: number
  puntos: [number, number][]
  recto: boolean
}

/** Ordena para dibujar: primero los de menor prioridad, para que los prioritarios queden encima. */
export function ordenarPorPrioridad(tramos: TramoDibujable[]): TramoDibujable[] {
  return [...tramos].sort((a, b) => b.orden - a.orden || b.ruta - a.ruta)
}
