import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ComponentRef } from "react";
import type { GestureResponderEvent } from "react-native";
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActiveRouteMap } from "@/src/components/ActiveRouteMap";
import { RouteLoadChecklist } from "@/src/components/RouteLoadChecklist";
import { StopCard } from "@/src/components/StopCard";
import { useAuth } from "@/src/hooks/useAuth";
import { useDeliveryOutbox } from "@/src/hooks/useDeliveryOutbox";
import { useGpsTracking } from "@/src/hooks/useGpsTracking";
import {
  confirmRouteLoad,
  getConfirmedRouteLoad,
} from "@/src/services/driverLoad";
import {
  getTodaysDriverRoute,
  reorderDriverStops,
} from "@/src/services/driverRoute";
import { getTodaysRouteProductsSummary } from "@/src/services/routeProducts";
import type { DriverRoute, RouteStop } from "@/src/types/route";
import type { RouteProductsSummary } from "@/src/types/routeProducts";

type RouteView = "lista" | "carga" | "mapa";
type StopListFilter = "no_entregados" | "entregados" | "todos";

const stopListFilters: { id: StopListFilter; label: string }[] = [
  { id: "no_entregados", label: "No entregados" },
  { id: "entregados", label: "Entregados" },
  { id: "todos", label: "Todos" },
];

function isCompletedStop(stop: RouteStop) {
  return (
    stop.estado === "entregada" ||
    stop.estado === "parcial" ||
    stop.estado === "omitida"
  );
}

function getAvailableRouteViews(route: DriverRoute | null): RouteView[] {
  if (!route) {
    return [];
  }
  return route.estado === "asignada"
    ? ["lista", "carga", "mapa"]
    : ["lista", "mapa"];
}

export default function TodayRouteScreen() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  const { session, signOut } = useAuth();
  const router = useRouter();
  const conductorId = session?.user.id;
  const {
    queue: pendingDeliveries,
    error: outboxError,
    refresh: refreshOutbox,
  } = useDeliveryOutbox(conductorId);
  const [route, setRoute] = useState<DriverRoute | null>(null);
  // true mientras el dedo arrastra el mapa: congela el scroll de la pantalla.
  const [mapInteracting, setMapInteracting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isConfirmingLoad, setIsConfirmingLoad] = useState(false);
  const [selectedRouteView, setSelectedRouteView] =
    useState<RouteView>("lista");
  const [selectedStopFilter, setSelectedStopFilter] =
    useState<StopListFilter>("no_entregados");
  const [isStopFilterOpen, setIsStopFilterOpen] = useState(false);
  const stopFilterAnchorRef = useRef<ComponentRef<typeof View>>(null);
  const [stopFilterPosition, setStopFilterPosition] = useState({
    left: 0,
    top: 0,
  });
  const [routeProducts, setRouteProducts] =
    useState<RouteProductsSummary | null>(null);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedLoadProductIds, setSelectedLoadProductIds] = useState<
    string[]
  >([]);
  const [isLoadConfirmed, setIsLoadConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousRouteState = useRef<DriverRoute["estado"] | null>(null);
  const previousQueuedStopIds = useRef<string | null>(null);
  const routeSwipeStart = useRef<{ pageX: number; pageY: number } | null>(null);
  const excludeRouteSwipe = useRef(false);
  const { state: gpsState, error: gpsError } = useGpsTracking(
    conductorId,
    route?.id,
  );

  function toggleStopFilter() {
    if (isStopFilterOpen) {
      setIsStopFilterOpen(false);
      return;
    }

    stopFilterAnchorRef.current?.measureInWindow((left, top, _width, height) => {
      setStopFilterPosition({ left, top: top + height + 6 });
      setIsStopFilterOpen(true);
    });
  }

  const loadRoute = useCallback(
    async (refresh = false) => {
      if (!conductorId) {
        setRoute(null);
        setRouteProducts(null);
        setIsLoadingProducts(false);
        setIsLoading(false);
        return;
      }

      setError(null);
      setLoadError(null);
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const currentRoute = await getTodaysDriverRoute(conductorId);
        setRoute(currentRoute);
        if (!currentRoute) {
          previousRouteState.current = null;
          setRouteProducts(null);
          setIsLoadingProducts(false);
          setSelectedLoadProductIds([]);
          setIsLoadConfirmed(false);
          return;
        }
        if (
          currentRoute.estado === "en_curso" &&
          previousRouteState.current !== "en_curso"
        ) {
          setSelectedRouteView("mapa");
        } else if (
          currentRoute.estado === "asignada" &&
          view !== "mapa"
        ) {
          setSelectedRouteView("lista");
        }
        previousRouteState.current = currentRoute.estado;
        setIsLoadingProducts(true);
        setProductsError(null);
        try {
          const [summary, confirmedLoad] = await Promise.all([
            getTodaysRouteProductsSummary(conductorId, currentRoute),
            currentRoute.estado === "asignada"
              ? getConfirmedRouteLoad(conductorId, currentRoute.id)
              : Promise.resolve(null),
          ]);
          setRouteProducts(summary);
          const availableProductIds = new Set(
            summary.total_general.map(({ producto_id }) => producto_id),
          );
          const confirmedProductIds =
            confirmedLoad?.products
              .map(({ producto_id }) => producto_id)
              .filter((productId) => availableProductIds.has(productId)) ?? [];
          setSelectedLoadProductIds(confirmedProductIds);
          setIsLoadConfirmed(
            confirmedLoad !== null &&
              confirmedProductIds.length === confirmedLoad.products.length,
          );
        } catch (productsLoadError) {
          setRouteProducts(null);
          setSelectedLoadProductIds([]);
          setIsLoadConfirmed(false);
          setProductsError(
            productsLoadError instanceof Error
              ? productsLoadError.message
              : "No se pudieron cargar los productos de la ruta.",
          );
        } finally {
          setIsLoadingProducts(false);
        }
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
    [conductorId, view],
  );

  useFocusEffect(
    useCallback(() => {
      void loadRoute();
    }, [loadRoute]),
  );

  useEffect(() => {
    if (view === "mapa") {
      setSelectedRouteView("mapa");
    }
  }, [view]);

  const pendingStopIdSignature = pendingDeliveries
    .map(({ stopId }) => stopId)
    .sort()
    .join(",");

  useEffect(() => {
    if (previousQueuedStopIds.current === null) {
      previousQueuedStopIds.current = pendingStopIdSignature;
      return;
    }
    if (previousQueuedStopIds.current !== pendingStopIdSignature) {
      previousQueuedStopIds.current = pendingStopIdSignature;
      void loadRoute(true);
    }
  }, [loadRoute, pendingStopIdSignature]);

  // Seguro: si por algún motivo no llega el aviso de que se soltó el dedo, la
  // pantalla vuelve a desplazarse sola para no quedar bloqueada.
  useEffect(() => {
    if (!mapInteracting) {
      return;
    }
    const timer = setTimeout(() => setMapInteracting(false), 10_000);
    return () => clearTimeout(timer);
  }, [mapInteracting]);

  function markRouteSwipeExcluded() {
    excludeRouteSwipe.current = true;
  }

  function handleContentTouchStart(event: GestureResponderEvent) {
    if (excludeRouteSwipe.current) {
      excludeRouteSwipe.current = false;
      routeSwipeStart.current = null;
      return;
    }

    routeSwipeStart.current = {
      pageX: event.nativeEvent.pageX,
      pageY: event.nativeEvent.pageY,
    };
  }

  function handleContentTouchEnd(event: GestureResponderEvent) {
    const start = routeSwipeStart.current;
    const startedOnControl = excludeRouteSwipe.current;
    routeSwipeStart.current = null;
    excludeRouteSwipe.current = false;
    if (!start || startedOnControl) {
      return;
    }

    const deltaX = event.nativeEvent.pageX - start.pageX;
    const deltaY = event.nativeEvent.pageY - start.pageY;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
      return;
    }

    const availableViews = getAvailableRouteViews(route);
    const currentIndex = availableViews.indexOf(selectedRouteView);
    const nextIndex = currentIndex + (deltaX < 0 ? 1 : -1);
    if (currentIndex >= 0 && nextIndex >= 0 && nextIndex < availableViews.length) {
      setSelectedRouteView(availableViews[nextIndex]);
    }
  }

  function handleStartRoute() {
    if (
      !route ||
      route.estado !== "asignada" ||
      route.offlineCopy ||
      !isLoadConfirmed
    ) {
      return;
    }

    router.push({
      pathname: "../gps-consent",
      params: { routeId: route.id },
    });
  }

  function handleToggleLoadProduct(productId: string) {
    setSelectedLoadProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
    setIsLoadConfirmed(false);
    setLoadError(null);
  }

  async function handleConfirmLoad() {
    if (
      !route ||
      route.estado !== "asignada" ||
      !conductorId ||
      isConfirmingLoad
    ) {
      return;
    }

    const products = routeProducts?.total_general.filter(({ producto_id }) =>
      selectedLoadProductIds.includes(producto_id),
    );
    if (!products?.length) {
      setLoadError("Marca al menos un producto antes de confirmar la lista.");
      return;
    }

    setIsConfirmingLoad(true);
    setLoadError(null);
    try {
      await confirmRouteLoad(conductorId, route.id, products);
      setIsLoadConfirmed(true);
    } catch (confirmError) {
      setLoadError(
        confirmError instanceof Error
          ? confirmError.message
          : "No se pudo confirmar la carga.",
      );
    } finally {
      setIsConfirmingLoad(false);
    }
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

  async function handleMoveStop(stopId: string, direction: -1 | 1) {
    if (
      !route ||
      (route.estado !== "asignada" && route.estado !== "en_curso") ||
      route.offlineCopy ||
      isReordering
    ) {
      return;
    }

    const queuedStopIds = new Set(
      pendingDeliveries.map((delivery) => delivery.stopId),
    );
    const reorderableStops = route.paradas.filter(
      (stop) => !isCompletedStop(stop) && !queuedStopIds.has(stop.id),
    );
    const index = reorderableStops.findIndex((stop) => stop.id === stopId);
    const nextIndex = index + direction;
    if (
      index < 0 ||
      nextIndex < 0 ||
      nextIndex >= reorderableStops.length
    ) {
      return;
    }

    const reorderedStops = [...reorderableStops];
    [reorderedStops[index], reorderedStops[nextIndex]] = [
      reorderedStops[nextIndex],
      reorderedStops[index],
    ];
    let reorderableIndex = 0;
    const orderedRouteStops = route.paradas.map((stop) =>
      !isCompletedStop(stop) && !queuedStopIds.has(stop.id)
        ? reorderedStops[reorderableIndex++]
        : stop,
    );

    setError(null);
    setIsReordering(true);
    try {
      await reorderDriverStops(
        route.id,
        orderedRouteStops.map((stop) => stop.id),
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
  const pendingStopIds = pendingDeliveries.map(({ stopId }) => stopId);
  const pendingStopIdSet = new Set(pendingStopIds);
  const reorderableStops = stops.filter(
    (stop) => !isCompletedStop(stop) && !pendingStopIdSet.has(stop.id),
  );
  const reorderableStopIndexById = new Map(
    reorderableStops.map((stop, index) => [stop.id, index]),
  );
  const visibleStops = stops.filter((stop) =>
    selectedStopFilter === "todos"
      ? true
      : selectedStopFilter === "entregados"
        ? isCompletedStop(stop)
        : !isCompletedStop(stop),
  );
  const productsByStop = new Map(
    (routeProducts?.paradas ?? []).map((stop) => [
      stop.parada_id,
      stop.productos,
    ]),
  );
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
    (stop) => stop.estado === "pendiente",
  ).length;
  const routeDateLabel = route ? formatRouteDate(route.fecha) : null;
  const emptyStopsMessage = !route
    ? "No tienes una ruta asignada para hoy."
    : stops.length === 0
      ? "Esta ruta todavía no tiene paradas."
      : selectedStopFilter === "no_entregados"
        ? "No quedan paradas sin entregar."
        : selectedStopFilter === "entregados"
          ? "Todavía no hay paradas entregadas, parciales u omitidas."
          : "No hay paradas para mostrar.";

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={selectedRouteView === "lista" ? visibleStops : []}
        keyExtractor={(stop) => stop.id}
        scrollEnabled={!mapInteracting}
        onTouchCancel={() => {
          routeSwipeStart.current = null;
          excludeRouteSwipe.current = false;
        }}
        onTouchEnd={handleContentTouchEnd}
        onTouchStart={handleContentTouchStart}
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
                {selectedRouteView !== "mapa" ? (
                  <View
                    style={[
                      styles.stats,
                      selectedRouteView === "lista" &&
                        route.estado === "asignada" &&
                        styles.listStats,
                    ]}
                  >
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
                ) : null}
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
                        onTouchStart={markRouteSwipeExcluded}
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
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{
                      selected: selectedRouteView === "lista",
                    }}
                    onTouchStart={markRouteSwipeExcluded}
                    onPress={() => setSelectedRouteView("lista")}
                    style={({ pressed }) => [
                      styles.viewTab,
                      selectedRouteView === "lista" &&
                        (route.estado === "asignada"
                          ? styles.listTabActive
                          : styles.viewTabActive),
                      pressed && styles.viewTabPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.viewTabText,
                        selectedRouteView === "lista" &&
                          (route.estado === "asignada"
                            ? styles.listTabTextActive
                            : styles.viewTabTextActive),
                      ]}
                    >
                      ☷  Lista
                    </Text>
                  </Pressable>
                  {route.estado === "asignada" ? (
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{
                        selected: selectedRouteView === "carga",
                      }}
                      onTouchStart={markRouteSwipeExcluded}
                      onPress={() => setSelectedRouteView("carga")}
                      style={({ pressed }) => [
                        styles.viewTab,
                        selectedRouteView === "carga" && styles.viewTabActive,
                        pressed && styles.viewTabPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.viewTabText,
                          selectedRouteView === "carga" &&
                            styles.viewTabTextActive,
                        ]}
                      >
                        Carga
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{
                      selected: selectedRouteView === "mapa",
                    }}
                    onTouchStart={markRouteSwipeExcluded}
                    onPress={() => setSelectedRouteView("mapa")}
                    style={({ pressed }) => [
                      styles.viewTab,
                      selectedRouteView === "mapa" && styles.viewTabActive,
                      pressed && styles.viewTabPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.viewTabText,
                        selectedRouteView === "mapa" &&
                          styles.viewTabTextActive,
                      ]}
                    >
                      ⌖  Mapa
                    </Text>
                  </Pressable>
                </View>
                {selectedRouteView === "lista" ? (
                  <>
                    <View style={styles.stopListHeading}>
                      <Text style={styles.sectionHeading}>Orden de visita</Text>
                    </View>
                    <View style={styles.stopFilterRow}>
                      <View
                        collapsable={false}
                        ref={stopFilterAnchorRef}
                      >
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{
                            expanded: isStopFilterOpen,
                          }}
                          onTouchStart={markRouteSwipeExcluded}
                          onPress={toggleStopFilter}
                          style={({ pressed }) => [
                            styles.stopFilterButton,
                            pressed && styles.stopFilterButtonPressed,
                          ]}
                        >
                          <Text style={styles.stopFilterButtonText}>
                            {stopListFilters.find(
                              ({ id }) => id === selectedStopFilter,
                            )?.label ?? "No entregados"}
                          </Text>
                          <Text style={styles.stopFilterChevron}>
                            {isStopFilterOpen ? "▴" : "▾"}
                          </Text>
                        </Pressable>
                      </View>
                      {selectedStopFilter === "no_entregados" &&
                      route.offlineCopy !== true &&
                      reorderableStops.length > 1 ? (
                        <Text style={styles.reorderHint}>
                          Ordena con las flechas
                        </Text>
                      ) : null}
                    </View>
                  </>
                ) : null}
                {selectedRouteView === "carga" ? (
                  <RouteLoadChecklist
                    error={loadError ?? productsError}
                    isConfirmed={isLoadConfirmed}
                    isLoading={isLoadingProducts}
                    onToggleProduct={handleToggleLoadProduct}
                    onInteractionStart={markRouteSwipeExcluded}
                    products={routeProducts?.total_general ?? []}
                    selectedProductIds={selectedLoadProductIds}
                  />
                ) : null}
                {selectedRouteView === "mapa" ? (
                  <View
                    onTouchEnd={() => setMapInteracting(false)}
                    onTouchCancel={() => setMapInteracting(false)}
                    onTouchStart={() => {
                      markRouteSwipeExcluded();
                      setMapInteracting(true);
                    }}
                  >
                    <ActiveRouteMap
                      onMapInteractionChange={setMapInteracting}
                      currentLocation={gpsState.latestLocation}
                      gpsTrackingActive={
                        gpsState.active && gpsState.routeId === route.id
                      }
                      pendingStopIds={pendingStopIds}
                      route={route}
                    />
                  </View>
                ) : null}
                {selectedRouteView !== "carga" && productsError ? (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {productsError}
                  </Text>
                ) : null}
              </>
            ) : null}
            {selectedRouteView === "lista" &&
            pendingDeliveries.length > 0 ? (
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
                  onTouchStart={markRouteSwipeExcluded}
                  onPress={() => void refreshOutbox(true)}
                  style={styles.pendingRetry}
                >
                  <Text style={styles.pendingRetryText}>
                    Reintentar sincronización
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {selectedRouteView === "lista" && outboxError ? (
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
                  onTouchStart={markRouteSwipeExcluded}
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
          selectedRouteView === "lista" ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {emptyStopsMessage}
              </Text>
              <Text style={styles.emptyText}>
                Desliza hacia abajo para actualizar.
              </Text>
            </View>
          ) : undefined
        }
        renderItem={({ item, index }) => {
          const reorderableIndex = reorderableStopIndexById.get(item.id);
          const canShowMoveControls =
            selectedStopFilter === "no_entregados" &&
            (route?.estado === "asignada" || route?.estado === "en_curso") &&
            reorderableIndex !== undefined;
          const canMoveUp =
            canShowMoveControls &&
            reorderableIndex !== undefined &&
            reorderableIndex > 0;
          const canMoveDown =
            canShowMoveControls &&
            reorderableIndex !== undefined &&
            reorderableIndex < reorderableStops.length - 1;

          return (
            <View style={styles.stopRow}>
              <StopCard
                hasPendingDelivery={pendingStopIdSet.has(item.id)}
                number={item.posicion || index + 1}
                onInteractionStart={markRouteSwipeExcluded}
                onPress={() =>
                  router.push({
                    pathname: "/stop/[id]",
                    params: { id: item.id },
                  })
                }
                products={productsByStop.get(item.id)}
                stop={item}
              />
              {canShowMoveControls ? (
                <View style={styles.moveControls}>
                  <Pressable
                    accessibilityLabel={`Mover parada ${item.posicion} hacia arriba`}
                    accessibilityRole="button"
                    disabled={
                      isReordering ||
                      route?.offlineCopy === true ||
                      !canMoveUp
                    }
                    onTouchStart={markRouteSwipeExcluded}
                    onPress={() => void handleMoveStop(item.id, -1)}
                    style={({ pressed }) => [
                      styles.moveButton,
                      (isReordering ||
                        route?.offlineCopy === true ||
                        !canMoveUp) &&
                        styles.moveButtonDisabled,
                      !isReordering &&
                        route?.offlineCopy !== true &&
                        canMoveUp &&
                        styles.moveButtonEnabled,
                      pressed && styles.moveButtonPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.moveButtonText,
                        !isReordering &&
                          route?.offlineCopy !== true &&
                          canMoveUp &&
                          styles.moveButtonTextEnabled,
                      ]}
                    >
                      ↑
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Mover parada ${item.posicion} hacia abajo`}
                    accessibilityRole="button"
                    disabled={
                      isReordering ||
                      route?.offlineCopy === true ||
                      !canMoveDown
                    }
                    onTouchStart={markRouteSwipeExcluded}
                    onPress={() => void handleMoveStop(item.id, 1)}
                    style={({ pressed }) => [
                      styles.moveButton,
                      (isReordering ||
                        route?.offlineCopy === true ||
                        !canMoveDown) &&
                        styles.moveButtonDisabled,
                      !isReordering &&
                        route?.offlineCopy !== true &&
                        canMoveDown &&
                        styles.moveButtonEnabled,
                      pressed && styles.moveButtonPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.moveButtonText,
                        !isReordering &&
                          route?.offlineCopy !== true &&
                          canMoveDown &&
                          styles.moveButtonTextEnabled,
                      ]}
                    >
                      ↓
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        }}
        ListFooterComponent={
          selectedRouteView === "lista" ? (
            <View style={styles.listEndSpace} />
          ) : undefined
        }
      />
      {route ? (
        <View style={styles.bottomAction}>
          {route.estado === "asignada" ? (
            selectedRouteView === "carga" ? (
              <Pressable
                accessibilityRole="button"
                onTouchStart={markRouteSwipeExcluded}
                disabled={
                  isConfirmingLoad ||
                  isLoadingProducts ||
                  selectedLoadProductIds.length === 0
                }
                onPress={() => void handleConfirmLoad()}
                style={({ pressed }) => [
                  styles.startButton,
                  pressed && styles.startButtonPressed,
                  (isConfirmingLoad ||
                    isLoadingProducts ||
                    selectedLoadProductIds.length === 0) &&
                    styles.disabledButton,
                ]}
              >
                {isConfirmingLoad ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.startButtonText}>
                    {isLoadConfirmed ? "Lista confirmada" : "Confirmar Lista"}
                  </Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onTouchStart={markRouteSwipeExcluded}
                accessibilityState={{
                  disabled:
                    stops.length === 0 ||
                    route.offlineCopy === true ||
                    !isLoadConfirmed,
                }}
                disabled={
                  stops.length === 0 ||
                  route.offlineCopy === true ||
                  !isLoadConfirmed
                }
                onPress={() => void handleStartRoute()}
                style={({ pressed }) => [
                  styles.startButton,
                  pressed && styles.startButtonPressed,
                  (stops.length === 0 ||
                    route.offlineCopy === true ||
                    !isLoadConfirmed) &&
                    styles.disabledButton,
                ]}
              >
                <Text style={styles.startButtonText}>▷  Iniciar ruta</Text>
              </Pressable>
            )
          ) : (
            <>
              <View style={styles.startedBanner}>
                <Text style={styles.startedText}>Tu ruta está en curso</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onTouchStart={markRouteSwipeExcluded}
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
            onTouchStart={markRouteSwipeExcluded}
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
            onTouchStart={markRouteSwipeExcluded}
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
      <Modal
        animationType="fade"
        onRequestClose={() => setIsStopFilterOpen(false)}
        statusBarTranslucent
        transparent
        visible={isStopFilterOpen}
      >
        <View style={styles.stopFilterModal}>
          <Pressable
            accessibilityLabel="Cerrar opciones de vista"
            accessibilityRole="button"
            onPress={() => setIsStopFilterOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.stopFilterMenu, stopFilterPosition]}>
            {stopListFilters.map(({ id, label }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: selectedStopFilter === id }}
                key={id}
                onTouchStart={markRouteSwipeExcluded}
                onPress={() => {
                  setSelectedStopFilter(id);
                  setIsStopFilterOpen(false);
                }}
                style={({ pressed }) => [
                  styles.stopFilterOption,
                  selectedStopFilter === id &&
                    styles.stopFilterOptionSelected,
                  pressed && styles.stopFilterOptionPressed,
                ]}
              >
                <Text
                  style={[
                    styles.stopFilterOptionText,
                    selectedStopFilter === id &&
                      styles.stopFilterOptionTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
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
  moveControls: {
    gap: 4,
  },
  moveButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 34,
  },
  moveButtonEnabled: {
    backgroundColor: "#eaf4ef",
  },
  moveButtonDisabled: {
    backgroundColor: "transparent",
    opacity: 0.45,
  },
  moveButtonPressed: {
    backgroundColor: "#dcebe2",
  },
  moveButtonText: {
    color: "#2850c7",
    fontSize: 18,
    fontWeight: "700",
  },
  moveButtonTextEnabled: {
    color: "#176447",
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
  listStats: {
    backgroundColor: "#2850c7",
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
  listTabActive: {
    backgroundColor: "#ffffff",
    borderColor: "#2850c7",
    borderWidth: 1,
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
  listTabTextActive: {
    color: "#2850c7",
  },
  stopListHeading: {
    alignItems: "baseline",
    marginTop: 2,
  },
  sectionHeading: {
    color: "#263c31",
    fontSize: 13,
    fontWeight: "700",
  },
  stopFilterRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 34,
  },
  stopFilterButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#2850c7",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 32,
    minWidth: 160,
    paddingHorizontal: 10,
  },
  stopFilterButtonPressed: {
    backgroundColor: "#eef3ff",
  },
  stopFilterButtonText: {
    color: "#2850c7",
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  stopFilterChevron: {
    color: "#2850c7",
    fontSize: 14,
    fontWeight: "700",
  },
  stopFilterMenu: {
    backgroundColor: "#ffffff",
    borderColor: "#dce5df",
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 160,
    paddingVertical: 4,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  stopFilterModal: {
    flex: 1,
  },
  stopFilterOption: {
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 10,
  },
  stopFilterOptionSelected: {
    backgroundColor: "#eef3ff",
  },
  stopFilterOptionPressed: {
    backgroundColor: "#e5ebfb",
  },
  stopFilterOptionText: {
    color: "#42544a",
    fontSize: 13,
  },
  stopFilterOptionTextSelected: {
    color: "#2850c7",
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
