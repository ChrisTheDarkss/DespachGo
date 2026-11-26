import { supabase, supabaseConfigurationError } from "@/src/lib/supabase";
import type { DriverRoute, StopStatus } from "@/src/types/route";

type OrderItemRow = {
  id: string;
  orden_id: string;
  producto_id: string;
  cantidad_pedida: number;
};

type DeliveryRow = {
  id: string;
  parada_id: string;
  resultado: "entregada" | "parcial" | "fallida";
  motivo: string | null;
  comentario: string | null;
  creado_en: string;
};

type DeliveryItemRow = {
  entrega_id: string;
  orden_item_id: string;
  cantidad_entregada: number;
  motivo: string | null;
};

type StopReasonRow = {
  id: string;
  motivo_omision: string | null;
  comentario_omision: string | null;
};

type DeliveryPhotoRow = {
  entrega_id: string;
  orden_id: string | null;
};

export type RouteStopCompletion = {
  stopId: string;
  status: StopStatus;
  plannedUnits: number;
  deliveredUnits: number;
  damagedUnits: number;
  detail: string;
};

export type RouteCompletionDetails = {
  stops: RouteStopCompletion[];
  deliveredUnits: number;
  damagedUnits: number;
  deliveredByProduct: {
    productId: string;
    deliveredUnits: number;
  }[];
  pendingPhotos: number;
};

const reasonLabels: Record<string, string> = {
  cliente_ausente: "Cliente no disponible",
  direccion_incorrecta: "Dirección incorrecta",
  rechazo: "Cliente rechazó el pedido",
  problema_vehiculo_transito: "Problema de vehículo o tránsito",
  calle_cerrada: "Calle cerrada",
  accidente: "Accidente",
  otro: "Otro motivo",
  faltante: "Producto faltante",
  danado: "Producto dañado",
  rechazado_por_cliente: "Rechazado por el cliente",
};

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function getStopDetail(
  status: StopStatus,
  planned: number,
  delivered: number,
  damaged: number,
  delivery: DeliveryRow | undefined,
  stopReason: StopReasonRow | undefined,
) {
  if (status === "entregada" || status === "parcial") {
    if (damaged > 0) {
      return `${delivered} un. · ${damaged} ${damaged === 1 ? "dañada" : "dañadas"}`;
    }
    return `${delivered} ${delivered === 1 ? "unidad entregada" : "unidades entregadas"}`;
  }

  if (status === "fallida" || status === "fallida_por_reintentar") {
    const reason =
      delivery?.comentario?.trim() ||
      reasonLabels[delivery?.motivo ?? ""] ||
      "Entrega fallida";
    return planned > 0
      ? `${reason} · ${planned} un. sin entregar`
      : reason;
  }

  if (status === "omitida") {
    const reason =
      stopReason?.comentario_omision?.trim() ||
      reasonLabels[stopReason?.motivo_omision ?? ""] ||
      "Parada omitida";
    return planned > 0 ? `${reason} · ${planned} un.` : reason;
  }

  return planned > 0 ? `${planned} un. sin entregar` : "Sin visitar";
}

export async function getRouteCompletionDetails(
  route: DriverRoute,
): Promise<RouteCompletionDetails> {
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
      stops: [],
      deliveredUnits: 0,
      damagedUnits: 0,
      deliveredByProduct: [],
      pendingPhotos: 0,
    };
  }

  const [itemsResult, deliveriesResult, stopReasonsResult] = await Promise.all([
    orderIds.length > 0
      ? supabase
          .from("orden_items")
          .select("id, orden_id, producto_id, cantidad_pedida")
          .in("orden_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("entregas")
      .select("id, parada_id, resultado, motivo, comentario, creado_en")
      .in("parada_id", stopIds)
      .order("creado_en", { ascending: false }),
    supabase
      .from("paradas")
      .select("id, motivo_omision, comentario_omision")
      .in("id", stopIds),
  ]);
  throwIfError(itemsResult.error);
  throwIfError(deliveriesResult.error);
  throwIfError(stopReasonsResult.error);

  const orderItems = (itemsResult.data ?? []) as OrderItemRow[];
  const deliveries = (deliveriesResult.data ?? []) as DeliveryRow[];
  const stopReasons = (stopReasonsResult.data ?? []) as StopReasonRow[];
  const latestDeliveryByStop = new Map<string, DeliveryRow>();
  for (const delivery of deliveries) {
    if (!latestDeliveryByStop.has(delivery.parada_id)) {
      latestDeliveryByStop.set(delivery.parada_id, delivery);
    }
  }

  const latestDeliveries = [...latestDeliveryByStop.values()];
  const deliveryIds = latestDeliveries.map(({ id }) => id);
  const [deliveryItemsResult, deliveryPhotosResult] =
    deliveryIds.length > 0
      ? await Promise.all([
          supabase
            .from("entrega_items")
            .select("entrega_id, orden_item_id, cantidad_entregada, motivo")
            .in("entrega_id", deliveryIds),
          supabase
            .from("entrega_fotos")
            .select("entrega_id, orden_id")
            .in("entrega_id", deliveryIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
  throwIfError(deliveryItemsResult.error);
  throwIfError(deliveryPhotosResult.error);

  const deliveryItems = (deliveryItemsResult.data ?? []) as DeliveryItemRow[];
  const deliveryPhotos = (deliveryPhotosResult.data ?? []) as DeliveryPhotoRow[];
  const itemById = new Map(orderItems.map((item) => [item.id, item]));
  const deliveredByProduct = new Map<string, number>();
  for (const item of deliveryItems) {
    const orderItem = itemById.get(item.orden_item_id);
    if (!orderItem) {
      throw new Error(
        "No se encontró el producto asociado a una entrega de la ruta.",
      );
    }
    deliveredByProduct.set(
      orderItem.producto_id,
      (deliveredByProduct.get(orderItem.producto_id) ?? 0) +
        item.cantidad_entregada,
    );
  }
  const stopReasonById = new Map(
    stopReasons.map((stopReason) => [stopReason.id, stopReason]),
  );
  const itemsByDelivery = new Map<string, DeliveryItemRow[]>();
  for (const item of deliveryItems) {
    const items = itemsByDelivery.get(item.entrega_id) ?? [];
    items.push(item);
    itemsByDelivery.set(item.entrega_id, items);
  }
  const photosByDelivery = new Map<string, DeliveryPhotoRow[]>();
  for (const photo of deliveryPhotos) {
    const photos = photosByDelivery.get(photo.entrega_id) ?? [];
    photos.push(photo);
    photosByDelivery.set(photo.entrega_id, photos);
  }

  let pendingPhotos = 0;
  const stops = route.paradas.map((stop) => {
    const stopOrderIds = new Set(stop.ordenes.map(({ id }) => id));
    const plannedItems = orderItems.filter((item) =>
      stopOrderIds.has(item.orden_id),
    );
    const plannedUnits = sum(
      plannedItems.map(({ cantidad_pedida }) => cantidad_pedida),
    );
    const delivery = latestDeliveryByStop.get(stop.id);
    const items = delivery ? itemsByDelivery.get(delivery.id) ?? [] : [];
    const deliveredUnits = sum(
      items.map(({ cantidad_entregada }) => cantidad_entregada),
    );
    const damagedUnits = sum(
      items.flatMap((item) => {
        if (item.motivo !== "danado") {
          return [];
        }
        const orderItem = itemById.get(item.orden_item_id);
        if (!orderItem) {
          throw new Error(
            "No se encontró el producto asociado a una entrega de la ruta.",
          );
        }
        return [
          Math.max(
            0,
            orderItem.cantidad_pedida - item.cantidad_entregada,
          ),
        ];
      }),
    );

    if (
      delivery &&
      (delivery.resultado === "entregada" || delivery.resultado === "parcial")
    ) {
      const expectedPhotoCount = stop.ordenes.length;
      const savedPhotos = photosByDelivery.get(delivery.id) ?? [];
      pendingPhotos += Math.max(0, expectedPhotoCount - savedPhotos.length);
    }

    return {
      stopId: stop.id,
      status: stop.estado,
      plannedUnits,
      deliveredUnits,
      damagedUnits,
      detail: getStopDetail(
        stop.estado,
        plannedUnits,
        deliveredUnits,
        damagedUnits,
        delivery,
        stopReasonById.get(stop.id),
      ),
    };
  });

  return {
    stops,
    deliveredUnits: sum(stops.map(({ deliveredUnits }) => deliveredUnits)),
    damagedUnits: sum(stops.map(({ damagedUnits }) => damagedUnits)),
    deliveredByProduct: [...deliveredByProduct].map(
      ([productId, deliveredUnits]) => ({ productId, deliveredUnits }),
    ),
    pendingPhotos,
  };
}
