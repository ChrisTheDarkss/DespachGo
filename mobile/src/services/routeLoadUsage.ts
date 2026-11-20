import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { supabase, supabaseConfigurationError } from "@/src/lib/supabase";
import type { QueuedDelivery } from "@/src/services/deliveryOutbox";
import type { DriverRoute, StopDetail } from "@/src/types/route";

type ProductQuantities = Record<string, number>;

type StoredRouteLoadUsage = {
  routeId: string;
  serverDeliveries: Record<string, ProductQuantities>;
  localDeliveries: Record<string, ProductQuantities>;
  orderItemProductIds: Record<string, string>;
};

type OrderItemRow = {
  id: string;
  producto_id: string;
};

type DeliveryRow = {
  id: string;
};

type DeliveryItemRow = {
  entrega_id: string;
  orden_item_id: string;
  cantidad_entregada: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProductQuantities(value: unknown): value is ProductQuantities {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (quantity) =>
        typeof quantity === "number" &&
        Number.isFinite(quantity) &&
        quantity >= 0,
    )
  );
}

function isDeliveryQuantities(
  value: unknown,
): value is Record<string, ProductQuantities> {
  return (
    isRecord(value) &&
    Object.values(value).every(isProductQuantities)
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function isStoredRouteLoadUsage(
  value: unknown,
): value is StoredRouteLoadUsage {
  return (
    isRecord(value) &&
    typeof value.routeId === "string" &&
    isDeliveryQuantities(value.serverDeliveries) &&
    isDeliveryQuantities(value.localDeliveries) &&
    isStringRecord(value.orderItemProductIds)
  );
}

function storageKey(userId: string, routeId: string) {
  return `@despachgo/route-load-usage/${userId}/${routeId}`;
}

function emptyUsage(routeId: string): StoredRouteLoadUsage {
  return {
    routeId,
    serverDeliveries: {},
    localDeliveries: {},
    orderItemProductIds: {},
  };
}

async function readUsage(
  userId: string,
  routeId: string,
): Promise<StoredRouteLoadUsage | null> {
  const value = await AsyncStorage.getItem(storageKey(userId, routeId));
  if (value === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("El consumo de carga guardado está dañado.");
  }

  if (!isStoredRouteLoadUsage(parsed) || parsed.routeId !== routeId) {
    throw new Error("El consumo de carga guardado tiene un formato inválido.");
  }
  return parsed;
}

async function writeUsage(
  userId: string,
  usage: StoredRouteLoadUsage,
) {
  await AsyncStorage.setItem(
    storageKey(userId, usage.routeId),
    JSON.stringify(usage),
  );
}

function addQuantities(target: ProductQuantities, source: ProductQuantities) {
  for (const [productId, quantity] of Object.entries(source)) {
    target[productId] = (target[productId] ?? 0) + quantity;
  }
}

function addCurrentStopItems(
  usage: StoredRouteLoadUsage,
  stop: StopDetail | undefined,
) {
  if (!stop) {
    return;
  }
  if (stop.ruta_id !== usage.routeId) {
    throw new Error("La parada no pertenece a la ruta de esta carga.");
  }

  for (const order of stop.ordenes) {
    for (const item of order.items) {
      usage.orderItemProductIds[item.id] =
        item.producto_id ?? item.producto;
    }
  }
}

function getQueuedDeliveryQuantities(
  action: QueuedDelivery,
  itemProductIds: Record<string, string>,
): ProductQuantities {
  const quantities: ProductQuantities = {};
  for (const item of action.items) {
    const productId = itemProductIds[item.orden_item_id];
    if (!productId) {
      throw new Error(
        "No se pudo asociar una entrega pendiente con su producto. Conéctate a internet para actualizar la ruta.",
      );
    }
    quantities[productId] =
      (quantities[productId] ?? 0) + item.cantidad_entregada;
  }
  return quantities;
}

function getConsumption(
  usage: StoredRouteLoadUsage,
  route: DriverRoute,
  queue: QueuedDelivery[],
): ProductQuantities {
  const consumed: ProductQuantities = {};
  const serverDeliveryIds = new Set(Object.keys(usage.serverDeliveries));
  const countedDeliveryIds = new Set(serverDeliveryIds);

  for (const quantities of Object.values(usage.serverDeliveries)) {
    addQuantities(consumed, quantities);
  }
  for (const [deliveryId, quantities] of Object.entries(
    usage.localDeliveries,
  )) {
    if (!serverDeliveryIds.has(deliveryId)) {
      addQuantities(consumed, quantities);
      countedDeliveryIds.add(deliveryId);
    }
  }

  const routeStopIds = new Set(route.paradas.map(({ id }) => id));
  for (const action of queue) {
    if (
      action.operation !== "delivery" ||
      !routeStopIds.has(action.stopId) ||
      countedDeliveryIds.has(action.id)
    ) {
      continue;
    }
    addQuantities(
      consumed,
      getQueuedDeliveryQuantities(action, usage.orderItemProductIds),
    );
    countedDeliveryIds.add(action.id);
  }

  return consumed;
}

async function getServerUsage(route: DriverRoute) {
  if (!supabase) {
    throw new Error(
      supabaseConfigurationError ?? "Supabase no está configurado.",
    );
  }

  const stopIds = route.paradas.map(({ id }) => id);
  const orderIds = route.paradas.flatMap((stop) =>
    stop.ordenes.map(({ id }) => id),
  );
  if (stopIds.length === 0) {
    return {
      deliveries: {} as Record<string, ProductQuantities>,
      orderItemProductIds: {} as Record<string, string>,
    };
  }

  const [deliveriesResult, orderItemsResult] = await Promise.all([
    supabase
      .from("entregas")
      .select("id")
      .in("parada_id", stopIds)
      .in("resultado", ["entregada", "parcial"]),
    orderIds.length > 0
      ? supabase
          .from("orden_items")
          .select("id, producto_id")
          .in("orden_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (deliveriesResult.error) {
    throw new Error(deliveriesResult.error.message);
  }
  if (orderItemsResult.error) {
    throw new Error(orderItemsResult.error.message);
  }

  const deliveries = (deliveriesResult.data ?? []) as DeliveryRow[];
  const orderItems = (orderItemsResult.data ?? []) as OrderItemRow[];
  const orderItemProductIds = Object.fromEntries(
    orderItems.map(({ id, producto_id }) => [id, producto_id]),
  );
  const deliveryIds = deliveries.map(({ id }) => id);
  if (deliveryIds.length === 0) {
    return {
      deliveries: {} as Record<string, ProductQuantities>,
      orderItemProductIds,
    };
  }

  const { data: deliveryItemRows, error: deliveryItemsError } = await supabase
    .from("entrega_items")
    .select("entrega_id, orden_item_id, cantidad_entregada")
    .in("entrega_id", deliveryIds);
  if (deliveryItemsError) {
    throw new Error(deliveryItemsError.message);
  }

  const deliveriesById: Record<string, ProductQuantities> = Object.fromEntries(
    deliveryIds.map((deliveryId) => [deliveryId, {}]),
  );
  for (const item of (deliveryItemRows ?? []) as DeliveryItemRow[]) {
    const productId = orderItemProductIds[item.orden_item_id];
    if (!productId) {
      throw new Error(
        "No se pudo asociar una entrega registrada con su producto.",
      );
    }
    if (
      !Number.isFinite(item.cantidad_entregada) ||
      item.cantidad_entregada < 0
    ) {
      throw new Error("La ruta contiene una cantidad entregada inválida.");
    }
    const quantities = deliveriesById[item.entrega_id];
    quantities[productId] =
      (quantities[productId] ?? 0) + item.cantidad_entregada;
  }

  return { deliveries: deliveriesById, orderItemProductIds };
}

export async function initializeRouteLoadUsage(
  userId: string,
  routeId: string,
) {
  await writeUsage(userId, emptyUsage(routeId));
}

export async function getRouteLoadUsage(
  userId: string,
  route: DriverRoute,
  queue: QueuedDelivery[],
  currentStop?: StopDetail,
) {
  const network = await NetInfo.fetch();
  const isOffline =
    route.offlineCopy ||
    network.isConnected === false ||
    network.isInternetReachable === false;
  let usage = await readUsage(userId, route.id);
  if (!usage && isOffline) {
    throw new Error(
      "No hay un saldo de carga guardado para esta ruta. Conéctate a internet para actualizarlo antes de registrar una entrega.",
    );
  }
  usage ??= emptyUsage(route.id);
  addCurrentStopItems(usage, currentStop);

  if (!isOffline) {
    const serverUsage = await getServerUsage(route);
    const serverDeliveryIds = new Set(Object.keys(serverUsage.deliveries));
    usage = {
      routeId: route.id,
      serverDeliveries: serverUsage.deliveries,
      localDeliveries: Object.fromEntries(
        Object.entries(usage.localDeliveries).filter(
          ([deliveryId]) => !serverDeliveryIds.has(deliveryId),
        ),
      ),
      orderItemProductIds: {
        ...usage.orderItemProductIds,
        ...serverUsage.orderItemProductIds,
      },
    };
  }

  await writeUsage(userId, usage);
  return getConsumption(usage, route, queue);
}

export async function recordRouteLoadUsage(
  userId: string,
  routeId: string,
  deliveryId: string,
  quantities: ProductQuantities,
) {
  const usage = await readUsage(userId, routeId);
  if (!usage) {
    throw new Error(
      "No se pudo guardar el consumo de carga de esta ruta.",
    );
  }
  const existing = usage.localDeliveries[deliveryId];
  if (existing) {
    const sameUsage =
      JSON.stringify(existing) === JSON.stringify(quantities);
    if (!sameUsage) {
      throw new Error(
        "La entrega ya tiene un consumo de carga distinto guardado.",
      );
    }
    return;
  }
  usage.localDeliveries[deliveryId] = quantities;
  await writeUsage(userId, usage);
}
