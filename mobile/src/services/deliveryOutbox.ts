import AsyncStorage from "@react-native-async-storage/async-storage";

export type DeliveryReason =
  | "cliente_ausente"
  | "direccion_incorrecta"
  | "rechazo"
  | "problema_vehiculo_transito"
  | "otro";

export type ItemDifferenceReason =
  | "faltante"
  | "danado"
  | "rechazado_por_cliente"
  | "otro";

export type QueuedDeliveryItem = {
  orden_item_id: string;
  cantidad_entregada: number;
  motivo: ItemDifferenceReason | null;
};

export type QueuedGuidePhoto = {
  ordenId: string;
  uri: string;
  mimeType: "image/jpeg";
};

export type QueuedDelivery = {
  id: string;
  userId: string;
  stopId: string;
  operation: "delivery" | "failed";
  items: QueuedDeliveryItem[];
  reason: DeliveryReason | null;
  comment: string | null;
  receivedBy: string | null;
  photos: QueuedGuidePhoto[];
  status: "pending" | "photo_pending" | "failed";
  registered: boolean;
  error: string | null;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDeliveryReason(value: unknown): value is DeliveryReason {
  return (
    value === "cliente_ausente" ||
    value === "direccion_incorrecta" ||
    value === "rechazo" ||
    value === "problema_vehiculo_transito" ||
    value === "otro"
  );
}

function isDifferenceReason(value: unknown): value is ItemDifferenceReason {
  return (
    value === "faltante" ||
    value === "danado" ||
    value === "rechazado_por_cliente" ||
    value === "otro"
  );
}

function isQueuedItem(value: unknown): value is QueuedDeliveryItem {
  return (
    isRecord(value) &&
    typeof value.orden_item_id === "string" &&
    typeof value.cantidad_entregada === "number" &&
    Number.isFinite(value.cantidad_entregada) &&
    value.cantidad_entregada >= 0 &&
    (value.motivo === null || isDifferenceReason(value.motivo))
  );
}

function isQueuedPhoto(value: unknown): value is QueuedGuidePhoto {
  return (
    isRecord(value) &&
    typeof value.ordenId === "string" &&
    typeof value.uri === "string" &&
    value.mimeType === "image/jpeg"
  );
}

function isQueuedDelivery(value: unknown): value is QueuedDelivery {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.userId === "string" &&
    value.userId.length > 0 &&
    typeof value.stopId === "string" &&
    value.stopId.length > 0 &&
    (value.operation === "delivery" || value.operation === "failed") &&
    Array.isArray(value.items) &&
    value.items.every(isQueuedItem) &&
    Array.isArray(value.photos) &&
    value.photos.every(isQueuedPhoto) &&
    (value.reason === null || isDeliveryReason(value.reason)) &&
    (value.comment === null || typeof value.comment === "string") &&
    (value.receivedBy === null || typeof value.receivedBy === "string") &&
    (value.status === "pending" ||
      value.status === "photo_pending" ||
      value.status === "failed") &&
    typeof value.registered === "boolean" &&
    (value.error === null || typeof value.error === "string") &&
    typeof value.createdAt === "string" &&
    (value.operation !== "delivery" || value.items.length > 0) &&
    (value.operation !== "failed" ||
      (value.reason !== null && value.items.length === 0))
  );
}

function storageKey(userId: string) {
  return `@despachgo/delivery-outbox/${userId}`;
}

async function readQueue(userId: string): Promise<QueuedDelivery[]> {
  const value = await AsyncStorage.getItem(storageKey(userId));
  if (value === null) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      "La cola local de entregas está dañada y no se puede sincronizar.",
    );
  }

  if (!Array.isArray(parsed) || !parsed.every(isQueuedDelivery)) {
    throw new Error(
      "La cola local de entregas tiene un formato no reconocido.",
    );
  }

  return parsed;
}

async function writeQueue(userId: string, queue: QueuedDelivery[]) {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(queue));
}

export async function getQueuedDeliveries(userId: string) {
  return readQueue(userId);
}

export async function queueDelivery(action: QueuedDelivery) {
  if (!isQueuedDelivery(action)) {
    throw new Error("No se puede guardar un registro de entrega inválido.");
  }
  const queue = await readQueue(action.userId);
  if (queue.some(({ stopId }) => stopId === action.stopId)) {
    throw new Error(
      "Esta parada ya tiene una entrega pendiente de sincronización.",
    );
  }

  await writeQueue(action.userId, [...queue, action]);
}

export async function updateQueuedDelivery(
  userId: string,
  deliveryId: string,
  update: Partial<
    Pick<QueuedDelivery, "status" | "registered" | "error">
  >,
) {
  const queue = await readQueue(userId);
  const index = queue.findIndex(({ id }) => id === deliveryId);
  if (index < 0) {
    throw new Error("No se encontró la entrega pendiente en el dispositivo.");
  }

  queue[index] = { ...queue[index], ...update };
  await writeQueue(userId, queue);
}

export async function removeQueuedDelivery(
  userId: string,
  deliveryId: string,
) {
  const queue = await readQueue(userId);
  const nextQueue = queue.filter(({ id }) => id !== deliveryId);
  if (nextQueue.length === queue.length) {
    return null;
  }

  const removed = queue.find(({ id }) => id === deliveryId) ?? null;
  await writeQueue(userId, nextQueue);
  return removed;
}
