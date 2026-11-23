// Pruebas del código puro de las funciones de optimización.
// Con Deno:  deno test --allow-read optimizacion.test.ts
// (también se puede ejecutar con Node/tsx: no usa nada específico de Deno)
import assert from 'node:assert/strict'
import { construirSolicitudORS, ordenDesdeORS } from './ors.ts'
import { distanciaKm, longitudRuta, ordenarLocal, type Punto } from './ruta.ts'
import { leerBodega, MAX_PUNTOS, validarEntradaOptimizar } from './validacion.ts'

// ---------- Generador pseudoaleatorio fijo (las pruebas son repetibles) ----------
function aleatorio(semilla: number) {
  let s = semilla
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}
function puntosAlAzar(n: number, semilla: number): Punto[] {
  const r = aleatorio(semilla)
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    lat: -38.74 + (r() - 0.5) * 0.05,
    lng: -72.59 + (r() - 0.5) * 0.07,
  }))
}
function permutaciones<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs]
  return xs.flatMap((x, i) => permutaciones([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]))
}

// ---------- Distancia ----------
// 0,01° de longitud en Temuco (lat -38,74) son unos 0,87 km
const d = distanciaKm({ lat: -38.74, lng: -72.59 }, { lat: -38.74, lng: -72.58 })
assert.ok(d > 0.85 && d < 0.89, `distancia inesperada: ${d}`)
assert.equal(distanciaKm({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0)

// ---------- ordenarLocal: casos simples ----------
assert.deepEqual(ordenarLocal([]), [])
assert.deepEqual(ordenarLocal([{ id: 'a', lat: 0, lng: 0 }]).map((p) => p.id), ['a'])

// Puntos en una línea, entregados desordenados: debe recorrerlos de un extremo al otro
const linea: Punto[] = [
  { id: 'c', lat: -38.74, lng: -72.58 },
  { id: 'a', lat: -38.74, lng: -72.60 },
  { id: 'd', lat: -38.74, lng: -72.57 },
  { id: 'b', lat: -38.74, lng: -72.59 },
]
// Sin bodega, el primero de la lista ('c') queda primero
assert.equal(ordenarLocal(linea)[0].id, 'c')
// Con la bodega al oeste, debe ir de oeste a este
const conBodega = ordenarLocal(linea, { lat: -38.74, lng: -72.65 }).map((p) => p.id)
assert.deepEqual(conBodega, ['a', 'b', 'c', 'd'])

// ---------- ordenarLocal: propiedades ----------
for (let semilla = 1; semilla <= 40; semilla++) {
  const n = 5 + (semilla % 20)
  const pts = puntosAlAzar(n, semilla)
  const bodega = { lat: -38.7396, lng: -72.5905 }
  const orden = ordenarLocal(pts, bodega)

  // 1) Es una permutación completa, sin repetir ni perder ninguna parada
  assert.equal(orden.length, n)
  assert.deepEqual(orden.map((p) => p.id).sort(), pts.map((p) => p.id).sort())

  // 2) Es más corta o igual que recorrer las paradas en el orden recibido
  assert.ok(
    longitudRuta(orden, bodega) <= longitudRuta(pts, bodega) + 1e-9,
    `semilla ${semilla}: el orden local no mejora al original`,
  )
}

// Cerca del óptimo: con 7 paradas y primer punto fijo, a menos de 15 % del mejor orden posible
for (let semilla = 100; semilla < 125; semilla++) {
  const pts = puntosAlAzar(7, semilla)
  const [primero, ...resto] = pts
  const optimo = Math.min(...permutaciones(resto).map((p) => longitudRuta([primero, ...p])))
  const local = longitudRuta(ordenarLocal(pts))
  assert.ok(local <= optimo * 1.15 + 1e-9, `semilla ${semilla}: ${local.toFixed(3)} vs óptimo ${optimo.toFixed(3)}`)
}

// ---------- Validación de la petición ----------
const ok = validarEntradaOptimizar({ puntos: [{ id: 'a', lat: -38.7, lng: -72.6 }] })
assert.equal(ok.ok, true)

const casosMalos: [unknown, RegExp][] = [
  [null, /objeto JSON/],
  [{}, /puntos/],
  [{ puntos: [] }, /entre 1 y/],
  [{ puntos: [{ id: '', lat: 0, lng: 0 }] }, /sin id|no tiene id/],
  [{ puntos: [{ id: 'a', lat: 0, lng: 0 }, { id: 'a', lat: 1, lng: 1 }] }, /repetido/],
  [{ puntos: [{ id: 'a', lat: 'x', lng: 0 }] }, /coordenadas/],
  [{ puntos: [{ id: 'a', lat: 91, lng: 0 }] }, /coordenadas/],
  [{ puntos: [{ id: 'a', lat: 0, lng: 0 }], inicio: { lat: 'x', lng: 1 } }, /inicio/],
]
for (const [cuerpo, patron] of casosMalos) {
  const r = validarEntradaOptimizar(cuerpo)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.error, patron)
}
const demasiados = { puntos: Array.from({ length: MAX_PUNTOS + 1 }, (_, i) => ({ id: `p${i}`, lat: 0, lng: 0 })) }
assert.equal(validarEntradaOptimizar(demasiados).ok, false)

// Bodega por secretos, y el inicio del cuerpo tiene prioridad sobre ella
assert.deepEqual(leerBodega('-38.74', '-72.59'), { lat: -38.74, lng: -72.59 })
assert.equal(leerBodega(undefined, '-72.59'), null)
assert.equal(leerBodega('abc', '-72.59'), null)
const conBodegaSecreta = validarEntradaOptimizar({ puntos: [{ id: 'a', lat: 0, lng: 0 }] }, { lat: 1, lng: 2 })
assert.ok(conBodegaSecreta.ok && conBodegaSecreta.inicio?.lat === 1)
const conInicioPropio = validarEntradaOptimizar(
  { puntos: [{ id: 'a', lat: 0, lng: 0 }], inicio: { lat: 5, lng: 6 } },
  { lat: 1, lng: 2 },
)
assert.ok(conInicioPropio.ok && conInicioPropio.inicio?.lat === 5)

// ---------- OpenRouteService: solicitud ----------
const pts3: Punto[] = [
  { id: 'x', lat: -38.70, lng: -72.60 },
  { id: 'y', lat: -38.71, lng: -72.61 },
  { id: 'z', lat: -38.72, lng: -72.62 },
]
const sol = construirSolicitudORS(pts3, { lat: -38.74, lng: -72.59 })
assert.deepEqual(sol.jobs[0], { id: 1, location: [-72.6, -38.7] }, 'las coordenadas van como [longitud, latitud]')
assert.deepEqual(sol.vehicles[0].start, [-72.59, -38.74])
assert.deepEqual(construirSolicitudORS(pts3, null).vehicles[0].start, [-72.6, -38.7], 'sin bodega parte del primer punto')

// ---------- OpenRouteService: respuesta ----------
const respuestaOk = {
  routes: [
    {
      steps: [
        { type: 'start', location: [-72.59, -38.74] },
        { type: 'job', id: 3 },
        { type: 'job', id: 1 },
        { type: 'job', id: 2 },
        { type: 'end' },
      ],
    },
  ],
  unassigned: [],
}
assert.deepEqual(ordenDesdeORS(respuestaOk, pts3), ['z', 'x', 'y'])

const respuestasMalas: unknown[] = [
  null,
  {},
  { routes: [] },
  { routes: [{ steps: [{ type: 'job', id: 1 }, { type: 'job', id: 2 }] }] }, // falta una parada
  { routes: [{ steps: [{ type: 'job', id: 1 }, { type: 'job', id: 1 }, { type: 'job', id: 2 }] }] }, // repetida
  { routes: [{ steps: [{ type: 'job', id: 1 }, { type: 'job', id: 2 }, { type: 'job', id: 9 }] }] }, // id inexistente
  { routes: [{ steps: [{ type: 'job', id: 1 }, { type: 'job', id: 2 }, { type: 'job', id: 3 }] }], unassigned: [{ id: 3 }] },
]
for (const mala of respuestasMalas) {
  assert.throws(() => ordenDesdeORS(mala, pts3), undefined, `debía rechazar ${JSON.stringify(mala)}`)
}

console.log('OK  optimizacion (ruta local, validación y OpenRouteService)')
