import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/hooks/useAuth";
import { useDeliveryOutbox } from "@/src/hooks/useDeliveryOutbox";
import { useGpsTracking } from "@/src/hooks/useGpsTracking";
import {
  getConfirmedRouteLoad,
  type ConfirmedRouteLoad,
} from "@/src/services/driverLoad";
import {
  finalizeDriverRoute,
  getTodaysDriverRoute,
  type RouteFinalSummary,
} from "@/src/services/driverRoute";
import {
  getRouteCompletionDetails,
  type RouteCompletionDetails,
} from "@/src/services/routeCompletion";
import {
  getDrivingRoute,
  type RoutingPoint,
} from "@/src/services/driverRouting";
import {
  stopLocationTracking,
  syncGpsLocation,
} from "@/src/services/gpsTracking";
import type { DriverRoute } from "@/src/types/route";

type RouteCounts = {
  entregadas: number;
  parciales: number;
  fallidas: number;
  omitidas: number;
  sin_visitar: number;
};

function getRouteCounts(route: DriverRoute): RouteCounts {
  return route.paradas.reduce<RouteCounts>(
    (counts, stop) => {
      if (stop.estado === "entregada") {
        counts.entregadas += 1;
      } else if (stop.estado === "parcial") {
        counts.parciales += 1;
      } else if (
        stop.estado === "fallida" ||
        stop.estado === "fallida_por_reintentar"
      ) {
        counts.fallidas += 1;
      } else if (stop.estado === "omitida") {
        counts.omitidas += 1;
      } else {
        counts.sin_visitar += 1;
      }
      return counts;
    },
    {
      entregadas: 0,
      parciales: 0,
      fallidas: 0,
      omitidas: 0,
      sin_visitar: 0,
    },
  );
}

function getRoutePoints(route: DriverRoute): RoutingPoint[] {
  return route.paradas.flatMap((stop) => {
    const order = stop.ordenes.find(
      ({ latitud, longitud }) =>
        typeof latitud === "number" &&
        Number.isFinite(latitud) &&
        typeof longitud === "number" &&
        Number.isFinite(longitud),
    );
    if (!order || order.latitud === null || order.longitud === null) {
      return [];
    }

    return [
      {
        id: stop.id,
        number: stop.posicion,
        cliente: order.cliente,
        latitud: order.latitud,
        longitud: order.longitud,
      },
    ];
  });
}

function formatUnits(value: number) {
  return new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 2,
  }).format(value);
}

function roundUnits(value: number) {
  return Number(value.toFixed(2));
}

function formatClock(value: Date) {
  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatElapsed(startedAt: string | null | undefined, now: Date) {
  if (!startedAt) {
    return "Duración no disponible";
  }
  const start = new Date(startedAt);
  if (!Number.isFinite(start.getTime())) {
    return "Duración no disponible";
  }
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now.getTime() - start.getTime()) / 60_000),
  );
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function formatRouteDate(date: string) {
  const parsedDate = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(parsedDate.getTime())) {
    return date;
  }
  const formatted = new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsedDate);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function getStopStatusLabel(status: string) {
  switch (status) {
    case "entregada":
      return "Entregada";
    case "parcial":
      return "Parcial";
    case "fallida":
    case "fallida_por_reintentar":
      return "Fallida";
    case "omitida":
      return "Omitida";
    default:
      return "Pendiente";
  }
}

export default function RouteSummaryScreen() {
  const { routeId: routeIdParam } = useLocalSearchParams<{
    routeId: string;
  }>();
  const routeId = Array.isArray(routeIdParam)
    ? routeIdParam[0]
    : routeIdParam;
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const {
    queue: pendingDeliveries,
    error: outboxError,
    isLoading: isOutboxLoading,
    refresh: refreshOutbox,
  } = useDeliveryOutbox(userId);
  const {
    state: gpsState,
    error: gpsReadError,
    refresh: refreshGps,
  } = useGpsTracking(userId, routeId);
  const [route, setRoute] = useState<DriverRoute | null>(null);
  const [completionDetails, setCompletionDetails] =
    useState<RouteCompletionDetails | null>(null);
  const [confirmedLoad, setConfirmedLoad] =
    useState<ConfirmedRouteLoad | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isConfirmationVisible, setIsConfirmationVisible] = useState(false);
  const [finalSummary, setFinalSummary] =
    useState<RouteFinalSummary | null>(null);
  const [trackingStopError, setTrackingStopError] = useState<string | null>(
    null,
  );
  const [gpsSyncWarning, setGpsSyncWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finalizeLock = useRef(false);

  const loadRoute = useCallback(async () => {
    if (!userId || !routeId) {
      setError("No se encontró la sesión del conductor o la ruta.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCompletionDetails(null);
    setConfirmedLoad(null);
    try {
      const currentRoute = await getTodaysDriverRoute(userId);
      if (!currentRoute || currentRoute.id !== routeId) {
        throw new Error("La ruta ya no está disponible para finalizar.");
      }
      setRoute(currentRoute);
      if (currentRoute.offlineCopy) {
        setError("Conéctate a internet para revisar y finalizar la ruta.");
        return;
      }
      if (currentRoute.estado !== "en_curso") {
        setError("Solo se puede finalizar una ruta que esté en curso.");
        return;
      }
      const [details, load] = await Promise.all([
        getRouteCompletionDetails(currentRoute),
        getConfirmedRouteLoad(userId, currentRoute.id),
      ]);
      setCompletionDetails(details);
      setConfirmedLoad(load);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar el detalle de cierre de la ruta.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [routeId, userId]);

  useEffect(() => {
    void loadRoute();
  }, [loadRoute]);

  const counts = useMemo(
    () => (route ? getRouteCounts(route) : null),
    [route],
  );
  const routePoints = useMemo(
    () => (route ? getRoutePoints(route) : []),
    [route],
  );
  const pointIds = routePoints
    .map(({ id, latitud, longitud }) => `${id}:${latitud}:${longitud}`)
    .join(",");

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    setDistanceMeters(null);
    setDistanceError(null);
    if (routePoints.length < 2 || route?.offlineCopy) {
      return () => {
        active = false;
      };
    }

    void getDrivingRoute(routePoints)
      .then((result) => {
        if (active) {
          setDistanceMeters(result?.distanceMeters ?? null);
        }
      })
      .catch((distanceLoadError: unknown) => {
        if (active) {
          setDistanceError(
            distanceLoadError instanceof Error
              ? distanceLoadError.message
              : "No se pudo calcular la distancia del recorrido.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [pointIds, route?.offlineCopy, routePoints]);

  const pendingUnregisteredDeliveries = pendingDeliveries.filter(
    ({ registered }) => !registered,
  );

  async function handleFinalize() {
    if (
      finalizeLock.current ||
      isFinalizing ||
      isOutboxLoading ||
      Boolean(outboxError) ||
      !route ||
      !userId ||
      route.offlineCopy ||
      route.estado !== "en_curso"
    ) {
      return;
    }
    if (pendingUnregisteredDeliveries.length > 0) {
      setError(
        "Sincroniza primero los registros de entrega pendientes. Las fotos ya registradas pueden terminar de subirse después del cierre.",
      );
      setIsConfirmationVisible(false);
      return;
    }

    finalizeLock.current = true;
    setIsFinalizing(true);
    setError(null);
    setTrackingStopError(null);
    setGpsSyncWarning(null);
    try {
      if (!(await syncGpsLocation(userId))) {
        setGpsSyncWarning(
          "La última ubicación GPS sigue pendiente de subir. La ruta se cerró y el seguimiento se detuvo.",
        );
      }
      await refreshGps();
      const result = await finalizeDriverRoute(route.id);
      setFinalSummary(result);
      setIsConfirmationVisible(false);

      try {
        await stopLocationTracking(userId);
        await refreshGps();
      } catch (stopError) {
        const message =
          stopError instanceof Error
            ? stopError.message
            : "No se pudo detener el servicio de ubicación.";
        setTrackingStopError(
          `${message} El seguimiento local fue desactivado; revisa el estado del dispositivo.`,
        );
      }
    } catch (finalizeError) {
      setError(
        finalizeError instanceof Error
          ? finalizeError.message
          : "No se pudo finalizar la ruta.",
      );
    } finally {
      finalizeLock.current = false;
      setIsFinalizing(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#176447" />
          <Text style={styles.secondaryText}>Preparando el resumen...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (finalSummary) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>RUTA FINALIZADA</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Resumen final
          </Text>
          <View style={styles.card}>
            <SummaryRow label="Entregadas" value={finalSummary.entregadas} />
            <SummaryRow label="Parciales" value={finalSummary.parciales} />
            <SummaryRow label="Fallidas" value={finalSummary.fallidas} />
            <SummaryRow label="Omitidas" value={finalSummary.omitidas} />
            <SummaryRow
              label="Sin visitar"
              value={finalSummary.sin_visitar}
            />
            {finalSummary.entregas_sin_foto > 0 ? (
              <Text style={styles.warning}>
                {finalSummary.entregas_sin_foto}{" "}
                {finalSummary.entregas_sin_foto === 1
                  ? "entrega quedó"
                  : "entregas quedaron"}{" "}
                sin foto registrada.
              </Text>
            ) : null}
          </View>
          {trackingStopError ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {trackingStopError}
            </Text>
          ) : null}
          {gpsSyncWarning ? (
            <Text style={styles.warning}>{gpsSyncWarning}</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/(tabs)")}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Volver a mi ruta</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const canFinalize =
    route?.estado === "en_curso" &&
    !route.offlineCopy &&
    !isOutboxLoading &&
    !outboxError &&
    pendingUnregisteredDeliveries.length === 0 &&
    completionDetails !== null;
  const totalLoadedUnits =
    confirmedLoad?.products.reduce(
      (total, product) => total + product.cantidad_total,
      0,
    ) ?? null;
  const totalReturnedUnits =
    totalLoadedUnits === null || !completionDetails
      ? null
      : totalLoadedUnits - completionDetails.deliveredUnits;
  const unitsToReturn =
    totalReturnedUnits === null
      ? null
      : Math.max(0, totalReturnedUnits);
  const undeliveredUnits =
    unitsToReturn === null || !completionDetails
      ? null
      : Math.max(0, unitsToReturn - completionDetails.damagedUnits);
  const loadedUnitsByProduct = new Map(
    confirmedLoad?.products.map(({ producto_id, cantidad_total }) => [
      producto_id,
      cantidad_total,
    ]) ?? [],
  );
  const deliveredUnitsByProduct = new Map(
    completionDetails?.deliveredByProduct.map(
      ({ productId, deliveredUnits }) => [productId, deliveredUnits],
    ) ?? [],
  );
  const productsToReturn =
    confirmedLoad?.products.flatMap((product) => {
      const quantityToReturn = roundUnits(
        product.cantidad_total -
          (deliveredUnitsByProduct.get(product.producto_id) ?? 0),
      );
      return quantityToReturn > 0
        ? [{ ...product, quantityToReturn }]
        : [];
    }) ?? [];
  const productDeliveryMismatch =
    confirmedLoad !== null &&
    (completionDetails?.deliveredByProduct.some(({ productId, deliveredUnits }) => {
      const loadedUnits = loadedUnitsByProduct.get(productId);
      return (
        loadedUnits === undefined ||
        roundUnits(deliveredUnits) > roundUnits(loadedUnits)
      );
    }) ??
      false);
  const startTime =
    route?.iniciada_en && Number.isFinite(new Date(route.iniciada_en).getTime())
      ? formatClock(new Date(route.iniciada_en))
      : "—";
  const endTime = formatClock(now);
  const totalStops = route?.paradas.length ?? 0;
  const managedStops = counts
    ? totalStops - counts.sin_visitar
    : 0;
  const deliveredStops = counts
    ? counts.entregadas + counts.parciales
    : 0;
  const pendingPhotoCount = completionDetails?.pendingPhotos ?? 0;
  const reconciliationMismatch =
    totalReturnedUnits !== null &&
    completionDetails !== null &&
    (totalReturnedUnits < 0 ||
      completionDetails.damagedUnits > Math.max(0, totalReturnedUnits) ||
      productDeliveryMismatch);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver a mi ruta"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.routeCode}>
            <Text style={styles.routeCodeText}>
              {route ? `RUTA ${route.id.slice(0, 8).toUpperCase()}` : "RUTA"}
            </Text>
          </View>
          <View style={styles.topBarSpacer} />
        </View>

        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            Terminaste el recorrido
          </Text>
          <Text style={styles.subtitle}>
            {route ? formatRouteDate(route.fecha) : ""}
          </Text>
        </View>

        {route && counts ? (
          <View style={styles.routeCard}>
            <View style={styles.routeCardHeader}>
              <View style={styles.routeIcon}>
                <Text style={styles.routeIconText}>✓</Text>
              </View>
              <View style={styles.routeCardHeading}>
                <Text style={styles.routeCardTitle}>Ruta completada</Text>
                <Text style={styles.routeCardSubtitle}>
                  {managedStops} de {totalStops} paradas gestionadas
                </Text>
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{deliveredStops}</Text>
                <Text style={styles.statLabel}>Entregadas</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{counts.fallidas}</Text>
                <Text style={styles.statLabel}>Fallidas</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{counts.omitidas}</Text>
                <Text style={styles.statLabel}>Omitidas</Text>
              </View>
            </View>
            <View style={styles.routeMeta}>
              <View style={styles.routeMetaItem}>
                <Text style={styles.metaIcon}>◷</Text>
                <Text style={styles.routeMetaText}>
                  {startTime} – {endTime} ·{" "}
                  {formatElapsed(route.iniciada_en, now)}
                </Text>
              </View>
              <View style={styles.routeMetaItem}>
                <Text style={styles.metaIcon}>↗</Text>
                <Text style={styles.routeMetaText}>
                  {distanceMeters === null
                    ? "Distancia no disponible"
                    : `${(distanceMeters / 1000).toFixed(1)} km recorridos`}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {route && pendingPhotoCount > 0 ? (
          <View style={styles.pendingBanner}>
            <View style={styles.pendingIcon}>
              <Text style={styles.pendingIconText}>!</Text>
            </View>
            <View style={styles.pendingMessage}>
              <Text style={styles.pendingTitle}>
                {pendingPhotoCount}{" "}
                {pendingPhotoCount === 1
                  ? "foto pendiente de subir"
                  : "fotos pendientes de subir"}
              </Text>
              <Text style={styles.pendingDescription}>
                {pendingUnregisteredDeliveries.length === 0
                  ? "Puedes finalizar; se enviarán al recuperar la conexión."
                  : "Las entregas deben sincronizarse antes de finalizar la ruta."}
              </Text>
            </View>
          </View>
        ) : null}

        {route && pendingUnregisteredDeliveries.length > 0 ? (
          <View style={styles.pendingRecordBanner}>
            <Text style={styles.warning}>
              {pendingUnregisteredDeliveries.length === 1
                ? "Hay una entrega guardada en este dispositivo que aún no se registra en el servidor."
                : `Hay ${pendingUnregisteredDeliveries.length} entregas guardadas en este dispositivo que aún no se registran en el servidor.`}
            </Text>
          </View>
        ) : null}

        {route ? (
          <>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Resumen de paradas</Text>
              <Text style={styles.sectionCount}>{totalStops}</Text>
            </View>
            {completionDetails ? (
              <View style={styles.stopsCard}>
                {route.paradas.map((stop, index) => {
                  const details = completionDetails.stops.find(
                    ({ stopId }) => stopId === stop.id,
                  );
                  const isDelivered =
                    stop.estado === "entregada" || stop.estado === "parcial";
                  const isFailed =
                    stop.estado === "fallida" ||
                    stop.estado === "fallida_por_reintentar";
                  const isOmitted = stop.estado === "omitida";
                  const customer =
                    stop.ordenes.length > 1
                      ? `${stop.ordenes[0]?.cliente ?? "Cliente"} +${stop.ordenes.length - 1}`
                      : stop.ordenes[0]?.cliente ?? "Cliente no disponible";
                  return (
                    <View
                      key={stop.id}
                      style={[
                        styles.stopRow,
                        index === route.paradas.length - 1 &&
                          styles.lastStopRow,
                      ]}
                    >
                      <View
                        style={[
                          styles.stopNumber,
                          isDelivered
                            ? styles.stopNumberDelivered
                            : isFailed
                              ? styles.stopNumberFailed
                              : isOmitted
                                ? styles.stopNumberOmitted
                                : styles.stopNumberPending,
                        ]}
                      >
                        <Text
                          style={[
                            styles.stopNumberText,
                            isDelivered
                              ? styles.stopNumberTextDelivered
                              : isFailed
                                ? styles.stopNumberTextFailed
                                : isOmitted
                                  ? styles.stopNumberTextOmitted
                                  : styles.stopNumberTextPending,
                          ]}
                        >
                          {stop.posicion}
                        </Text>
                      </View>
                      <View style={styles.stopDetails}>
                        <Text style={styles.stopCustomer} numberOfLines={1}>
                          {customer}
                        </Text>
                        <Text style={styles.stopDescription} numberOfLines={2}>
                          {details?.detail ?? "Detalle no disponible"}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.stopBadge,
                          isDelivered
                            ? styles.deliveredBadge
                            : isFailed
                              ? styles.failedBadge
                              : isOmitted
                                ? styles.omittedBadge
                                : styles.pendingBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.stopBadgeText,
                            isDelivered
                              ? styles.deliveredBadgeText
                              : isFailed
                                ? styles.failedBadgeText
                                : isOmitted
                                  ? styles.omittedBadgeText
                                  : styles.pendingBadgeText,
                          ]}
                        >
                          {getStopStatusLabel(stop.estado)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Conciliación de carga</Text>
            </View>
            <View style={styles.reconciliationCard}>
              <View style={styles.reconciliationRow}>
                <View>
                  <Text style={styles.reconciliationLabel}>
                    Unidades entregadas
                  </Text>
                  <Text style={styles.reconciliationHint}>
                    {completionDetails
                      ? `${formatUnits(completionDetails.deliveredUnits)} unidades entregadas`
                      : "Detalle de entregas no disponible."}
                  </Text>
                </View>
                <Text style={styles.reconciliationValue}>
                  {completionDetails && totalLoadedUnits !== null
                    ? `${formatUnits(completionDetails.deliveredUnits)} / ${formatUnits(totalLoadedUnits)}`
                    : "—"}
                </Text>
              </View>
              <View style={styles.reconciliationDivider} />
              <View style={styles.reconciliationRow}>
                <View style={styles.returnIcon}>
                  <Text style={styles.returnIconText}>↩</Text>
                </View>
                <View style={styles.returnDetails}>
                  <Text style={styles.reconciliationLabel}>
                    Unidades a devolver
                  </Text>
                  <Text style={styles.reconciliationHint}>
                    {reconciliationMismatch
                      ? "Las unidades entregadas superan la carga registrada. Revisa la conciliación con bodega."
                      : unitsToReturn !== null && undeliveredUnits !== null
                        ? `${formatUnits(undeliveredUnits)} sin entregar + ${formatUnits(completionDetails?.damagedUnits ?? 0)} dañadas. Coordina la devolución con bodega.`
                        : "No hay datos de carga confirmada disponibles."}
                  </Text>
                  {!reconciliationMismatch && unitsToReturn !== null ? (
                    productsToReturn.length > 0 ? (
                      <View style={styles.returnProductsList}>
                        {productsToReturn.map((product) => (
                          <View
                            key={product.producto_id}
                            style={styles.returnProductRow}
                          >
                            <Text style={styles.returnProductName}>
                              {product.nombre}
                            </Text>
                            <Text style={styles.returnProductQuantity}>
                              {formatUnits(product.quantityToReturn)}{" "}
                              {product.unidad}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.returnProductsEmpty}>
                        No hay unidades pendientes para devolver.
                      </Text>
                    )
                  ) : null}
                </View>
                <Text style={styles.reconciliationValue}>
                  {reconciliationMismatch
                    ? "Revisar"
                    : unitsToReturn === null
                      ? "—"
                      : formatUnits(unitsToReturn)}
                </Text>
              </View>
            </View>
          </>
        ) : null}

        {isOutboxLoading ? (
          <Text style={styles.secondaryText}>
            Revisando entregas pendientes antes del cierre...
          </Text>
        ) : null}
        {pendingDeliveries.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void refreshOutbox(true)}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Reintentar sincronización</Text>
          </Pressable>
        ) : null}
        {outboxError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {outboxError}
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {gpsReadError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {gpsReadError}
          </Text>
        ) : null}
        {gpsState.error ? (
          <Text style={styles.warning}>{gpsState.error}</Text>
        ) : null}
        {!gpsState.active ? (
          <Text style={styles.warning}>
            El seguimiento GPS no aparece activo.
          </Text>
        ) : null}
        {distanceError ? (
          <Text style={styles.warning}>{distanceError}</Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={!canFinalize || isFinalizing}
          onPress={() => setIsConfirmationVisible(true)}
          style={[
            styles.primaryButton,
            (!canFinalize || isFinalizing) && styles.disabledButton,
          ]}
        >
          {isFinalizing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Finalizar ruta</Text>
          )}
        </Pressable>
        <Text style={styles.footerHint}>
          {gpsState.active
            ? "El seguimiento GPS se detendrá al confirmar el cierre."
            : "Confirma el cierre para terminar el recorrido."}
        </Text>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsConfirmationVisible(false)}
        transparent
        visible={isConfirmationVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              ¿Finalizar esta ruta?
            </Text>
            <Text style={styles.secondaryText}>
              Las paradas sin visitar se marcarán como omitidas y las fallidas
              pendientes quedarán cerradas. Las fotos pendientes se subirán al
              recuperar conexión. Esta acción no se puede deshacer.
            </Text>
            {pendingUnregisteredDeliveries.length > 0 ? (
              <Text style={styles.error}>
                Primero sincroniza los registros de entrega pendientes.
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isFinalizing}
                onPress={() => setIsConfirmationVisible(false)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>Seguir en ruta</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!canFinalize || isFinalizing}
                onPress={() => void handleFinalize()}
                style={[
                  styles.confirmButton,
                  (!canFinalize || isFinalizing) && styles.disabledButton,
                ]}
              >
                {isFinalizing ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.confirmText}>Confirmar cierre</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f6f8f6",
    flex: 1,
  },
  loading: {
    alignItems: "center",
    flex: 1,
    gap: 14,
    justifyContent: "center",
  },
  content: {
    gap: 16,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 24,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 40,
  },
  backButton: {
    alignItems: "center",
    borderColor: "#e1e7e2",
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    height: 38,
    width: 38,
  },
  backText: {
    color: "#263c30",
    fontSize: 29,
    lineHeight: 32,
    marginTop: -4,
  },
  routeCode: {
    backgroundColor: "#edf4ef",
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  routeCodeText: {
    color: "#176447",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  topBarSpacer: {
    width: 38,
  },
  heading: {
    gap: 4,
    paddingTop: 3,
  },
  subtitle: {
    color: "#738077",
    fontSize: 14,
  },
  eyebrow: {
    color: "#bd641f",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    color: "#1d3327",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e0e5e1",
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  routeCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e3e9e4",
    borderRadius: 18,
    borderWidth: 1,
    gap: 16,
    padding: 17,
  },
  routeCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
  },
  routeIcon: {
    alignItems: "center",
    backgroundColor: "#e5f4e9",
    borderRadius: 13,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  routeIconText: {
    color: "#247449",
    fontSize: 22,
    fontWeight: "800",
  },
  routeCardHeading: {
    flex: 1,
    gap: 3,
  },
  routeCardTitle: {
    color: "#20342a",
    fontSize: 17,
    fontWeight: "800",
  },
  routeCardSubtitle: {
    color: "#6d7c72",
    fontSize: 13,
  },
  statsRow: {
    alignItems: "center",
    borderBottomColor: "#edf0ed",
    borderBottomWidth: 1,
    borderTopColor: "#edf0ed",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 13,
  },
  stat: {
    alignItems: "center",
    flex: 1,
    gap: 2,
  },
  statValue: {
    color: "#20342a",
    fontSize: 22,
    fontWeight: "800",
  },
  statLabel: {
    color: "#738077",
    fontSize: 12,
    fontWeight: "600",
  },
  statDivider: {
    backgroundColor: "#e7ece8",
    height: 33,
    width: 1,
  },
  routeMeta: {
    gap: 8,
  },
  routeMetaItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  metaIcon: {
    color: "#708177",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    width: 19,
  },
  routeMetaText: {
    color: "#5c6e62",
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  pendingBanner: {
    alignItems: "center",
    backgroundColor: "#fff8ed",
    borderColor: "#f1dfbf",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: 13,
  },
  pendingIcon: {
    alignItems: "center",
    backgroundColor: "#f8e9c9",
    borderRadius: 18,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  pendingIconText: {
    color: "#a56819",
    fontSize: 18,
    fontWeight: "800",
  },
  pendingMessage: {
    flex: 1,
    gap: 3,
  },
  pendingTitle: {
    color: "#76501e",
    fontSize: 14,
    fontWeight: "800",
  },
  pendingDescription: {
    color: "#876b42",
    fontSize: 12,
    lineHeight: 17,
  },
  pendingRecordBanner: {
    backgroundColor: "#fff1ef",
    borderColor: "#f0d1cc",
    borderRadius: 11,
    borderWidth: 1,
    padding: 12,
  },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 1,
  },
  sectionTitle: {
    color: "#24372c",
    fontSize: 17,
    fontWeight: "800",
  },
  sectionCount: {
    alignItems: "center",
    backgroundColor: "#e9eeea",
    borderRadius: 12,
    color: "#64746a",
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  stopsCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e4e9e5",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  stopRow: {
    alignItems: "center",
    borderBottomColor: "#edf0ed",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 71,
    paddingVertical: 10,
  },
  lastStopRow: {
    borderBottomWidth: 0,
  },
  stopNumber: {
    alignItems: "center",
    borderRadius: 18,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  stopNumberDelivered: {
    backgroundColor: "#e6f4ea",
  },
  stopNumberFailed: {
    backgroundColor: "#fbe9e6",
  },
  stopNumberOmitted: {
    backgroundColor: "#f0ebf9",
  },
  stopNumberPending: {
    backgroundColor: "#edf0ed",
  },
  stopNumberText: {
    fontSize: 13,
    fontWeight: "800",
  },
  stopNumberTextDelivered: {
    color: "#237246",
  },
  stopNumberTextFailed: {
    color: "#a84339",
  },
  stopNumberTextOmitted: {
    color: "#7057a2",
  },
  stopNumberTextPending: {
    color: "#718077",
  },
  stopDetails: {
    flex: 1,
    gap: 4,
  },
  stopCustomer: {
    color: "#283a2f",
    fontSize: 13,
    fontWeight: "800",
  },
  stopDescription: {
    color: "#708077",
    fontSize: 11,
    lineHeight: 15,
  },
  stopBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  stopBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  deliveredBadge: {
    backgroundColor: "#e7f4e9",
  },
  deliveredBadgeText: {
    color: "#267044",
  },
  failedBadge: {
    backgroundColor: "#fbe9e6",
  },
  failedBadgeText: {
    color: "#a84339",
  },
  omittedBadge: {
    backgroundColor: "#f0ebf9",
  },
  omittedBadgeText: {
    color: "#7057a2",
  },
  pendingBadge: {
    backgroundColor: "#edf0ed",
  },
  pendingBadgeText: {
    color: "#718077",
  },
  reconciliationCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e4e9e5",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 15,
  },
  reconciliationRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 76,
    paddingVertical: 12,
  },
  reconciliationDivider: {
    backgroundColor: "#edf0ed",
    height: 1,
  },
  reconciliationLabel: {
    color: "#2b3d31",
    fontSize: 13,
    fontWeight: "800",
  },
  reconciliationHint: {
    color: "#718077",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
    maxWidth: 235,
  },
  reconciliationValue: {
    color: "#20342a",
    fontSize: 16,
    fontWeight: "800",
    marginLeft: "auto",
    textAlign: "right",
  },
  returnIcon: {
    alignItems: "center",
    backgroundColor: "#edf4ef",
    borderRadius: 18,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  returnIconText: {
    color: "#32764f",
    fontSize: 19,
    fontWeight: "700",
  },
  returnDetails: {
    flex: 1,
  },
  returnProductsList: {
    gap: 5,
    marginTop: 8,
  },
  returnProductRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  returnProductName: {
    color: "#52645a",
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
  returnProductQuantity: {
    color: "#20342a",
    flexShrink: 0,
    fontSize: 11,
    fontWeight: "700",
  },
  returnProductsEmpty: {
    color: "#718077",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  summaryRow: {
    alignItems: "center",
    borderBottomColor: "#edf0ed",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  summaryLabel: {
    color: "#52645a",
    fontSize: 15,
  },
  summaryValue: {
    color: "#20342a",
    fontSize: 16,
    fontWeight: "700",
  },
  warning: {
    color: "#8c4a1b",
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: "#a3352c",
    fontSize: 14,
    lineHeight: 20,
  },
  secondaryText: {
    color: "#52645a",
    fontSize: 14,
    lineHeight: 21,
  },
  footer: {
    backgroundColor: "#ffffff",
    borderTopColor: "#e4e9e5",
    borderTopWidth: 1,
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  footerHint: {
    color: "#75837a",
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 54,
    padding: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  disabledButton: {
    backgroundColor: "#9bac9f",
  },
  retryButton: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  retryText: {
    color: "#176447",
    fontSize: 14,
    fontWeight: "700",
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(22, 38, 29, 0.55)",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    gap: 14,
    maxWidth: 520,
    padding: 20,
    width: "100%",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  cancelButton: {
    alignItems: "center",
    borderColor: "#d8e0db",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 13,
  },
  cancelText: {
    color: "#52645a",
    fontSize: 14,
    fontWeight: "700",
  },
  confirmButton: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 13,
  },
  confirmText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});
