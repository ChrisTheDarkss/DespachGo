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
  finalizeDriverRoute,
  getTodaysDriverRoute,
  type RouteFinalSummary,
} from "@/src/services/driverRoute";
import { stopLocationTracking, syncGpsLocation } from "@/src/services/gpsTracking";
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

    try {
      const currentRoute = await getTodaysDriverRoute(userId);
      if (!currentRoute || currentRoute.id !== routeId) {
        throw new Error("La ruta ya no está disponible para finalizar.");
      }
      setRoute(currentRoute);
      if (currentRoute.offlineCopy) {
        setError("Conéctate a internet para revisar y finalizar la ruta.");
      } else if (currentRoute.estado !== "en_curso") {
        setError("Solo se puede finalizar una ruta que esté en curso.");
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar el resumen de la ruta.",
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
    if (pendingDeliveries.length > 0) {
      setError(
        "Sincroniza primero todas las entregas y fotos pendientes antes de cerrar la ruta.",
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
    pendingDeliveries.length === 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹  Volver a mi ruta</Text>
        </Pressable>
        <Text style={styles.eyebrow}>CIERRE DE RECORRIDO</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Fin de ruta
        </Text>

        {counts ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Resumen actual</Text>
            <SummaryRow label="Entregadas" value={counts.entregadas} />
            <SummaryRow label="Parciales" value={counts.parciales} />
            <SummaryRow label="Fallidas" value={counts.fallidas} />
            <SummaryRow label="Omitidas" value={counts.omitidas} />
            <SummaryRow label="Sin visitar" value={counts.sin_visitar} />
          </View>
        ) : null}

        {gpsState.active ? (
          <View style={styles.gpsBanner}>
            <Text style={styles.gpsText}>
              Seguimiento GPS activo durante esta ruta.
            </Text>
            {gpsState.error ? (
              <Text style={styles.warning}>{gpsState.error}</Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.warning}>
            El seguimiento GPS no aparece activo. Puedes reactivarlo antes de finalizar.
          </Text>
        )}
        {gpsReadError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {gpsReadError}
          </Text>
        ) : null}
        {pendingDeliveries.length > 0 ? (
          <View style={styles.pendingBanner}>
            <Text style={styles.warning}>
              Hay {pendingDeliveries.length} registro(s) de entrega pendientes
              de sincronización.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void refreshOutbox(true)}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Reintentar sincronización</Text>
            </Pressable>
          </View>
        ) : null}
        {isOutboxLoading ? (
          <Text style={styles.secondaryText}>
            Revisando entregas pendientes antes del cierre...
          </Text>
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

        <Pressable
          accessibilityRole="button"
          disabled={!canFinalize || isFinalizing}
          onPress={() => setIsConfirmationVisible(true)}
          style={[
            styles.primaryButton,
            (!canFinalize || isFinalizing) && styles.disabledButton,
          ]}
        >
          <Text style={styles.primaryButtonText}>Finalizar ruta</Text>
        </Pressable>
      </ScrollView>

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
              pendientes quedarán cerradas. Esta acción no se puede deshacer.
            </Text>
            {pendingDeliveries.length > 0 ? (
              <Text style={styles.error}>
                Primero sincroniza las entregas y fotos pendientes.
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
    backgroundColor: "#f5f7f5",
    flex: 1,
  },
  loading: {
    alignItems: "center",
    flex: 1,
    gap: 14,
    justifyContent: "center",
  },
  content: {
    gap: 15,
    padding: 20,
    paddingBottom: 36,
  },
  backButton: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: 40,
  },
  backText: {
    color: "#176447",
    fontSize: 15,
    fontWeight: "700",
  },
  eyebrow: {
    color: "#bd641f",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    color: "#20342a",
    fontSize: 27,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e0e5e1",
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  sectionTitle: {
    color: "#20342a",
    fontSize: 18,
    fontWeight: "700",
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
  gpsBanner: {
    backgroundColor: "#eaf2ed",
    borderRadius: 9,
    gap: 6,
    padding: 12,
  },
  gpsText: {
    color: "#176447",
    fontSize: 14,
    fontWeight: "700",
  },
  pendingBanner: {
    backgroundColor: "#fff7ef",
    borderColor: "#f0d7c0",
    borderRadius: 9,
    borderWidth: 1,
    gap: 8,
    padding: 12,
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
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 52,
    padding: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.5,
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
