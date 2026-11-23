// Ordenamiento LOCAL de paradas (plan B cuando OpenRouteService no responde):
// vecino más cercano + mejora 2-opt, con distancia en línea recta (haversine).
// Código puro (sin Deno): se puede probar con Node.

export interface Coordenada {
  lat: number
  lng: number
}
export interface Punto extends Coordenada {
  id: string
}

const RADIO_TIERRA_KM = 6371

/** Distancia en línea recta entre dos coordenadas, en kilómetros. */
export function distanciaKm(a: Coordenada, b: Coordenada): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Largo del recorrido abierto: [inicio] -> p1 -> p2 -> ... -> pn. */
export function longitudRuta(orden: Punto[], inicio: Coordenada | null = null): number {
  let total = 0
  let anterior: Coordenada | null = inicio
  for (const p of orden) {
    if (anterior) total += distanciaKm(anterior, p)
    anterior = p
  }
  return total
}

const ID_INICIO = '__inicio__'

/** Vecino más cercano. nodos[0] queda fijo (el inicio o el primer punto). */
function vecinoMasCercano(nodos: Punto[]): Punto[] {
  const restantes = nodos.slice(1)
  const resultado: Punto[] = [nodos[0]]
  while (restantes.length > 0) {
    const ultimo = resultado[resultado.length - 1]
    let mejor = 0
    let mejorDistancia = Infinity
    for (let i = 0; i < restantes.length; i++) {
      const d = distanciaKm(ultimo, restantes[i])
      if (d < mejorDistancia) {
        mejorDistancia = d
        mejor = i
      }
    }
    resultado.push(restantes.splice(mejor, 1)[0])
  }
  return resultado
}

/** Mejora 2-opt para un recorrido ABIERTO con el primer nodo fijo. */
function dosOpt(entrada: Punto[]): Punto[] {
  const nodos = entrada.slice()
  const n = nodos.length
  let mejorado = true
  let vueltas = 0
  while (mejorado && vueltas++ < 1000) {
    mejorado = false
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const hayDespues = k + 1 < n
        const antes = distanciaKm(nodos[i - 1], nodos[i]) + (hayDespues ? distanciaKm(nodos[k], nodos[k + 1]) : 0)
        const despues = distanciaKm(nodos[i - 1], nodos[k]) + (hayDespues ? distanciaKm(nodos[i], nodos[k + 1]) : 0)
        if (despues + 1e-9 < antes) {
          let a = i
          let b = k
          while (a < b) {
            ;[nodos[a], nodos[b]] = [nodos[b], nodos[a]]
            a++
            b--
          }
          mejorado = true
        }
      }
    }
  }
  return nodos
}

/**
 * Ordena las paradas para recorrerlas de forma corta.
 *  - Con `inicio` (la bodega), el recorrido parte de ese punto.
 *  - Sin `inicio`, el primer punto de la lista queda como primera parada.
 */
export function ordenarLocal(puntos: Punto[], inicio: Coordenada | null = null): Punto[] {
  if (puntos.length <= 1) return puntos.slice()
  const nodos: Punto[] = inicio ? [{ id: ID_INICIO, lat: inicio.lat, lng: inicio.lng }, ...puntos] : puntos.slice()
  const mejorado = dosOpt(vecinoMasCercano(nodos))
  return inicio ? mejorado.slice(1) : mejorado
}
