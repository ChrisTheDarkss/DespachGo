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
  const guideCount = stops.reduce(
    (count, stop) => count + stop.ordenes.length,
    0,
  );
  const remainingStopCount = stops.filter(
    (stop) => stop.estado !== "entregada" && stop.estado !== "omitida",
  ).length;
  const routeDateLabel = route ? formatRouteDate(route.fecha) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={stops}
        keyExtractor={(stop) => stop.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topBar}>
              <Text style={styles.brand}>DESPACHGO</Text>
              {routeDateLabel ? (
                <Text style={styles.dateLabel}>{routeDateLabel}</Text>
              ) : null}
            </View>
            <Text accessibilityRole="header" style={styles.title}>
              Mi ruta de hoy
            </Text>
            {route ? (
              <>
                <View style={styles.routeSummary}>
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
                      {route.estado === "en_curso" ? "En curso" : "Sin iniciar"}
                    </Text>
                  </View>
                  {route.offlineCopy ? (
                    <Text style={styles.offlineTag}>Sin conexión</Text>
                  ) : null}
                </View>
                <View style={styles.stats}>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{stops.length}</Text>
                    <Text style={styles.statLabel}>paradas</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{guideCount}</Text>
                    <Text style={styles.statLabel}>
                      {guideCount === 1 ? "guía" : "guías"}
                    </Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{remainingStopCount}</Text>
                    <Text style={styles.statLabel}>por visitar</Text>
                  </View>
                </View>
                {route.offlineCopy ? (
                  <Text style={styles.offlineNotice}>
                    Mostrando la última ruta guardada. Algunas acciones no
                    están disponibles sin conexión.
                  </Text>
                ) : null}
                {route.estado === "en_curso" ? (
                  <View
                    style={[
                      styles.gpsBanner,
                      isGpsActive
                        ? styles.gpsBannerActive
                        : styles.gpsBannerInactive,
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
                        <Text style={styles.gpsRetryText}>
                          Activar o reintentar GPS
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                <View style={styles.viewToggle}>
                  <View
                    accessibilityRole="tab"
                    accessibilityState={{ selected: true }}
                    style={[styles.viewTab, styles.viewTabActive]}
                  >
                    <Text style={[styles.viewTabText, styles.viewTabTextActive]}>
                      ☷  Lista
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Ver mapa de la ruta"
                    accessibilityRole="button"
                    onPress={() => router.push("/map")}
                    style={({ pressed }) => [
                      styles.viewTab,
                      pressed && styles.viewTabPressed,
                    ]}
                  >
                    <Text style={styles.viewTabText}>⌖  Mapa</Text>
                  </Pressable>
                </View>
                <View style={styles.stopListHeading}>
                  <Text style={styles.sectionHeading}>Orden de visita</Text>
                  {stops.length > 1 ? (
                    <Text style={styles.reorderHint}>Ordena con las flechas</Text>
                  ) : null}
                </View>
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
                        pendingPhotoCount === 1
                          ? "foto pendiente"
                          : "fotos pendientes"
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
        refreshControl={
          <RefreshControl
            colors={["#176447"]}
            onRefresh={() => void loadRoute(true)}
            refreshing={isRefreshing}
            tintColor="#176447"
          />
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
        ListFooterComponent={<View style={styles.listEndSpace} />}
      />
      {route ? (
        <View style={styles.bottomAction}>
          {route.estado === "asignada" ? (
            <Pressable
              accessibilityRole="button"
              disabled={stops.length === 0 || route.offlineCopy === true}
              onPress={() => void handleStartRoute()}
              style={({ pressed }) => [
                styles.startButton,
                pressed && styles.startButtonPressed,
                (stops.length === 0 || route.offlineCopy === true) &&
                  styles.disabledButton,
              ]}
            >
              <Text style={styles.startButtonText}>▷  Iniciar ruta</Text>
            </Pressable>
          ) : (
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
                style={({ pressed }) => [
                  styles.finishButton,
                  pressed && styles.finishButtonPressed,
                  route.offlineCopy && styles.disabledButton,
                ]}
              >
                <Text style={styles.finishButtonText}>Fin de ruta</Text>
              </Pressable>
            </>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={isSigningOut || route.estado === "en_curso"}
            onPress={() => void handleSignOut()}
            style={({ pressed }) => [
              styles.signOutLink,
              pressed && styles.signOutPressed,
              (isSigningOut || route.estado === "en_curso") &&
                styles.disabledButton,
            ]}
          >
            {isSigningOut ? (
              <ActivityIndicator color="#176447" />
            ) : (
              <Text style={styles.signOutText}>Cerrar sesión</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.bottomAction}>
          <Pressable
            accessibilityRole="button"
            disabled={isSigningOut}
            onPress={() => void handleSignOut()}
            style={[styles.signOutButton, isSigningOut && styles.disabledButton]}
          >
            {isSigningOut ? (
              <ActivityIndicator color="#176447" />
            ) : (
              <Text style={styles.signOutText}>Cerrar sesión</Text>
            )}
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function formatRouteDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return value;
  }

  const formatted = new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f7f9f7",
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
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  listEndSpace: {
    height: 8,
  },
  stopRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  stopPressable: {
    flex: 1,
  },
  moveControls: {
    gap: 4,
  },
  moveButton: {
    alignItems: "center",
    backgroundColor: "#eaf4ef",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 34,
  },
  moveButtonPressed: {
    backgroundColor: "#dcebe2",
  },
  moveButtonText: {
    color: "#176447",
    fontSize: 18,
    fontWeight: "700",
  },
  moveDisabledButton: {
    opacity: 0.4,
  },
  header: {
    gap: 10,
    marginBottom: 2,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  brand: {
    color: "#176447",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  dateLabel: {
    color: "#68766d",
    fontSize: 10,
  },
  title: {
    color: "#20342a",
    fontSize: 23,
    fontWeight: "700",
    lineHeight: 28,
  },
  routeSummary: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  routeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#fff0e3",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  routeBadgeActive: {
    backgroundColor: "#e5f1ea",
  },
  routeBadgeText: {
    color: "#a84f14",
    fontSize: 10,
    fontWeight: "700",
  },
  routeBadgeTextActive: {
    color: "#176447",
  },
  offlineTag: {
    color: "#8c4a1b",
    fontSize: 10,
  },
  stats: {
    backgroundColor: "#176447",
    borderRadius: 11,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  stat: {
    alignItems: "center",
    flex: 1,
    gap: 2,
  },
  statValue: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  statLabel: {
    color: "#d8e9df",
    fontSize: 9,
  },
  offlineNotice: {
    backgroundColor: "#fff0e3",
    borderRadius: 9,
    color: "#8c4a1b",
    fontSize: 11,
    lineHeight: 16,
    padding: 9,
  },
  gpsBanner: {
    borderRadius: 10,
    gap: 6,
    padding: 10,
  },
  gpsBannerActive: {
    backgroundColor: "#eaf2ed",
  },
  gpsBannerInactive: {
    backgroundColor: "#fff0e3",
  },
  gpsText: {
    color: "#8c4a1b",
    fontSize: 12,
    fontWeight: "700",
  },
  gpsTextActive: {
    color: "#176447",
  },
  gpsError: {
    color: "#a3352c",
    fontSize: 11,
    lineHeight: 16,
  },
  gpsRetry: {
    alignSelf: "flex-start",
    paddingVertical: 3,
  },
  gpsRetryText: {
    color: "#176447",
    fontSize: 11,
    fontWeight: "700",
  },
  viewToggle: {
    backgroundColor: "#e9eeea",
    borderRadius: 9,
    flexDirection: "row",
    gap: 4,
    padding: 3,
  },
  viewTab: {
    alignItems: "center",
    borderRadius: 7,
    flex: 1,
    justifyContent: "center",
    minHeight: 32,
  },
  viewTabActive: {
    backgroundColor: "#ffffff",
  },
  viewTabPressed: {
    backgroundColor: "#dfe8e2",
  },
  viewTabText: {
    color: "#65746a",
    fontSize: 10,
    fontWeight: "600",
  },
  viewTabTextActive: {
    color: "#176447",
  },
  stopListHeading: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  sectionHeading: {
    color: "#263c31",
    fontSize: 13,
    fontWeight: "700",
  },
  reorderHint: {
    color: "#176447",
    fontSize: 9,
  },
  pendingBanner: {
    backgroundColor: "#fff7ef",
    borderColor: "#f0d7c0",
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 10,
  },
  pendingText: {
    color: "#8c4a1b",
    fontSize: 11,
    fontWeight: "700",
  },
  pendingError: {
    color: "#a3352c",
    fontSize: 11,
    lineHeight: 16,
  },
  pendingRetry: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  pendingRetryText: {
    color: "#176447",
    fontSize: 11,
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
    padding: 18,
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
  bottomAction: {
    backgroundColor: "#f7f9f7",
    borderTopColor: "#e6ebe7",
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 9,
  },
  startButton: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 42,
  },
  startButtonPressed: {
    backgroundColor: "#104b35",
  },
  disabledButton: {
    opacity: 0.55,
  },
  startButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  startedBanner: {
    alignItems: "center",
    backgroundColor: "#e5f1ea",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 36,
  },
  startedText: {
    color: "#176447",
    fontSize: 12,
    fontWeight: "700",
  },
  finishButton: {
    alignItems: "center",
    backgroundColor: "#fff0e3",
    borderColor: "#f0d7c0",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 12,
  },
  finishButtonPressed: {
    backgroundColor: "#ffe5d1",
  },
  finishButtonText: {
    color: "#a84f14",
    fontSize: 11,
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
  signOutLink: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 26,
  },
  signOutText: {
    color: "#176447",
    fontSize: 10,
  },
});
