import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DriverRoute, StopDetail, StopOrder } from "@/src/types/route";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStopStatus(value: unknown) {
  return (
    value === "pendiente" ||
    value === "entregada" ||
    value === "parcial" ||
    value === "fallida_por_reintentar" ||
    value === "fallida" ||
    value === "omitida"
  );
}

function isCustomerConfirmation(value: unknown) {
  return (
    value === "sin_respuesta" ||
    value === "confirmo" ||
    value === "no_habra_nadie" ||
    value === "quiere_hablar" ||
    value === "otro"
  );
}

function isOmissionReason(value: unknown) {
  return (
    value === null ||
    value === "calle_cerrada" ||
    value === "accidente" ||
    value === "cliente_ausente" ||
    value === "otro"
  );
}

function isCachedOrder(value: unknown): value is StopOrder {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.cliente === "string" &&
    typeof value.direccion === "string" &&
    typeof value.comuna === "string" &&
    typeof value.numero_guia === "string" &&
    typeof value.telefono === "string" &&
    (value.latitud === null ||
      (typeof value.latitud === "number" && Number.isFinite(value.latitud))) &&
    (value.longitud === null ||
      (typeof value.longitud === "number" &&
        Number.isFinite(value.longitud))) &&
    (value.notas === null || typeof value.notas === "string")
  );
}

function isCachedRouteStop(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.posicion === "number" &&
    isStopStatus(value.estado) &&
    isCustomerConfirmation(value.confirmacion_cliente) &&
    Array.isArray(value.ordenes) &&
    value.ordenes.every(isCachedOrder)
  );
}

function isCachedStopOrder(value: unknown) {
  return (
    isCachedOrder(value) &&
    "items" in value &&
    Array.isArray(value.items) &&
    value.items.every(
      (item: unknown) =>
        isRecord(item) &&
        typeof item.id === "string" &&
        (item.producto_id === undefined ||
          typeof item.producto_id === "string") &&
        typeof item.producto === "string" &&
        typeof item.unidad === "string" &&
        typeof item.cantidad_pedida === "number" &&
        Number.isFinite(item.cantidad_pedida) &&
        item.cantidad_pedida >= 0,
    )
  );
}

function parseCachedValue<T>(
  value: string | null,
  validate: (parsed: unknown) => parsed is T,
  errorMessage: string,
): Promise<T | null> {
  if (value === null) {
    return Promise.resolve(null);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(errorMessage);
  }
  if (!validate(parsed)) {
    throw new Error(errorMessage);
  }
  return Promise.resolve(parsed);
}

function isDriverRoute(value: unknown): value is DriverRoute {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fecha === "string" &&
    (value.estado === "asignada" || value.estado === "en_curso") &&
    Array.isArray(value.paradas) &&
    value.paradas.every(isCachedRouteStop)
  );
}

function isStopDetail(value: unknown): value is StopDetail {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ruta_id === "string" &&
    typeof value.posicion === "number" &&
    (value.total_paradas === undefined ||
      (typeof value.total_paradas === "number" &&
        Number.isInteger(value.total_paradas) &&
        value.total_paradas > 0)) &&
    isStopStatus(value.estado) &&
    isCustomerConfirmation(value.confirmacion_cliente) &&
    isOmissionReason(value.motivo_omision) &&
    (value.comentario_omision === null ||
      typeof value.comentario_omision === "string") &&
    Array.isArray(value.ordenes) &&
    value.ordenes.every(isCachedStopOrder) &&
    (value.ruta_estado === "asignada" || value.ruta_estado === "en_curso")
  );
}

function routeKey(userId: string, routeDate: string) {
  return `@despachgo/route-cache/${userId}/${routeDate}`;
}

function stopKey(userId: string, stopId: string) {
  return `@despachgo/stop-cache/${userId}/${stopId}`;
}

export async function cacheDriverRoute(
  userId: string,
  routeDate: string,
  route: DriverRoute,
) {
  await AsyncStorage.setItem(
    routeKey(userId, routeDate),
    JSON.stringify(route),
  );
}

export async function getCachedDriverRoute(
  userId: string,
  routeDate: string,
) {
  const cached = await AsyncStorage.getItem(routeKey(userId, routeDate));
  return parseCachedValue(cached, isDriverRoute, "La ruta guardada está dañada.");
}

export async function clearCachedDriverRoute(
  userId: string,
  routeDate: string,
) {
  await AsyncStorage.removeItem(routeKey(userId, routeDate));
}

export async function cacheDriverStop(
  userId: string,
  stop: StopDetail,
) {
  await AsyncStorage.setItem(stopKey(userId, stop.id), JSON.stringify(stop));
}

export async function getCachedDriverStop(
  userId: string,
  stopId: string,
) {
  const cached = await AsyncStorage.getItem(stopKey(userId, stopId));
  return parseCachedValue(
    cached,
    isStopDetail,
    "El detalle guardado de la parada está dañado.",
  );
}
