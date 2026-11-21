import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { RouteMap } from "@/src/components/RouteMap";
import {
  getDrivingRouteWithPartialSegments,
  type DrivingRoute,
  type RoutingPoint,
} from "@/src/services/driverRouting";
import {
  isGpsLocationFixFresh,
  isValidGpsLocationFix,
  type GpsLocationFix,
} from "@/src/services/gpsStore";
import type { DriverRoute, RouteStop } from "@/src/types/route";

const ROUTE_REFRESH_DISTANCE_METERS = 250;
const ROUTE_REFRESH_INTERVAL_MS = 60_000;

type ActiveRouteMapProps = {
  route: DriverRoute;
  pendingStopIds?: string[];
  currentLocation?: GpsLocationFix | null;
  gpsTrackingActive?: boolean;
};

const noPendingStopIds: string[] = [];

type RouteResult = {
  pointIds: string;
  includesDriverOrigin: boolean;
  route: DrivingRoute | null;
};

type RouteRequest = {
  pointIds: string;
  includesDriverOrigin: boolean;
  origin: { latitude: number; longitude: number } | null;
  requestedAt: number;
};

function getRoutingPoints(stops: RouteStop[]): RoutingPoint[] {
  return stops.flatMap((stop, index) => {
    const order = stop.ordenes[0];
    if (
      !order ||
      typeof order.latitud !== "number" ||
      typeof order.longitud !== "number" ||
      !Number.isFinite(order.latitud) ||
      !Number.isFinite(order.longitud)
    ) {
      return [];
    }

    return [
      {
        id: stop.id,
        number: index + 1,
        orderNumber: stop.posicion,
        cliente: order.cliente,
        latitud: order.latitud,
        longitud: order.longitud,
      },
    ];
  });
}

function isCompletedStop(stop: RouteStop) {
  return (
    stop.estado === "entregada" ||
    stop.estado === "parcial" ||
    stop.estado === "omitida"
  );
}

function formatElapsedTime(startedAt: string | null, now: number) {
  if (!startedAt) {
    return "—";
  }
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 60_000),
  );
  if (!Number.isFinite(elapsedMinutes)) {
    return "—";
  }
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null) {
    return "—";
  }
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

function formatDuration(durationSeconds: number | null) {
  if (durationSeconds === null || !Number.isFinite(durationSeconds)) {
    return "—";
  }
  const totalMinutes = Math.ceil(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function getMissingLegLabel(
  segmentIndex: number,
  points: RoutingPoint[],
  includesDriverOrigin: boolean,
) {
  const getNodeLabel = (nodeIndex: number) => {
    if (includesDriverOrigin && nodeIndex === 0) {
      return "conductor";
    }
    const point = points[nodeIndex - (includesDriverOrigin ? 1 : 0)];
    return `parada ${point?.number ?? "?"}`;
  };
  return `tramo ${segmentIndex + 1} (${getNodeLabel(segmentIndex)} → ${getNodeLabel(segmentIndex + 1)})`;
}

function getDistanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    6_371_000 *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function ActiveRouteMap({
  route,
  pendingStopIds = noPendingStopIds,
  currentLocation = null,
  gpsTrackingActive = false,
}: ActiveRouteMapProps) {
  const pendingStopIdsKey = JSON.stringify(pendingStopIds);
  const pendingStopIdSet = useMemo(
    () => new Set<string>(JSON.parse(pendingStopIdsKey)),
    [pendingStopIdsKey],
  );
  const stops = useMemo(
    () =>
      route.paradas.filter(
        (stop) => !isCompletedStop(stop) && !pendingStopIdSet.has(stop.id),
      ),
    [pendingStopIdsKey, route.paradas],
  );
  const hasPendingActions = route.paradas.some((stop) =>
    pendingStopIdSet.has(stop.id),
  );
  const points = useMemo(() => getRoutingPoints(stops), [stops]);
  const routeIsActive = gpsTrackingActive && route.estado === "en_curso";
  const [now, setNow] = useState(Date.now());
  const displayedLocation =
    routeIsActive &&
    isValidGpsLocationFix(currentLocation) &&
    currentLocation.timestamp <= now
      ? currentLocation
      : null;
  const locationIsRecent =
    displayedLocation !== null &&
    isGpsLocationFixFresh(displayedLocation, now);
  const routeOrigin = locationIsRecent ? displayedLocation : null;
  const routeOriginKey = routeOrigin
    ? `${routeOrigin.timestamp}:${routeOrigin.latitude}:${routeOrigin.longitude}`
    : "none";
  const stopsWithoutCoordinates = stops.length - points.length;
  const pointIds = points
    .map(
      ({ id, number, orderNumber, latitud, longitud }) =>
        `${id}:${number}:${orderNumber ?? ""}:${latitud}:${longitud}`,
    )
    .join(",");
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const lastRouteRequest = useRef<RouteRequest | null>(null);
  const latestRouteRequestId = useRef(0);
  const isMounted = useRef(false);
  const routeResultMatchesPoints = routeResult?.pointIds === pointIds;
  const isRetainingLastKnownRoute =
    routeResultMatchesPoints &&
    routeResult.includesDriverOrigin &&
    displayedLocation !== null &&
    !locationIsRecent;
  const drivingRoute =
    routeResultMatchesPoints &&
    (routeResult.includesDriverOrigin === Boolean(routeOrigin) ||
      isRetainingLastKnownRoute)
      ? routeResult.route
      : null;
  const gpsStatusMessage = !routeIsActive
    ? "El seguimiento GPS no está activo para esta ruta. Verifica los permisos y activa el seguimiento para usar Mi ubicación."
    : !displayedLocation
      ? "No hay una ubicación GPS válida. Comprueba que el GPS esté activado y que DespachGo tenga permiso de ubicación."
      : `Última ubicación conocida · actualizada ${new Date(displayedLocation.timestamp).toLocaleTimeString()}. La ubicación, el recorrido, la distancia y la duración pueden estar desactualizados.${isRetainingLastKnownRoute ? " La estimación visible se basa en esta posición." : ""}`;

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const includesDriverOrigin = routeOrigin !== null;
    const previousRequest = lastRouteRequest.current;
    const movedEnough =
      routeOrigin !== null &&
      previousRequest?.origin !== null &&
      previousRequest?.origin !== undefined &&
      getDistanceMeters(previousRequest.origin, routeOrigin) >=
        ROUTE_REFRESH_DISTANCE_METERS;
    const waitedLongEnough =
      routeOrigin !== null &&
      previousRequest !== null &&
      now - previousRequest.requestedAt >= ROUTE_REFRESH_INTERVAL_MS;
    const originBecameStale =
      previousRequest?.includesDriverOrigin === true &&
      !includesDriverOrigin &&
      displayedLocation !== null &&
      !locationIsRecent;
    const shouldRecalculate =
      previousRequest === null ||
      previousRequest.pointIds !== pointIds ||
      (previousRequest.includesDriverOrigin !== includesDriverOrigin &&
        !originBecameStale) ||
      movedEnough ||
      waitedLongEnough;

    if (!shouldRecalculate) {
      return;
    }

    const origin = routeOrigin
      ? {
          latitude: routeOrigin.latitude,
          longitude: routeOrigin.longitude,
        }
      : null;
    lastRouteRequest.current = {
      pointIds,
      includesDriverOrigin,
      origin,
      requestedAt: now,
    };
    const requestId = ++latestRouteRequestId.current;
    setRoutingError(null);
    const canCalculateRoute =
      points.length >= 2 || (includesDriverOrigin && points.length >= 1);
    if (!canCalculateRoute) {
      setIsRouting(false);
      setRouteResult({
        pointIds,
        includesDriverOrigin,
        route: null,
      });
      return;
    }

    setIsRouting(true);
    void getDrivingRouteWithPartialSegments(
      points,
      origin
        ? {
            latitud: origin.latitude,
            longitud: origin.longitude,
          }
        : undefined,
    )
      .then((result) => {
        if (isMounted.current && requestId === latestRouteRequestId.current) {
          setRouteResult({
            pointIds,
            includesDriverOrigin,
            route: result,
          });
        }
      })
      .catch((error: unknown) => {
        if (isMounted.current && requestId === latestRouteRequestId.current) {
          setRoutingError(
            error instanceof Error
              ? error.message
              : "No se pudo calcular el recorrido vial.",
          );
        }
      })
      .finally(() => {
        if (isMounted.current && requestId === latestRouteRequestId.current) {
          setIsRouting(false);
        }
      });
  }, [now, pointIds, routeOriginKey]);

  const nextStop = stops[0];
  const nextOrder = nextStop?.ordenes[0];
  const nextStopAddress = nextStop
    ? [
        ...new Set(
          nextStop.ordenes.map(
            (order) => `${order.direccion}, ${order.comuna}`,
          ),
        ),
      ].join(" · ")
    : "";
  const nextLeg = routeOrigin
    ? drivingRoute?.legs.find((leg) => leg.segmentIndex === 0)
    : null;
  const distanceMeters =
    (drivingRoute && drivingRoute.legs.length > 0
      ? drivingRoute.distanceMeters
      : null) ??
    (points.length === 1 && !routeOrigin ? 0 : null);
  const elapsedTime = formatElapsedTime(route.iniciada_en ?? null, now);
  const estimatedDuration = formatDuration(
    drivingRoute && drivingRoute.legs.length > 0
      ? drivingRoute.durationSeconds
      : null,
  );
  const missingLegLabels =
    drivingRoute?.partial?.missingLegs.map(({ segmentIndex }) =>
      getMissingLegLabel(
        segmentIndex,
        points,
        routeResult?.includesDriverOrigin ?? false,
      ),
    ) ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{route.paradas.length}</Text>
          <Text style={styles.statLabel}>paradas</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatDistance(distanceMeters)}</Text>
          <Text style={styles.statLabel}>
            {drivingRoute?.partial
              ? "km parciales"
              : isRetainingLastKnownRoute
                ? "km estimados"
                : "km de ruta"}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{elapsedTime}</Text>
          <Text style={styles.statLabel}>tiempo transcurrido</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{estimatedDuration}</Text>
          <Text style={styles.statLabel}>
            {drivingRoute?.partial
              ? "duración parcial"
              : isRetainingLastKnownRoute
                ? "duración · última ubicación"
                : "duración estimada"}
          </Text>
        </View>
      </View>
      {stops.length === 0 ? (
        <View style={styles.finishedCard}>
          <Text style={styles.finishedTitle}>
            {hasPendingActions ? "Registros por sincronizar" : "Ruta finalizada"}
          </Text>
          <Text style={styles.secondaryText}>
            {hasPendingActions
              ? "No quedan paradas por visitar mientras se sincronizan los registros."
              : "No quedan paradas activas. Puedes finalizar la ruta desde el botón inferior."}
          </Text>
        </View>
      ) : (
        <>
          {points.length > 0 ? (
            <RouteMap
              compact
              currentLocation={displayedLocation}
              drivingRoute={drivingRoute}
              gpsTrackingActive={routeIsActive}
              key={pointIds}
              points={points}
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              <Text style={styles.secondaryText}>
                Las paradas activas no tienen coordenadas para mostrarse en el
                mapa.
              </Text>
            </View>
          )}
          {displayedLocation && locationIsRecent ? (
            <Text style={styles.secondaryText}>
              Ubicación reciente · actualizada{" "}
              {new Date(displayedLocation.timestamp).toLocaleTimeString()}.
            </Text>
          ) : displayedLocation ? (
            <Text accessibilityRole="alert" style={styles.warning}>
              {gpsStatusMessage}
            </Text>
          ) : (
            <Text accessibilityRole="alert" style={styles.warning}>
              {gpsStatusMessage}
            </Text>
          )}
          {stopsWithoutCoordinates > 0 ? (
            <Text accessibilityRole="alert" style={styles.warning}>
              {stopsWithoutCoordinates === 1
                ? "1 parada activa no tiene coordenadas y no está incluida en el trazado."
                : `${stopsWithoutCoordinates} paradas activas no tienen coordenadas y no están incluidas en el trazado.`}
            </Text>
          ) : null}
          {routingError ? (
            <Text accessibilityRole="alert" style={styles.warning}>
              {routingError}{" "}
              {drivingRoute
                ? "Se conserva el último recorrido calculado."
                : "Se muestran las paradas sin el recorrido vial."}
            </Text>
          ) : null}
          {drivingRoute?.partial ? (
            <Text accessibilityRole="alert" style={styles.warning}>
              Ruta parcial. No se pudieron calcular:{" "}
              {missingLegLabels.length > 0
                ? missingLegLabels.join(", ")
                : "ningún tramo pendiente"}.
              {drivingRoute.partial.message
                ? ` ${drivingRoute.partial.message}`
                : " Solo se muestran recorridos viales devueltos por OpenRouteService."}
            </Text>
          ) : null}
          {!routingError && !drivingRoute?.partial && isRouting ? (
            <View style={styles.routingLoading}>
              <ActivityIndicator color="#176447" size="small" />
              <Text style={styles.secondaryText}>
                Calculando distancia de la ruta...
              </Text>
            </View>
          ) : null}
          <View style={styles.nextStopCard}>
            <View style={styles.nextStopHeading}>
              <Text style={styles.eyebrow}>
                SIGUIENTE · PARADA {nextStop?.posicion ?? 1} DE{" "}
                {route.paradas.length}
              </Text>
              {nextLeg ? (
                <Text style={styles.distanceHint}>
                  {`${(nextLeg.distanceMeters / 1000).toFixed(1)} km · ${Math.ceil(nextLeg.durationSeconds / 60)} min`}
                </Text>
              ) : null}
            </View>
            <Text style={styles.customer}>
              {nextStop?.ordenes.length && nextStop.ordenes.length > 1
                ? `${nextOrder?.cliente ?? "Cliente"} y ${nextStop.ordenes.length - 1} más`
                : nextOrder?.cliente ?? "Cliente no disponible"}
            </Text>
            <Text style={styles.secondaryText}>
              {nextStopAddress || "Dirección no disponible"}
            </Text>
            <Text style={styles.confirmation}>
              {nextStop?.confirmacion_cliente === "confirmo"
                ? "Cliente confirmó"
                : nextStop?.confirmacion_cliente === "no_habra_nadie"
                  ? "Cliente indicó que no habrá nadie"
                  : "Sin respuesta del cliente"}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  stats: {
    backgroundColor: "#7a807d",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    paddingVertical: 9,
  },
  stat: {
    alignItems: "center",
    flex: 1,
    gap: 2,
  },
  statValue: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  statLabel: {
    color: "#f0f3f1",
    fontSize: 9,
    textAlign: "center",
  },
  finishedCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e0e5e1",
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  finishedTitle: {
    color: "#176447",
    fontSize: 15,
    fontWeight: "700",
  },
  mapPlaceholder: {
    alignItems: "center",
    backgroundColor: "#e8eee8",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 220,
    padding: 18,
  },
  routingLoading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  warning: {
    backgroundColor: "#fff5eb",
    borderRadius: 8,
    color: "#8d4a19",
    fontSize: 11,
    lineHeight: 16,
    padding: 9,
  },
  nextStopCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e0e5e1",
    borderRadius: 10,
    borderWidth: 1,
    gap: 7,
    padding: 12,
  },
  nextStopHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  eyebrow: {
    color: "#176447",
    flex: 1,
    fontSize: 9,
    fontWeight: "700",
  },
  distanceHint: {
    color: "#68766d",
    fontSize: 9,
  },
  customer: {
    color: "#20342a",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryText: {
    color: "#68766d",
    fontSize: 11,
    lineHeight: 16,
  },
  confirmation: {
    color: "#52645a",
    fontSize: 10,
  },
});
