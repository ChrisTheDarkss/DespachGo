import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RouteProductTotal } from "@/src/types/routeProducts";
import { initializeRouteLoadUsage } from "@/src/services/routeLoadUsage";

export type ConfirmedRouteLoad = {
  routeId: string;
  products: RouteProductTotal[];
  confirmedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function storageKey(userId: string, routeId: string) {
  return `@despachgo/route-load/${userId}/${routeId}`;
}

function isRouteProductTotal(value: unknown): value is RouteProductTotal {
  return (
    isRecord(value) &&
    typeof value.producto_id === "string" &&
    typeof value.nombre === "string" &&
    typeof value.unidad === "string" &&
    typeof value.cantidad_total === "number" &&
    Number.isFinite(value.cantidad_total) &&
    value.cantidad_total >= 0
  );
}

export async function getConfirmedRouteLoad(
  userId: string,
  routeId: string,
): Promise<ConfirmedRouteLoad | null> {
  const value = await AsyncStorage.getItem(storageKey(userId, routeId));
  if (value === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("La carga confirmada guardada está dañada.");
  }

  if (
    !isRecord(parsed) ||
    parsed.routeId !== routeId ||
    !Array.isArray(parsed.products) ||
    !parsed.products.every(isRouteProductTotal) ||
    typeof parsed.confirmedAt !== "string"
  ) {
    throw new Error("La carga confirmada guardada tiene un formato inválido.");
  }

  return {
    routeId,
    products: parsed.products,
    confirmedAt: parsed.confirmedAt,
  };
}

export async function confirmRouteLoad(
  userId: string,
  routeId: string,
  products: RouteProductTotal[],
) {
  if (products.length === 0 || !products.every(isRouteProductTotal)) {
    throw new Error("Confirma al menos un producto válido para iniciar la ruta.");
  }

  const load: ConfirmedRouteLoad = {
    routeId,
    products,
    confirmedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(storageKey(userId, routeId), JSON.stringify(load));
  await initializeRouteLoadUsage(userId, routeId);
  return load;
}
