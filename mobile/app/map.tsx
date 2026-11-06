import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteMap } from "@/src/components/RouteMap";
import { useAuth } from "@/src/hooks/useAuth";
import {
  getDrivingRoute,
  type DrivingRoute,
  type RoutingPoint,
} from "@/src/services/driverRouting";
import { getTodaysDriverRoute } from "@/src/services/driverRoute";
import type { DriverRoute } from "@/src/types/route";

function getRoutingPoints(route: DriverRoute): RoutingPoint[] {
  return route.paradas.flatMap((stop, index) => {
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

export default function RouteMapScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const conductorId = session?.user.id;
  const [route, setRoute] = useState<DriverRoute | null>(null);
  const [points, setPoints] = useState<RoutingPoint[]>([]);
  const [drivingRoute, setDrivingRoute] = useState<DrivingRoute | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routingError, setRoutingError] = useState<string | null>(null);

  const loadMap = useCallback(async () => {
    if (!conductorId) {
      setRoute(null);
      setPoints([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setRoutingError(null);
    setDrivingRoute(null);
    try {
      const currentRoute = await getTodaysDriverRoute(conductorId);
      setRoute(currentRoute);
      if (!currentRoute) {
        setPoints([]);
        return;
      }

      const routePoints = getRoutingPoints(currentRoute);
      setPoints(routePoints);
      if (routePoints.length >= 2) {
        try {
          setDrivingRoute(await getDrivingRoute(routePoints));
        } catch (routeError) {
          setRoutingError(
            routeError instanceof Error
              ? routeError.message
              : "No se pudo calcular el recorrido vial.",
          );
        }
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar la ruta.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [conductorId]);

  useFocusEffect(
    useCallback(() => {
      void loadMap();
    }, [loadMap]),
  );

  const missingCoordinates = route
    ? route.paradas.length - points.length
    : 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹  Volver</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.eyebrow}>DESPACHOS</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Mapa de la ruta
          </Text>
          {route ? (
            <Text style={styles.subtitle}>
              {route.paradas.length}{" "}
              {route.paradas.length === 1 ? "parada" : "paradas"} en orden
            </Text>
          ) : null}
        </View>

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#176447" />
            <Text style={styles.infoText}>Cargando mapa y recorrido...</Text>
          </View>
        ) : error ? (
          <View style={styles.messageCard}>
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadMap()}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : !route ? (
          <View style={styles.messageCard}>
            <Text style={styles.messageTitle}>
              No hay una ruta asignada para hoy.
            </Text>
          </View>
        ) : points.length === 0 ? (
          <View style={styles.messageCard}>
            <Text style={styles.messageTitle}>
              La ruta no tiene paradas con coordenadas.
            </Text>
            <Text style={styles.infoText}>
              Comprueba que las órdenes tengan latitud y longitud registradas.
            </Text>
          </View>
        ) : (
          <>
            {routingError ? (
              <View style={styles.warning}>
                <Text accessibilityRole="alert" style={styles.warningText}>
                  {routingError} Se muestran las paradas, pero no el recorrido
                  vial.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void loadMap()}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryText}>Reintentar recorrido</Text>
                </Pressable>
              </View>
            ) : null}
            {points.length < 2 ? (
              <View style={styles.warning}>
                <Text style={styles.warningText}>
                  Se necesita una segunda parada con coordenadas para calcular
                  el recorrido vial.
                </Text>
              </View>
            ) : null}
            {missingCoordinates > 0 ? (
              <View style={styles.warning}>
                <Text style={styles.warningText}>
                  {missingCoordinates}{" "}
                  {missingCoordinates === 1
                    ? "parada no tiene coordenadas"
                    : "paradas no tienen coordenadas"}{" "}
                  y no aparecerá en el mapa.
                </Text>
              </View>
            ) : null}
            {drivingRoute ? (
              <View style={styles.summary}>
                <Text style={styles.summaryText}>
                  {`${(drivingRoute.distanceMeters / 1000).toFixed(1)} km`}
                </Text>
                <Text style={styles.summaryDivider}>·</Text>
                <Text style={styles.summaryText}>
                  {`${Math.ceil(drivingRoute.durationSeconds / 60)} min aprox.`}
                </Text>
              </View>
            ) : null}
            <RouteMap points={points} drivingRoute={drivingRoute} />
            <View style={styles.stopList}>
              <Text style={styles.listTitle}>Paradas</Text>
              {route.paradas.map((stop, index) => {
                const order = stop.ordenes[0];
                const hasCoordinates =
                  typeof order?.latitud === "number" &&
                  typeof order.longitud === "number";

                return (
                  <View key={stop.id} style={styles.stopRow}>
                    <View style={styles.stopNumber}>
                      <Text style={styles.stopNumberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.stopDetails}>
                      <Text style={styles.stopCustomer}>
                        {order?.cliente ?? "Cliente no disponible"}
                      </Text>
                      <Text style={styles.infoText}>
                        {order
                          ? `${order.direccion}, ${order.comuna}`
                          : "Sin guía asociada"}
                      </Text>
                    </View>
                    {!hasCoordinates ? (
                      <Text style={styles.missingLabel}>Sin ubicación</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f5f7f5",
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: 14,
    padding: 18,
    paddingBottom: 32,
  },
  backButton: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: 40,
  },
  backText: {
    color: "#176447",
    fontSize: 16,
    fontWeight: "700",
  },
  header: {
    gap: 6,
  },
  eyebrow: {
    color: "#bd641f",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    color: "#20342a",
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    color: "#68766d",
    fontSize: 14,
  },
  loading: {
    alignItems: "center",
    gap: 12,
    justifyContent: "center",
    minHeight: 300,
  },
  infoText: {
    color: "#68766d",
    fontSize: 13,
  },
  messageCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e0e5e1",
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 20,
  },
  messageTitle: {
    color: "#20342a",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  error: {
    color: "#a12622",
    fontSize: 14,
    textAlign: "center",
  },
  warning: {
    backgroundColor: "#fff5eb",
    borderRadius: 9,
    gap: 5,
    padding: 12,
  },
  warningText: {
    color: "#8d4a19",
    fontSize: 13,
    lineHeight: 19,
  },
  retryButton: {
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  retryText: {
    color: "#176447",
    fontSize: 14,
    fontWeight: "700",
  },
  summary: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 8,
  },
  summaryText: {
    color: "#176447",
    fontSize: 14,
    fontWeight: "700",
  },
  summaryDivider: {
    color: "#bd641f",
    fontSize: 18,
  },
  stopList: {
    backgroundColor: "#ffffff",
    borderColor: "#e0e5e1",
    borderRadius: 12,
    borderWidth: 1,
    gap: 14,
    padding: 15,
  },
  listTitle: {
    color: "#20342a",
    fontSize: 17,
    fontWeight: "700",
  },
  stopRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  stopNumber: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  stopNumberText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  stopDetails: {
    flex: 1,
    gap: 3,
  },
  stopCustomer: {
    color: "#20342a",
    fontSize: 14,
    fontWeight: "700",
  },
  missingLabel: {
    color: "#a84f14",
    fontSize: 11,
  },
});
