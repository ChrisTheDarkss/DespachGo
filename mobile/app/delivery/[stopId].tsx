import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GuidePhotoField } from "@/src/components/GuidePhotoField";
import { useAuth } from "@/src/hooks/useAuth";
import {
  getConfirmedRouteLoad,
  type ConfirmedRouteLoad,
} from "@/src/services/driverLoad";
import {
  getDriverStopDetails,
  getTodaysDriverRoute,
} from "@/src/services/driverRoute";
import {
  ItemDifferenceReason,
  queueDelivery,
  QueuedDelivery,
  QueuedDeliveryItem,
  getQueuedDeliveries,
} from "@/src/services/deliveryOutbox";
import {
  getQueuedGuidePhotoPreviewUri,
  persistGuidePhotos,
  releaseQueuedGuidePhotoPreview,
  removePersistedGuidePhotos,
} from "@/src/services/deliveryPhotos";
import { syncPendingDeliveries } from "@/src/services/deliverySync";
import {
  getRouteLoadUsage,
  recordRouteLoadUsage,
} from "@/src/services/routeLoadUsage";
import type { RouteStop, StopDetail } from "@/src/types/route";

const differenceReasons: {
  value: ItemDifferenceReason;
  label: string;
}[] = [
  { value: "faltante", label: "Faltante" },
  { value: "danado", label: "Dañado" },
  { value: "rechazado_por_cliente", label: "Rechazado" },
  { value: "otro", label: "Otro" },
];

const unitFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 2,
});

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getProductKey(
  item: NonNullable<StopDetail["ordenes"][number]["items"]>[number],
  routeLoad: ConfirmedRouteLoad | null,
) {
  const product = routeLoad?.products.find((loadedProduct) =>
    item.producto_id
      ? loadedProduct.producto_id === item.producto_id
      : loadedProduct.nombre === item.producto,
  );
  return product?.producto_id ?? item.producto_id ?? item.producto;
}

function getLoadedTotal(
  item: NonNullable<StopDetail["ordenes"][number]["items"]>[number],
  routeLoad: ConfirmedRouteLoad | null,
) {
  if (!routeLoad) {
    return item.cantidad_pedida;
  }
  const product = routeLoad.products.find((loadedProduct) =>
    item.producto_id
      ? loadedProduct.producto_id === item.producto_id
      : loadedProduct.nombre === item.producto,
  );
  return product?.cantidad_total ?? 0;
}

function getInitialQuantities(
  stop: StopDetail,
  routeLoad: ConfirmedRouteLoad | null,
  consumedByProduct: Record<string, number>,
) {
  const allocatedByProduct: Record<string, number> = {};
  const quantities: Record<string, string> = {};
  for (const order of stop.ordenes) {
    for (const item of order.items) {
      const productKey = getProductKey(item, routeLoad);
      const alreadyAllocated = allocatedByProduct[productKey] ?? 0;
      const remaining =
        getLoadedTotal(item, routeLoad) -
        (consumedByProduct[productKey] ?? 0) -
        alreadyAllocated;
      const quantity = Math.min(
        item.cantidad_pedida,
        Math.max(0, remaining),
      );
      quantities[item.id] = String(quantity);
      allocatedByProduct[productKey] = alreadyAllocated + quantity;
    }
  }
  return quantities;
}

function getItemLimit(
  item: NonNullable<StopDetail["ordenes"][number]["items"]>[number],
  items: NonNullable<StopDetail["ordenes"][number]["items"]>,
  quantities: Record<string, string>,
  routeLoad: ConfirmedRouteLoad | null,
  consumedByProduct: Record<string, number>,
) {
  const productKey = getProductKey(item, routeLoad);
  const alreadyEnteredAtThisStop = items.reduce((total, otherItem) => {
    if (
      otherItem.id === item.id ||
      getProductKey(otherItem, routeLoad) !== productKey
    ) {
      return total;
    }
    const quantity = Number(quantities[otherItem.id] ?? 0);
    return total + (Number.isFinite(quantity) ? Math.max(0, quantity) : 0);
  }, 0);
  return Math.max(
    0,
    Math.min(
      item.cantidad_pedida,
      getLoadedTotal(item, routeLoad) -
        (consumedByProduct[productKey] ?? 0) -
        alreadyEnteredAtThisStop,
    ),
  );
}

function getProductUsage(
  items: NonNullable<StopDetail["ordenes"][number]["items"]>,
  deliveryItems: QueuedDeliveryItem[],
  routeLoad: ConfirmedRouteLoad,
) {
  const usage: Record<string, number> = {};
  for (const deliveryItem of deliveryItems) {
    const orderItem = items.find(
      ({ id }) => id === deliveryItem.orden_item_id,
    );
    if (!orderItem) {
      throw new Error("No se encontró el producto de una cantidad entregada.");
    }
    const productKey = getProductKey(orderItem, routeLoad);
    usage[productKey] =
      (usage[productKey] ?? 0) + deliveryItem.cantidad_entregada;
  }
  return usage;
}

export default function RegisterDeliveryScreen() {
  const { stopId: stopIdParam } = useLocalSearchParams<{ stopId: string }>();
  const stopId = Array.isArray(stopIdParam) ? stopIdParam[0] : stopIdParam;
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [stop, setStop] = useState<StopDetail | null>(null);
  const [routeLoad, setRouteLoad] = useState<ConfirmedRouteLoad | null>(null);
  const [consumedByProduct, setConsumedByProduct] =
    useState<Record<string, number> | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<
    Record<string, ItemDifferenceReason | undefined>
  >({});
  const [openReasonItem, setOpenReasonItem] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, string | undefined>>({});
  const [receivedBy, setReceivedBy] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [hasPendingAction, setHasPendingAction] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [queuedAction, setQueuedAction] = useState<QueuedDelivery | null>(null);
  const [submittedAction, setSubmittedAction] =
    useState<QueuedDelivery | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const [nextStop, setNextStop] = useState<RouteStop | null>(null);
  const [nextStopError, setNextStopError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const retryLock = useRef(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setError(null);
      setIsLoading(true);
      setConsumedByProduct(null);
      if (!stopId || !userId) {
        setError("No se encontró la sesión del conductor o la parada.");
        setIsLoading(false);
        return;
      }

      try {
        const details = await getDriverStopDetails(stopId, userId);
        const [queue, confirmedLoad, network, route] = await Promise.all([
          getQueuedDeliveries(userId),
          getConfirmedRouteLoad(userId, details.ruta_id),
          NetInfo.fetch(),
          getTodaysDriverRoute(userId),
        ]);
        if (!route || route.id !== details.ruta_id) {
          throw new Error("No se encontró la ruta activa de esta parada.");
        }
        if (active) {
          setStop(details);
          setRouteLoad(confirmedLoad);
          setIsOffline(
            network.isConnected === false ||
              network.isInternetReachable === false,
          );
        }
        if (!confirmedLoad) {
          throw new Error(
            "No se encontró la carga confirmada de esta ruta. Vuelve a Inicio y confirma la carga antes de registrar entregas.",
          );
        }
        const consumption = await getRouteLoadUsage(
          userId,
          route,
          queue,
          details,
        );
        if (active) {
          setConsumedByProduct(consumption);
          const pendingAction = queue.find(
            (action) => action.stopId === details.id,
          );
          setQuantities(
            getInitialQuantities(details, confirmedLoad, consumption),
          );
          setHasPendingAction(
            Boolean(pendingAction),
          );
          if (pendingAction) {
            setQueuedAction(pendingAction);
            setSubmittedAction(pendingAction);
            setIsSubmitted(true);
          }
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar la parada para registrar la entrega.",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [stopId, userId]);

  useEffect(() => {
    let active = true;
    const previewUris: string[] = [];

    async function loadPhotoPreviews() {
      if (!queuedAction) {
        setPhotoPreviews({});
        return;
      }

      try {
        const entries = await Promise.all(
          queuedAction.photos.map(async (photo) => {
            const uri = await getQueuedGuidePhotoPreviewUri(photo);
            previewUris.push(uri);
            return [photo.ordenId, uri] as const;
          }),
        );
        if (active) {
          setPhotoPreviews(Object.fromEntries(entries));
        }
      } catch (previewError) {
        if (active) {
          setResultMessage(
            previewError instanceof Error
              ? previewError.message
              : "No se pudo mostrar la foto guardada.",
          );
        }
      }
    }

    void loadPhotoPreviews();
    return () => {
      active = false;
      previewUris.forEach(releaseQueuedGuidePhotoPreview);
    };
  }, [queuedAction]);

  const items = useMemo(
    () => stop?.ordenes.flatMap((order) => order.items) ?? [],
    [stop],
  );
  const isAllZero =
    items.length > 0 &&
    items.every((item) => Number(quantities[item.id] ?? "") === 0);
  const totalRequested = items.reduce(
    (total, item) => total + item.cantidad_pedida,
    0,
  );
  const totalDelivered = items.reduce(
    (total, item) => total + Number(quantities[item.id] ?? 0),
    0,
  );
  const canEdit =
    stop?.estado === "pendiente" &&
    stop.ruta_estado === "en_curso" &&
    routeLoad !== null &&
    consumedByProduct !== null &&
    !hasPendingAction;
  const hasAllGuidePhotos =
    Boolean(stop) &&
    (stop?.ordenes.length ?? 0) > 0 &&
    stop?.ordenes.every((order) => Boolean(photos[order.id]));
  const canSubmit = canEdit && hasAllGuidePhotos;
  const firstOrder = stop?.ordenes[0];

  function updateQuantity(itemId: string, value: string) {
    setQuantities((current) => ({ ...current, [itemId]: value }));
    setError(null);
  }

  function adjustQuantity(itemId: string, adjustment: number, limit: number) {
    const parsedCurrent = Number(quantities[itemId] ?? 0);
    const current = Number.isFinite(parsedCurrent) ? parsedCurrent : 0;
    const next = Math.max(0, Math.min(limit, current + adjustment));
    updateQuantity(itemId, String(next));
  }

  function updatePhoto(orderId: string, uri: string | null) {
    setPhotos((current) => ({ ...current, [orderId]: uri ?? undefined }));
    setError(null);
  }

  function returnToHomeMap() {
    router.replace({ pathname: "/(tabs)", params: { view: "mapa" } });
  }

  function validate(): QueuedDeliveryItem[] | null {
    if (!stop || stop.estado !== "pendiente" || stop.ruta_estado !== "en_curso") {
      setError("Solo puedes registrar entregas en una parada pendiente de una ruta en curso.");
      return null;
    }
    if (hasPendingAction) {
      setError("Esta parada ya tiene una entrega pendiente de sincronización.");
      return null;
    }
    if (items.length === 0) {
      setError("Esta parada no tiene productos para registrar.");
      return null;
    }
    if (!routeLoad || !consumedByProduct) {
      setError(
        "No se pudo determinar el saldo de carga disponible para esta ruta.",
      );
      return null;
    }

    const invalidQuantity = items.find((item) => {
      const value = quantities[item.id]?.trim();
      const quantity = Number(value);
      return (
        !value ||
        !Number.isFinite(quantity) ||
        quantity < 0 ||
        quantity > item.cantidad_pedida
      );
    });
    if (invalidQuantity) {
      setError(
        `La cantidad de ${invalidQuantity.producto} no puede superar lo planificado: ${invalidQuantity.cantidad_pedida}.`,
      );
      return null;
    }

    const requestedByProduct = new Map<
      string,
      { quantity: number; item: (typeof items)[number] }
    >();
    for (const item of items) {
      const productKey = getProductKey(item, routeLoad);
      const product = requestedByProduct.get(productKey);
      const quantity = Number(quantities[item.id]);
      requestedByProduct.set(productKey, {
        quantity: (product?.quantity ?? 0) + quantity,
        item: product?.item ?? item,
      });
    }
    for (const [productKey, requested] of requestedByProduct) {
      const available =
        getLoadedTotal(requested.item, routeLoad) -
        (consumedByProduct[productKey] ?? 0);
      if (requested.quantity > available) {
        setError(
          `La cantidad total de ${requested.item.producto} supera la carga disponible en la ruta (${unitFormatter.format(Math.max(0, available))} ${requested.item.unidad}).`,
        );
        return null;
      }
    }

    const missingReason = items.find(
      (item) =>
        Number(quantities[item.id]) < item.cantidad_pedida &&
        !reasons[item.id],
    );
    if (missingReason) {
      setError(`Selecciona el motivo de la diferencia para ${missingReason.producto}.`);
      return null;
    }
    if (items.every((item) => Number(quantities[item.id]) === 0)) {
      setError("No se entregó ningún producto. Usa Registrar entrega fallida.");
      return null;
    }

    const missingPhoto = stop.ordenes.find((order) => !photos[order.id]);
    if (missingPhoto) {
      setError(`Adjunta una foto de la guía ${missingPhoto.numero_guia}.`);
      return null;
    }

    return items.map((item) => ({
      orden_item_id: item.id,
      cantidad_entregada: Number(quantities[item.id]),
      motivo:
        Number(quantities[item.id]) < item.cantidad_pedida
          ? reasons[item.id] ?? null
          : null,
    }));
  }

  async function handleRetrySync() {
    if (!userId || !queuedAction || retryLock.current) {
      return;
    }

    retryLock.current = true;
    setIsRetrying(true);
    setResultMessage(null);
    try {
      const network = await NetInfo.fetch();
      const offline =
        network.isConnected === false ||
        network.isInternetReachable === false;
      setIsOffline(offline);
      if (offline) {
        setResultMessage("Sin conexión. La entrega y sus fotos siguen guardadas en este dispositivo.");
        return;
      }

      await syncPendingDeliveries(userId, true);
      const pendingAction = (await getQueuedDeliveries(userId)).find(
        (action) => action.stopId === queuedAction.stopId,
      );
      if (pendingAction) {
        setQueuedAction(pendingAction);
        setResultMessage(
          pendingAction.error
            ? `No se pudo completar la sincronización: ${pendingAction.error}`
            : "La entrega sigue pendiente. Se volverá a intentar al recuperar la conexión.",
        );
      } else {
        setQueuedAction(null);
        setResultMessage("La entrega y sus fotos se sincronizaron correctamente.");
        returnToHomeMap();
      }
    } catch (syncError) {
      setResultMessage(
        syncError instanceof Error
          ? `La entrega sigue guardada. ${syncError.message}`
          : "La entrega sigue guardada y pendiente de sincronización.",
      );
    } finally {
      retryLock.current = false;
      setIsRetrying(false);
    }
  }

  useEffect(() => {
    if (!isSubmitted || !queuedAction || !userId) {
      return;
    }

    function handleNetworkChange(state: Awaited<ReturnType<typeof NetInfo.fetch>>) {
      const offline =
        state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
      if (!offline) {
        void handleRetrySync();
      }
    }

    const unsubscribe = NetInfo.addEventListener(handleNetworkChange);
    void NetInfo.fetch()
      .then(handleNetworkChange)
      .catch((networkError) => {
        setResultMessage(
          networkError instanceof Error
            ? networkError.message
            : "No se pudo comprobar la conexión.",
        );
      });

    return unsubscribe;
  }, [isSubmitted, queuedAction?.id, userId]);

  useEffect(() => {
    if (!isSubmitted || !stop || !userId) {
      return;
    }

    const routeUserId = userId;
    const currentStop = stop;
    let active = true;
    async function loadNextStop() {
      setNextStopError(null);
      try {
        const route = await getTodaysDriverRoute(routeUserId);
        const next = route?.paradas
          .filter(
            (routeStop) =>
              routeStop.posicion > currentStop.posicion &&
              routeStop.estado === "pendiente",
          )
          .sort((left, right) => left.posicion - right.posicion)[0];
        if (active) {
          setNextStop(next ?? null);
        }
      } catch (routeError) {
        if (active) {
          setNextStopError(
            routeError instanceof Error
              ? routeError.message
              : "No se pudo cargar la siguiente parada.",
          );
        }
      }
    }

    void loadNextStop();
    return () => {
      active = false;
    };
  }, [isSubmitted, stop, userId]);

  async function handleSubmit() {
    if (submitLock.current || isSubmitting || !userId || !stop) {
      return;
    }
    const deliveryItems = validate();
    if (!deliveryItems) {
      return;
    }

    submitLock.current = true;
    setIsSubmitting(true);
    setError(null);
    let persistedPhotos: Awaited<ReturnType<typeof persistGuidePhotos>> = [];
    let queued = false;
    let actionForResult: QueuedDelivery | null = null;

    try {
      const deliveryId = Crypto.randomUUID();
      persistedPhotos = await persistGuidePhotos(
        deliveryId,
        stop.ordenes.map((order) => ({
          ordenId: order.id,
          uri: photos[order.id] ?? "",
        })),
      );
      const action: QueuedDelivery = {
        id: deliveryId,
        userId,
        stopId: stop.id,
        operation: "delivery",
        items: deliveryItems,
        reason: null,
        comment: null,
        receivedBy: receivedBy.trim() || null,
        photos: persistedPhotos,
        status: "pending",
        registered: false,
        error: null,
        createdAt: new Date().toISOString(),
      };
      actionForResult = action;

      try {
        await queueDelivery(action);
        queued = true;
      } catch (queueError) {
        await removePersistedGuidePhotos(persistedPhotos);
        throw queueError;
      }
      if (!routeLoad) {
        throw new Error("No se encontró la carga confirmada de esta ruta.");
      }
      await recordRouteLoadUsage(
        userId,
        stop.ruta_id,
        deliveryId,
        getProductUsage(items, deliveryItems, routeLoad),
      );

      setHasPendingAction(true);
      setQueuedAction(action);
      setSubmittedAction(action);
      try {
        await syncPendingDeliveries(userId);
        const network = await NetInfo.fetch();
        setIsOffline(
          network.isConnected === false ||
            network.isInternetReachable === false,
        );
        const pending = (await getQueuedDeliveries(userId)).find(
          (entry) => entry.id === deliveryId,
        );
        if (pending?.status === "failed") {
          setQueuedAction(pending);
          setResultMessage(
            `La entrega quedó guardada, pero requiere atención: ${pending.error ?? "no se pudo sincronizar"}`,
          );
        } else if (pending) {
          setQueuedAction(pending);
          setResultMessage(
            null,
          );
        } else {
          setQueuedAction(null);
          returnToHomeMap();
          return;
        }
        setIsSubmitted(true);
      } catch (syncError) {
        const network = await NetInfo.fetch();
        setIsOffline(
          network.isConnected === false ||
            network.isInternetReachable === false,
        );
        setQueuedAction(action);
        setResultMessage(
          `La entrega y sus fotos quedaron guardadas en el dispositivo. No se pudo sincronizar: ${
            syncError instanceof Error
              ? syncError.message
              : "error de conexión"
          }`,
        );
        setIsSubmitted(true);
      }
    } catch (submitError) {
      if (!queued && persistedPhotos.length > 0) {
        await removePersistedGuidePhotos(persistedPhotos);
      }
      if (queued && actionForResult) {
        setHasPendingAction(true);
        setQueuedAction(actionForResult);
        setIsSubmitted(true);
        setResultMessage(
          submitError instanceof Error
            ? `La entrega quedó guardada. ${submitError.message}`
            : "La entrega quedó guardada y sigue pendiente de sincronización.",
        );
        return;
      }
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo guardar la entrega.",
      );
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#176447" />
          <Text style={styles.secondaryText}>Cargando productos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const completedItems = submittedAction?.items ?? [];
  const completedUnits = submittedAction
    ? completedItems.reduce(
        (total, item) => total + item.cantidad_entregada,
        0,
      )
    : totalDelivered;
  const damagedUnits = submittedAction
    ? completedItems.reduce((total, item) => {
        const requested = items.find(
          (stopItem) => stopItem.id === item.orden_item_id,
        )?.cantidad_pedida;
        return item.motivo === "danado"
          ? total + Math.max(0, (requested ?? item.cantidad_entregada) - item.cantidad_entregada)
          : total;
      }, 0)
    : 0;

  if (isSubmitted && stop) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver al inicio en la sección del mapa"
            onPress={returnToHomeMap}
            style={styles.headerBackButton}
          >
            <Text style={styles.headerBackText}>‹</Text>
          </Pressable>
          <Text style={styles.routeCode}>
            RUTA {stop.ruta_id.slice(0, 8).toUpperCase()}
          </Text>
          <Text accessibilityLabel="Ayuda" style={styles.helpIcon}>?</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.resultContent}
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
        >
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>
              Entrega registrada
            </Text>
            <Text style={styles.subtitle}>
              Parada {stop.posicion} · {stop.ordenes[0]?.cliente ?? "Cliente"}
            </Text>
          </View>

          <View style={styles.savedCard}>
            <View style={styles.successIcon}>
              <Text style={styles.successCheck}>✓</Text>
            </View>
            <Text style={styles.savedTitle}>
              {queuedAction ? "Guardada en el dispositivo" : "Entrega sincronizada"}
            </Text>
            <Text style={styles.savedDescription}>
              {unitFormatter.format(completedUnits)}{" "}
              {completedUnits === 1 ? "unidad entregada" : "unidades entregadas"}
              {damagedUnits > 0
                ? ` · ${unitFormatter.format(damagedUnits)} ${damagedUnits === 1 ? "unidad dañada" : "unidades dañadas"}`
                : ""}
            </Text>
            {submittedAction?.receivedBy ? (
              <Text style={styles.savedDescription}>
                Recibido por {submittedAction.receivedBy}
              </Text>
            ) : null}
          </View>

          {queuedAction ? (
            <View style={styles.offlineResultCard}>
              <Text style={styles.offlineResultTitle}>
                {queuedAction.status === "failed"
                  ? "Sincronización pendiente · Requiere atención"
                  : isOffline
                    ? "Sin señal · Pendiente de subir"
                    : queuedAction.registered
                      ? "Fotos pendientes de subir"
                      : "Pendiente de sincronización"}
              </Text>
              <Text style={styles.offlineResultText}>
                La entrega y sus fotos están seguras en este dispositivo. Se
                sincronizarán automáticamente al recuperar conexión.
              </Text>
            </View>
          ) : null}

          {stop.ordenes.map((order) => {
            const photo = queuedAction?.photos.find(
              (queuedPhoto) => queuedPhoto.ordenId === order.id,
            );
            const photoUri =
              photoPreviews[order.id] ?? photos[order.id];
            return (
              <View key={order.id} style={styles.photoCard}>
                <View style={styles.photoHeader}>
                  <Text style={styles.photoTitle}>
                    Guía N.º {order.numero_guia}
                  </Text>
                  {queuedAction ? (
                    <Text style={styles.pendingBadge}>Pendiente de subir</Text>
                  ) : (
                    <Text style={styles.syncedBadge}>Sincronizada</Text>
                  )}
                </View>
                {photoUri ? (
                  <Image
                    accessibilityLabel={`Foto de la guía ${order.numero_guia}`}
                    source={{ uri: photoUri }}
                    style={styles.resultPhoto}
                  />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.photoPlaceholderText}>
                      Foto guardada en el dispositivo
                    </Text>
                  </View>
                )}
                <Text style={styles.photoMeta}>
                  {photo
                    ? `Foto en cola · ${queuedAction?.createdAt ? `Desde las ${formatTime(queuedAction.createdAt)}` : "Pendiente de subir"}`
                    : "Foto de la guía registrada"}
                </Text>
              </View>
            );
          })}

          {queuedAction ? (
            <Pressable
              accessibilityRole="button"
              disabled={isRetrying}
              onPress={() => void handleRetrySync()}
              style={[
                styles.retryButton,
                isRetrying && styles.disabledButton,
              ]}
            >
              {isRetrying ? (
                <ActivityIndicator color="#176447" />
              ) : (
                <Text style={styles.retryButtonText}>↻  Reintentar subida</Text>
              )}
            </Pressable>
          ) : null}

          {nextStop ? (
            <View style={styles.nextStopCard}>
              <Text style={styles.nextStopEyebrow}>SIGUIENTE EN TU RUTA</Text>
              <Text style={styles.nextStopName}>
                {nextStop.ordenes[0]?.cliente ?? "Siguiente parada"}
              </Text>
              <Text style={styles.nextStopMeta}>
                Parada {nextStop.posicion}
                {nextStop.ordenes[0]
                  ? ` · ${nextStop.ordenes[0].direccion}, ${nextStop.ordenes[0].comuna}`
                  : ""}
              </Text>
            </View>
          ) : null}

          {nextStopError ? (
            <Text accessibilityRole="alert" style={styles.resultNotice}>
              {nextStopError}
            </Text>
          ) : null}

          {queuedAction && resultMessage ? (
            <Text accessibilityRole="alert" style={styles.resultNotice}>
              {resultMessage}
            </Text>
          ) : null}

          <Text style={styles.resultFootnote}>
            No vuelvas a registrar esta entrega. Puedes continuar la ruta
            mientras se completa la sincronización.
          </Text>
        </ScrollView>

        <View style={styles.footer}>
          {nextStop ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.replace({
                  pathname: "/stop/[id]",
                  params: { id: nextStop.id },
                })
              }
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>→  Ir a la siguiente parada</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={returnToHomeMap}
            style={nextStop ? styles.secondaryButton : styles.primaryButton}
          >
            <Text
              style={
                nextStop
                  ? styles.secondaryButtonText
                  : styles.primaryButtonText
              }
            >
              Volver al inicio
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver al detalle de la parada"
            disabled={isSubmitting}
            onPress={() => router.back()}
            style={styles.headerBackButton}
          >
            <Text style={styles.headerBackText}>‹</Text>
          </Pressable>
          <Text style={styles.routeCode}>
            {stop ? `RUTA ${stop.ruta_id.slice(0, 8).toUpperCase()}` : "RUTA"}
          </Text>
          <Text accessibilityLabel="Ayuda" style={styles.helpIcon}>?</Text>
        </View>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            Registrar entrega
          </Text>
          <Text style={styles.subtitle}>
            Parada {stop?.posicion ?? ""} · {firstOrder?.cliente ?? "Cliente"}
          </Text>
        </View>
        {stop?.offlineCopy ? (
          <Text style={styles.offlineNotice}>
            Sin conexión. Los datos se guardarán en el dispositivo para sincronizarse después.
          </Text>
        ) : null}
        {hasPendingAction && !isSubmitting ? (
          <Text style={styles.offlineNotice}>
            Esta parada ya tiene un registro pendiente. No vuelvas a enviarlo.
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        {stop?.ordenes.map((order) => {
          const differentItems = order.items.filter(
            (item) => Number(quantities[item.id] ?? 0) < item.cantidad_pedida,
          );
          const differenceCount = differentItems.reduce(
            (total, item) =>
              total +
              item.cantidad_pedida -
              Number(quantities[item.id] ?? 0),
            0,
          );
          return (
            <View key={order.id} style={styles.orderSection}>
              <View style={styles.guideHeader}>
                <Text style={styles.guideNumber}>
                  Guía N.º {order.numero_guia}
                </Text>
                <Text style={styles.guideStatus}>
                  {isSubmitting ? "Enviando..." : "En preparación"}
                </Text>
              </View>
              <Text style={styles.sectionTitle}>Cantidades por producto</Text>
              <Text style={styles.secondaryText}>
                Registra las unidades que recibe el cliente.
              </Text>
              {order.items.map((item) => {
                const quantity = Number(quantities[item.id] ?? 0);
                const limit =
                  routeLoad && consumedByProduct
                    ? getItemLimit(
                        item,
                        items,
                        quantities,
                        routeLoad,
                        consumedByProduct,
                      )
                    : 0;
                return (
                  <View key={item.id} style={styles.productCard}>
                    <View style={styles.productDetails}>
                      <Text style={styles.productName}>{item.producto}</Text>
                      <Text style={styles.productMeta}>
                        Planificado: {item.cantidad_pedida} {item.unidad}
                      </Text>
                      {routeLoad ? (
                        <Text style={styles.loadLimit}>
                          Disponible en ruta: {limit} {item.unidad}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.quantityControl}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Restar una unidad de ${item.producto}`}
                        disabled={!canEdit || isSubmitting || quantity <= 0}
                        onPress={() => adjustQuantity(item.id, -1, limit)}
                        style={[
                          styles.quantityButton,
                          (!canEdit || isSubmitting || quantity <= 0) &&
                            styles.quantityButtonDisabled,
                        ]}
                      >
                        <Text style={styles.quantityButtonText}>−</Text>
                      </Pressable>
                      <TextInput
                        accessibilityLabel={`Cantidad entregada de ${item.producto}`}
                        editable={canEdit && !isSubmitting}
                        keyboardType="decimal-pad"
                        onChangeText={(value) => updateQuantity(item.id, value)}
                        style={styles.quantityValue}
                        textAlign="center"
                        underlineColorAndroid="transparent"
                        value={quantities[item.id] ?? ""}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Agregar una unidad de ${item.producto}`}
                        disabled={!canEdit || isSubmitting || quantity >= limit}
                        onPress={() => adjustQuantity(item.id, 1, limit)}
                        style={[
                          styles.quantityButton,
                          (!canEdit || isSubmitting || quantity >= limit) &&
                            styles.quantityButtonDisabled,
                        ]}
                      >
                        <Text style={styles.quantityButtonText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}

              {differenceCount > 0 ? (
                <View style={styles.differenceNotice}>
                  <Text style={styles.differenceTitle}>
                    ⚠  Diferencia: {unitFormatter.format(differenceCount)}{" "}
                    {differenceCount === 1 ? "unidad menos" : "unidades menos"}
                  </Text>
                  {differentItems.map((item) => (
                    <Text key={item.id} style={styles.differenceText}>
                      {item.producto} · Entregadas{" "}
                      {unitFormatter.format(Number(quantities[item.id] ?? 0))}{" "}
                      de {unitFormatter.format(item.cantidad_pedida)}{" "}
                      {item.unidad}.
                    </Text>
                  ))}
                </View>
              ) : null}

              {differentItems.map((item) => (
                <View key={item.id} style={styles.reasonGroup}>
                  <Text style={styles.reasonLabel}>
                    Motivo de la diferencia *
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Motivo de diferencia para ${item.producto}`}
                    accessibilityState={{ expanded: openReasonItem === item.id }}
                    disabled={!canEdit || isSubmitting}
                    onPress={() =>
                      setOpenReasonItem((current) =>
                        current === item.id ? null : item.id,
                      )
                    }
                    style={styles.reasonSelector}
                  >
                    <Text style={styles.reasonSelectorText}>
                      {differenceReasons.find(
                        (reason) => reason.value === reasons[item.id],
                      )?.label ?? "Selecciona un motivo"}
                    </Text>
                    <Text style={styles.reasonChevron}>⌄</Text>
                  </Pressable>
                  {openReasonItem === item.id ? (
                    <View style={styles.reasonMenu}>
                      {differenceReasons.map((reason) => (
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityState={{
                            checked: reasons[item.id] === reason.value,
                          }}
                          key={reason.value}
                          onPress={() => {
                            setReasons((current) => ({
                              ...current,
                              [item.id]: reason.value,
                            }));
                            setOpenReasonItem(null);
                          }}
                          style={styles.reasonMenuOption}
                        >
                          <Text style={styles.reasonMenuText}>
                            {reason.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}

              <GuidePhotoField
                disabled={!canEdit || isSubmitting}
                label="Foto de la guía firmada *"
                onChange={(uri) => updatePhoto(order.id, uri)}
                photoUri={photos[order.id] ?? null}
              />
            </View>
          );
        })}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recibido por (opcional)</Text>
          <TextInput
            editable={canEdit && !isSubmitting}
            onChangeText={setReceivedBy}
            placeholder="Nombre de quien recibe"
            style={styles.textInput}
            value={receivedBy}
          />
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.sectionTitle}>Total a entregar</Text>
          <Text style={styles.totalValue}>
            {unitFormatter.format(totalDelivered)} /{" "}
            {unitFormatter.format(totalRequested)} un.
          </Text>
        </View>

        {isSubmitting ? (
          <View style={styles.confirmationCard}>
            <Text style={styles.confirmationTitle}>
              ▣  Confirmación en curso
            </Text>
            <Text style={styles.confirmationText}>
              El botón está bloqueado para evitar un doble envío. Espera a que
              termine el registro.
            </Text>
          </View>
        ) : null}

        {isAllZero ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/delivery/failed/[stopId]",
                params: { stopId },
              })
            }
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              Registrar entrega fallida
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit || isSubmitting}
          onPress={() => void handleSubmit()}
          style={[
            styles.primaryButton,
            (!canSubmit || isSubmitting) && styles.disabledButton,
            !hasAllGuidePhotos &&
              !isSubmitting &&
              styles.missingPhotoButton,
          ]}
        >
          {isSubmitting ? (
            <View style={styles.submittingButtonContent}>
              <ActivityIndicator color="#ffffff" />
              <Text style={styles.primaryButtonText}>
                Enviando confirmación...
              </Text>
            </View>
          ) : (
            <Text style={styles.primaryButtonText}>✓  Confirmar entrega</Text>
          )}
        </Pressable>
        <Text style={styles.footerHint}>
          {isSubmitting
            ? "No cierres esta pantalla. No es necesario volver a enviar."
            : !hasAllGuidePhotos
              ? "Adjunta una foto de cada guía firmada para confirmar la entrega."
              : "Revisa las cantidades antes de confirmar la entrega."}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f3f6f3",
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  loading: {
    alignItems: "center",
    flex: 1,
    gap: 14,
    justifyContent: "center",
  },
  content: {
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  resultContent: {
    flexGrow: 1,
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 42,
    paddingHorizontal: 20,
  },
  headerBackButton: {
    justifyContent: "center",
    width: 44,
  },
  headerBackText: {
    color: "#20342a",
    fontSize: 28,
    lineHeight: 32,
  },
  routeCode: {
    color: "#52645a",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  helpIcon: {
    borderColor: "#52645a",
    borderRadius: 10,
    borderWidth: 1,
    color: "#52645a",
    fontSize: 13,
    height: 20,
    overflow: "hidden",
    textAlign: "center",
    width: 20,
  },
  heading: {
    gap: 5,
  },
  title: {
    color: "#20342a",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: "#637168",
    fontSize: 13,
  },
  offlineNotice: {
    backgroundColor: "#fff0e3",
    borderRadius: 10,
    color: "#8c4a1b",
    fontSize: 13,
    lineHeight: 18,
    padding: 12,
  },
  error: {
    color: "#a3352c",
    fontSize: 13,
    lineHeight: 18,
  },
  orderSection: {
    gap: 12,
  },
  guideHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 34,
  },
  guideNumber: {
    color: "#20342a",
    fontSize: 14,
    fontWeight: "700",
  },
  guideStatus: {
    backgroundColor: "#eaf4ee",
    borderRadius: 8,
    color: "#176447",
    fontSize: 10,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sectionTitle: {
    color: "#20342a",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryText: {
    color: "#637168",
    fontSize: 13,
    lineHeight: 18,
  },
  productCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dce5df",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 100,
    padding: 16,
  },
  productDetails: {
    flex: 1,
    gap: 5,
  },
  productName: {
    color: "#20342a",
    fontSize: 15,
    fontWeight: "700",
  },
  productMeta: {
    color: "#637168",
    fontSize: 12,
    lineHeight: 17,
  },
  loadLimit: {
    color: "#637168",
    fontSize: 11,
  },
  quantityControl: {
    alignItems: "center",
    backgroundColor: "#f1f3f1",
    borderRadius: 11,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    minWidth: 112,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  quantityButton: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 24,
  },
  quantityButtonDisabled: {
    opacity: 0.45,
  },
  quantityButtonText: {
    color: "#176447",
    fontSize: 21,
    fontWeight: "500",
    lineHeight: 24,
  },
  quantityValue: {
    backgroundColor: "transparent",
    borderWidth: 0,
    color: "#20342a",
    fontSize: 16,
    minWidth: 24,
    padding: 0,
    textAlign: "center",
    width: 36,
  },
  differenceNotice: {
    backgroundColor: "#fff0e3",
    borderRadius: 13,
    gap: 5,
    padding: 15,
  },
  differenceTitle: {
    color: "#a84f14",
    fontSize: 14,
    fontWeight: "700",
  },
  differenceText: {
    color: "#8c4a1b",
    fontSize: 12,
    lineHeight: 17,
  },
  reasonGroup: {
    gap: 8,
  },
  reasonLabel: {
    color: "#20342a",
    fontSize: 13,
    fontWeight: "700",
  },
  reasonSelector: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dce5df",
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 50,
    paddingHorizontal: 14,
  },
  reasonSelectorText: {
    color: "#35473c",
    fontSize: 14,
  },
  reasonChevron: {
    color: "#68766d",
    fontSize: 22,
  },
  reasonMenu: {
    backgroundColor: "#ffffff",
    borderColor: "#dce5df",
    borderRadius: 11,
    borderWidth: 1,
    overflow: "hidden",
  },
  reasonMenuOption: {
    borderBottomColor: "#edf0ed",
    borderBottomWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  reasonMenuText: {
    color: "#35473c",
    fontSize: 14,
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#dce5df",
    borderRadius: 13,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  textInput: {
    backgroundColor: "#ffffff",
    borderColor: "#d8e0db",
    borderRadius: 10,
    borderWidth: 1,
    color: "#20342a",
    fontSize: 15,
    minHeight: 50,
    padding: 12,
  },
  totalRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalValue: {
    color: "#176447",
    fontSize: 18,
    fontWeight: "800",
  },
  confirmationCard: {
    backgroundColor: "#eaf4ee",
    borderRadius: 13,
    gap: 8,
    padding: 16,
  },
  confirmationTitle: {
    color: "#176447",
    fontSize: 14,
    fontWeight: "700",
  },
  confirmationText: {
    color: "#637168",
    fontSize: 12,
    lineHeight: 17,
  },
  savedCard: {
    alignItems: "center",
    backgroundColor: "#eaf4ee",
    borderRadius: 16,
    gap: 9,
    justifyContent: "center",
    minHeight: 206,
    padding: 20,
  },
  successIcon: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 32,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  successCheck: {
    color: "#ffffff",
    fontSize: 34,
    lineHeight: 38,
  },
  savedTitle: {
    color: "#176447",
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
  },
  savedDescription: {
    color: "#637168",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  offlineResultCard: {
    backgroundColor: "#fff0e3",
    borderRadius: 13,
    gap: 6,
    padding: 16,
  },
  offlineResultTitle: {
    color: "#a84f14",
    fontSize: 14,
    fontWeight: "700",
  },
  offlineResultText: {
    color: "#8c4a1b",
    fontSize: 12,
    lineHeight: 17,
  },
  photoCard: {
    backgroundColor: "#ffffff",
    borderColor: "#dce5df",
    borderRadius: 14,
    borderWidth: 1,
    gap: 11,
    padding: 16,
  },
  photoHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  photoTitle: {
    color: "#20342a",
    fontSize: 14,
    fontWeight: "700",
  },
  pendingBadge: {
    backgroundColor: "#fff0e3",
    borderRadius: 7,
    color: "#a84f14",
    fontSize: 10,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  syncedBadge: {
    backgroundColor: "#eaf4ee",
    borderRadius: 7,
    color: "#176447",
    fontSize: 10,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  resultPhoto: {
    backgroundColor: "#e8ede9",
    borderRadius: 10,
    height: 126,
    width: "100%",
  },
  photoPlaceholder: {
    alignItems: "center",
    backgroundColor: "#f1f3f1",
    borderRadius: 10,
    height: 126,
    justifyContent: "center",
  },
  photoPlaceholderText: {
    color: "#637168",
    fontSize: 12,
  },
  photoMeta: {
    color: "#637168",
    fontSize: 12,
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d8e0db",
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  retryButtonText: {
    color: "#176447",
    fontSize: 14,
    fontWeight: "700",
  },
  nextStopCard: {
    backgroundColor: "#ffffff",
    borderColor: "#dce5df",
    borderRadius: 14,
    borderWidth: 1,
    gap: 9,
    padding: 17,
  },
  nextStopEyebrow: {
    color: "#176447",
    fontSize: 10,
    fontWeight: "700",
  },
  nextStopName: {
    color: "#20342a",
    fontSize: 17,
    fontWeight: "700",
  },
  nextStopMeta: {
    color: "#637168",
    fontSize: 12,
    lineHeight: 18,
  },
  resultNotice: {
    color: "#a3352c",
    fontSize: 12,
    lineHeight: 18,
  },
  resultFootnote: {
    color: "#637168",
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {
    backgroundColor: "#ffffff",
    borderTopColor: "#e3e8e4",
    borderTopWidth: 1,
    gap: 10,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 13,
    justifyContent: "center",
    minHeight: 54,
    padding: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  submittingButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d8e0db",
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
    padding: 12,
  },
  secondaryButtonText: {
    color: "#176447",
    fontSize: 15,
    fontWeight: "700",
  },
  footerHint: {
    color: "#637168",
    fontSize: 11,
    lineHeight: 16,
  },
  disabledButton: {
    opacity: 0.55,
  },
  missingPhotoButton: {
    backgroundColor: "#bfc8c2",
    opacity: 1,
  },
});
