import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StopCard } from "@/src/components/StopCard";
import { useAuth } from "@/src/hooks/useAuth";
import { useDeliveryOutbox } from "@/src/hooks/useDeliveryOutbox";
import { useGpsTracking } from "@/src/hooks/useGpsTracking";
import {
  getTodaysDriverRoute,
  reorderDriverStops,
} from "@/src/services/driverRoute";
import type { DriverRoute } from "@/src/types/route";

export default function TodayRouteScreen() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const conductorId = session?.user.id;
  const {
    queue: pendingDeliveries,
    error: outboxError,
    refresh: refreshOutbox,
  } = useDeliveryOutbox(conductorId);
  const [route, setRoute] = useState<DriverRoute | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { state: gpsState, error: gpsError } = useGpsTracking(
    conductorId,
    route?.id,
  );

  const loadRoute = useCallback(
    async (refresh = false) => {
      if (!conductorId) {
        setRoute(null);
        setIsLoading(false);
        return;
      }

      setError(null);
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        setRoute(await getTodaysDriverRoute(conductorId));
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudo cargar la ruta. Inténtalo nuevamente.",
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [conductorId],
  );

  useFocusEffect(
    useCallback(() => {
      void loadRoute();
    }, [loadRoute]),
  );

  function handleStartRoute() {
    if (!route || route.estado !== "asignada" || route.offlineCopy) {
      return;
    }

    router.push({
      pathname: "../gps-consent",
      params: { routeId: route.id },
    });
  }

  async function handleSignOut() {
    if (route?.estado === "en_curso") {
      setError("Finaliza la ruta antes de cerrar la sesión para detener el GPS de forma segura.");
      return;
    }

    setIsSigningOut(true);
    setError(null);
    try {
      await signOut();
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "No se pudo cerrar la sesión.",
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleMoveStop(index: number, direction: -1 | 1) {
    if (!route || isReordering) {
      return;
    }

    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= route.paradas.length) {
      return;
    }

    const reorderedStops = [...route.paradas];
    [reorderedStops[index], reorderedStops[nextIndex]] = [
      reorderedStops[nextIndex],
      reorderedStops[index],
    ];

    setError(null);
    setIsReordering(true);
    try {
      await reorderDriverStops(
        route.id,
        reorderedStops.map((stop) => stop.id),
      );
      await loadRoute(true);
    } catch (reorderError) {
      setError(
        reorderError instanceof Error
          ? reorderError.message
          : "No se pudo guardar el nuevo orden.",
      );
    } finally {
      setIsReordering(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#176447" />
          <Text style={styles.loadingText}>Cargando tu ruta...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const stops = route?.paradas ?? [];
  const isGpsActive =
    Boolean(route) && gpsState.active && gpsState.routeId === route?.id;
  const pendingPhotoCount = pendingDeliveries.reduce(
    (count, action) => count + action.photos.length,
    0,
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={stops}
        keyExtractor={(stop) => stop.id}
        refreshControl={
          <RefreshControl
            colors={["#176447"]}
            onRefresh={() => void loadRoute(true)}
            refreshing={isRefreshing}
            tintColor="#176447"
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>DESPACHOS</Text>
            <Text accessibilityRole="header" style={styles.title}>
              Mi ruta de hoy
            </Text>
            {route ? (
              <>
                <View
                  style={[
                    styles.routeBadge,
                    route.estado === "en_curso" && styles.routeBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.routeBadgeText,
                      route.estado === "en_curso" &&
                        styles.routeBadgeTextActive,
                    ]}
                  >
                    {route.estado === "en_curso"
                      ? "Ruta en curso"
                      : "Ruta asignada"}
                  </Text>
                </View>
                <Text style={styles.count}>
                  {stops.length} {stops.length === 1 ? "parada" : "paradas"}
                </Text>
                {route.offlineCopy ? (
                  <Text style={styles.offlineNotice}>
                    Sin conexión. Mostrando la última ruta guardada.
                  </Text>
                ) : null}
                {route.estado === "en_curso" ? (
                  <View
                    style={[
                      styles.gpsBanner,
                      isGpsActive ? styles.gpsBannerActive : styles.gpsBannerInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.gpsText,
                        isGpsActive && styles.gpsTextActive,
                      ]}
                    >
                      {isGpsActive
                        ? "Seguimiento GPS activo"
                        : "Seguimiento GPS no activo"}
                    </Text>
                    {gpsState.error || gpsError ? (
                      <Text style={styles.gpsError}>
                        {gpsState.error ?? gpsError}
                      </Text>
                    ) : null}
                    {!isGpsActive || gpsState.error ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          router.push({
                            pathname: "../gps-consent",
                            params: { routeId: route.id, resume: "1" },
                          })
                        }
                        style={styles.gpsRetry}
                      >
                        <Text style={styles.gpsRetryText}>Activar o reintentar GPS</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/map")}
                  style={styles.mapButton}
                >
                  <Text style={styles.mapButtonText}>Ver mapa de la ruta</Text>
                </Pressable>
              </>
            ) : null}
            {pendingDeliveries.length > 0 ? (
              <View style={styles.pendingBanner}>
                <Text style={styles.pendingText}>
                  {pendingDeliveries.length}{" "}
                  {pendingDeliveries.length === 1
                    ? "registro pendiente"
                    : "registros pendientes"}
                  {pendingPhotoCount > 0
                    ? ` · ${pendingPhotoCount} ${
                        pendingPhotoCount === 1 ? "foto pendiente" : "fotos pendientes"
                      } de subir`
                    : " de sincronizar"}
                </Text>
                {pendingDeliveries.find(({ status }) => status === "failed")
                  ?.error ? (
                  <Text style={styles.pendingError}>
                    {
                      pendingDeliveries.find(
                        ({ status }) => status === "failed",
                      )?.error
                    }
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void refreshOutbox(true)}
                  style={styles.pendingRetry}
                >
                  <Text style={styles.pendingRetryText}>
                    Reintentar sincronización
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {outboxError ? (
              <Text accessibilityRole="alert" style={styles.pendingError}>
                {outboxError}
              </Text>
            ) : null}
            {error ? (
              <View style={styles.errorBox}>
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void loadRoute()}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryText}>Reintentar</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {route
                ? "Esta ruta todavía no tiene paradas."
                : "No tienes una ruta asignada para hoy."}
            </Text>
            <Text style={styles.emptyText}>
              Desliza hacia abajo para actualizar.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.stopRow}>
            <Pressable
              accessibilityLabel={`Ver detalle de la parada ${index + 1}`}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: "/stop/[id]", params: { id: item.id } })
              }
              style={styles.stopPressable}
            >
              <StopCard
                hasPendingDelivery={pendingDeliveries.some(
                  (action) => action.stopId === item.id,
                )}
                number={index + 1}
                stop={item}
              />
            </Pressable>
            <View style={styles.moveControls}>
              <Pressable
                accessibilityLabel={`Mover parada ${index + 1} hacia arriba`}
                accessibilityRole="button"
                disabled={
                  isReordering || route?.offlineCopy === true || index === 0
                }
                onPress={() => void handleMoveStop(index, -1)}
                style={({ pressed }) => [
                  styles.moveButton,
                  pressed && styles.moveButtonPressed,
                  (isReordering || route?.offlineCopy === true || index === 0) &&
                    styles.moveDisabledButton,
                ]}
              >
                <Text style={styles.moveButtonText}>↑</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Mover parada ${index + 1} hacia abajo`}
                accessibilityRole="button"
                disabled={
                  isReordering ||
                  route?.offlineCopy === true ||
                  index === stops.length - 1
                }
                onPress={() => void handleMoveStop(index, 1)}
                style={({ pressed }) => [
                  styles.moveButton,
                  pressed && styles.moveButtonPressed,
                  (isReordering ||
                    route?.offlineCopy === true ||
                    index === stops.length - 1) &&
                    styles.moveDisabledButton,
                ]}
              >
                <Text style={styles.moveButtonText}>↓</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            {route?.estado === "asignada" ? (
              <Pressable
                accessibilityRole="button"
                disabled={
                  stops.length === 0 || route?.offlineCopy === true
                }
                onPress={() => void handleStartRoute()}
                style={({ pressed }) => [
                  styles.startButton,
                  pressed && styles.startButtonPressed,
                  (stops.length === 0 || route?.offlineCopy === true) &&
                    styles.disabledButton,
                ]}
              >
                <Text style={styles.startButtonText}>Iniciar ruta</Text>
              </Pressable>
            ) : route?.estado === "en_curso" ? (
              <>
                <View style={styles.startedBanner}>
                  <Text style={styles.startedText}>Tu ruta está en curso</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={route.offlineCopy === true}
                  onPress={() =>
                    router.push({
                      pathname: "../route-summary",
                      params: { routeId: route.id },
                    })
                  }
                  style={[
                    styles.finishButton,
                    route.offlineCopy && styles.disabledButton,
                  ]}
                >
                  <Text style={styles.finishButtonText}>Fin de ruta</Text>
                </Pressable>
              </>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={isSigningOut || route?.estado === "en_curso"}
              onPress={() => void handleSignOut()}
              style={({ pressed }) => [
                styles.signOutButton,
                pressed && styles.signOutPressed,
              ]}
            >
              {isSigningOut ? (
                <ActivityIndicator color="#176447" />
              ) : (
                <Text style={styles.signOutText}>Cerrar sesión</Text>
              )}
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f5f7f5",
    flex: 1,
  },
  loading: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
  },
  loadingText: {
    color: "#52645a",
    fontSize: 15,
  },
  listContent: {
    flexGrow: 1,
    gap: 12,
    padding: 20,
    paddingBottom: 32,
  },
  stopRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  stopPressable: {
    flex: 1,
  },
  moveControls: {
    gap: 6,
  },
  moveButton: {
    alignItems: "center",
    backgroundColor: "#fff0e3",
    borderRadius: 9,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  moveButtonPressed: {
    backgroundColor: "#ffe0c4",
  },
  moveButtonText: {
    color: "#a84f14",
    fontSize: 20,
    fontWeight: "700",
  },
  moveDisabledButton: {
    opacity: 0.4,
  },
  header: {
    gap: 8,
    marginBottom: 4,
  },
  eyebrow: {
    color: "#52645a",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    color: "#20342a",
    fontSize: 28,
    fontWeight: "700",
  },
  routeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#fff0e3",
    borderRadius: 16,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  routeBadgeActive: {
    backgroundColor: "#e5f1ea",
  },
  routeBadgeText: {
    color: "#a84f14",
    fontSize: 13,
    fontWeight: "700",
  },
  routeBadgeTextActive: {
    color: "#176447",
  },
  count: {
    color: "#52645a",
    fontSize: 15,
    marginTop: 2,
  },
  offlineNotice: {
    backgroundColor: "#fff0e3",
    borderRadius: 9,
    color: "#8c4a1b",
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
  },
  gpsBanner: {
    borderRadius: 9,
    gap: 7,
    padding: 12,
  },
  gpsBannerActive: {
    backgroundColor: "#eaf2ed",
  },
  gpsBannerInactive: {
    backgroundColor: "#fff0e3",
  },
  gpsText: {
    color: "#8c4a1b",
    fontSize: 14,
    fontWeight: "700",
  },
  gpsTextActive: {
    color: "#176447",
  },
  gpsError: {
    color: "#a3352c",
    fontSize: 13,
    lineHeight: 19,
  },
  gpsRetry: {
    alignSelf: "flex-start",
    paddingVertical: 3,
  },
  gpsRetryText: {
    color: "#176447",
    fontSize: 13,
    fontWeight: "700",
  },
  pendingBanner: {
    backgroundColor: "#fff7ef",
    borderColor: "#f0d7c0",
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  pendingText: {
    color: "#8c4a1b",
    fontSize: 14,
    fontWeight: "700",
  },
  pendingError: {
    color: "#a3352c",
    fontSize: 13,
    lineHeight: 19,
  },
  pendingRetry: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  pendingRetryText: {
    color: "#176447",
    fontSize: 13,
    fontWeight: "700",
  },
  mapButton: {
    alignSelf: "flex-start",
    borderColor: "#bd641f",
    borderRadius: 9,
    borderWidth: 1,
    marginTop: 4,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  mapButtonText: {
    color: "#a84f14",
    fontSize: 14,
    fontWeight: "700",
  },
  errorBox: {
    backgroundColor: "#fff0ee",
    borderRadius: 10,
    gap: 8,
    marginTop: 4,
    padding: 12,
  },
  error: {
    color: "#a12622",
    fontSize: 14,
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
  emptyState: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e0e5e1",
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 24,
  },
  emptyTitle: {
    color: "#20342a",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    color: "#68766d",
    fontSize: 14,
    textAlign: "center",
  },
  footer: {
    gap: 12,
    marginTop: 4,
  },
  startButton: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 56,
  },
  startButtonPressed: {
    backgroundColor: "#104b35",
  },
  disabledButton: {
    opacity: 0.55,
  },
  startButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },
  startedBanner: {
    alignItems: "center",
    backgroundColor: "#e5f1ea",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 52,
  },
  startedText: {
    color: "#176447",
    fontSize: 16,
    fontWeight: "700",
  },
  finishButton: {
    alignItems: "center",
    backgroundColor: "#fff0e3",
    borderColor: "#f0d7c0",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  finishButtonText: {
    color: "#a84f14",
    fontSize: 15,
    fontWeight: "700",
  },
  signOutButton: {
    alignItems: "center",
    borderColor: "#176447",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
  },
  signOutPressed: {
    backgroundColor: "#e5f1ea",
  },
  signOutText: {
    color: "#176447",
    fontSize: 16,
    fontWeight: "700",
  },
});
