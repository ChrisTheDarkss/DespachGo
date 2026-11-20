import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { RouteMap } from "@/src/components/RouteMap";
import {
  getDrivingRoute,
  type DrivingRoute,
  type RoutingPoint,
} from "@/src/services/driverRouting";
import type { DriverRoute, RouteStop } from "@/src/types/route";

type ActiveRouteMapProps = {
  route: DriverRoute;
  pendingStopIds?: string[];
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

export function ActiveRouteMap({
  route,
  pendingStopIds = [],
}: ActiveRouteMapProps) {
  const pendingStopIdSet = new Set(pendingStopIds);
  const stops = route.paradas.filter(
    (stop) => !isCompletedStop(stop) && !pendingStopIdSet.has(stop.id),
  );
  const hasPendingActions = route.paradas.some((stop) =>
    pendingStopIdSet.has(stop.id),
  );
  const points = useMemo(() => getRoutingPoints(stops), [stops]);
  const pointIds = points
    .map(({ id, latitud, longitud }) => `${id}:${latitud}:${longitud}`)
    .join(",");
  const [drivingRoute, setDrivingRoute] = useState<DrivingRoute | null>(null);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    setDrivingRoute(null);
    setRoutingError(null);
    if (points.length < 2) {
      return () => {
        active = false;
      };
    }

    void getDrivingRoute(points)
      .then((result) => {
        if (active) {
          setDrivingRoute(result);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setRoutingError(
            error instanceof Error
              ? error.message
              : "No se pudo calcular el recorrido vial.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [pointIds]);

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
  const nextLeg = drivingRoute?.legs[0];
  const distanceMeters =
    drivingRoute?.distanceMeters ??
    (points.length === 1 ? 0 : null);
  const elapsedTime = formatElapsedTime(route.iniciada_en ?? null, now);

  return (
    <View style={styles.container}>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{route.paradas.length}</Text>
          <Text style={styles.statLabel}>paradas</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatDistance(distanceMeters)}</Text>
          <Text style={styles.statLabel}>km de ruta</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{elapsedTime}</Text>
          <Text style={styles.statLabel}>tiempo transcurrido</Text>
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
              drivingRoute={drivingRoute}
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
          {routingError ? (
            <Text accessibilityRole="alert" style={styles.warning}>
              {routingError} Se muestran las paradas sin el recorrido vial.
            </Text>
          ) : points.length > 1 && !drivingRoute ? (
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
