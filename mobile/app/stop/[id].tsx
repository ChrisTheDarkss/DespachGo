import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/hooks/useAuth";
import { useDeliveryOutbox } from "@/src/hooks/useDeliveryOutbox";
import {
  getDriverStopDetails,
  retryDriverStop,
} from "@/src/services/driverRoute";
import type {
  CustomerConfirmation,
  StopDetail,
  StopStatus,
} from "@/src/types/route";

const statusLabels: Record<StopStatus, string> = {
  pendiente: "Pendiente",
  entregada: "Entregada",
  parcial: "Entrega parcial",
  fallida_por_reintentar: "Fallida · Reintentar",
  fallida: "Fallida",
  omitida: "Omitida",
};

const confirmationLabels: Record<CustomerConfirmation, string> = {
  confirmo: "✓ Visita confirmada",
  no_habra_nadie: "Cliente no estará",
  sin_respuesta: "Sin respuesta",
  quiere_hablar: "Quiere hablar",
  otro: "Respuesta recibida",
};

const contentTopInset = Platform.OS === "web" ? 48 : 8;
const unitFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 2,
});

export default function StopDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const stopId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const { session } = useAuth();
  const conductorId = session?.user.id;
  const { queue: pendingDeliveries } = useDeliveryOutbox(conductorId);
  const [stop, setStop] = useState<StopDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [areGuidesExpanded, setAreGuidesExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      async function loadStop() {
        if (!stopId || !conductorId) {
          setError("No se indicó qué parada consultar o no hay una sesión activa.");
          setIsLoading(false);
          return;
        }

        setIsLoading(true);
        setError(null);
        try {
          const details = await getDriverStopDetails(stopId, conductorId);
          if (isMounted) {
            setStop(details);
          }
        } catch (loadError) {
          if (isMounted) {
            setError(
              loadError instanceof Error
                ? loadError.message
                : "No se pudo cargar el detalle de la parada.",
            );
          }
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      }

      void loadStop();
      return () => {
        isMounted = false;
      };
    }, [conductorId, stopId]),
  );

  async function handleCall() {
    const phone = stop?.ordenes[0]?.telefono;
    if (!phone) {
      setError("Esta parada no tiene un teléfono de contacto.");
      return;
    }

    setError(null);
    setIsCalling(true);
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch (callError) {
      setError(
        callError instanceof Error
          ? callError.message
          : "No se pudo abrir la llamada telefónica.",
      );
    } finally {
      setIsCalling(false);
    }
  }

  async function handleRetryStop() {
    if (!stop || isRetrying || stop.offlineCopy) {
      return;
    }

    setError(null);
    setIsRetrying(true);
    try {
      await retryDriverStop(stop.id);
      router.back();
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : "No se pudo reintentar la parada.",
      );
    } finally {
      setIsRetrying(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#176447" />
          <Text style={styles.secondaryText}>Cargando detalle...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!stop) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <Text accessibilityRole="alert" style={styles.error}>
            {error ?? "No se encontró la parada."}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Volver a mi ruta</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const firstOrder = stop.ordenes[0];
  const canOpenMap =
    stop.estado !== "entregada" &&
    stop.estado !== "parcial" &&
    stop.estado !== "omitida";
  const hasPendingDelivery = pendingDeliveries.some(
    (action) => action.stopId === stop.id,
  );
  const canOmit =
    !stop.offlineCopy &&
    stop.ruta_estado === "en_curso" &&
    stop.estado === "pendiente" &&
    !hasPendingDelivery;
  const canRecordDelivery =
    stop.ruta_estado === "en_curso" &&
    stop.estado === "pendiente" &&
    !hasPendingDelivery;
  const canRetry =
    !stop.offlineCopy &&
    stop.ruta_estado === "en_curso" &&
    stop.estado === "fallida_por_reintentar";
  const notes = stop.ordenes
    .map((order) => order.notas)
    .filter((note): note is string => Boolean(note?.trim()));
  const products = stop.ordenes.flatMap((order) =>
    order.items.map((item) => ({ ...item, numero_guia: order.numero_guia })),
  );
  const totalUnits = products.reduce(
    (total, product) => total + product.cantidad_pedida,
    0,
  );
  const routeCode = `RUTA ${stop.ruta_id.slice(0, 8).toUpperCase()}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver a mi ruta"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.routeCode}>{routeCode}</Text>
          <Text accessibilityLabel="Ayuda" style={styles.helpIcon}>?</Text>
        </View>

        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            Detalle de la parada
          </Text>
          <Text style={styles.subtitle}>
            Parada {stop.posicion}
            {stop.total_paradas ? ` de ${stop.total_paradas}` : ""} ·{" "}
            {stop.ruta_estado === "en_curso" ? "Ruta en curso" : "Ruta asignada"}
          </Text>
        </View>

        {stop.offlineCopy ? (
          <Text style={styles.offlineNotice}>
            Mostrando datos guardados. Las entregas se sincronizarán cuando vuelva la conexión.
          </Text>
        ) : null}
        {hasPendingDelivery ? (
          <Text style={styles.offlineNotice}>
            Esta entrega está guardada y pendiente de sincronización. No la
            registres otra vez.
          </Text>
        ) : null}

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <View style={styles.customerCard}>
          <View style={styles.badgesRow}>
            <Text style={styles.pendingBadge}>
              {statusLabels[stop.estado]}
            </Text>
            <Text
              style={[
                styles.confirmedBadge,
                stop.confirmacion_cliente !== "confirmo" &&
                  styles.confirmationPending,
              ]}
            >
              {confirmationLabels[stop.confirmacion_cliente]}
            </Text>
          </View>
          <Text style={styles.customerName}>
            {firstOrder?.cliente ?? "Cliente"}
          </Text>
          {firstOrder ? (
            <Text style={styles.customerMeta}>
              Guía {firstOrder.numero_guia} · {firstOrder.cliente}
            </Text>
          ) : null}
          {firstOrder ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canOpenMap }}
              disabled={!canOpenMap}
              onPress={() => {
                if (canOpenMap) {
                  router.push({
                    pathname: "/(tabs)",
                    params: { view: "mapa" },
                  });
                }
              }}
              style={({ pressed }) => [
                styles.addressRow,
                pressed && canOpenMap && styles.cardPressed,
              ]}
            >
              <View style={styles.pinMarker}>
                <View style={styles.pinMarkerCenter} />
              </View>
              <View style={styles.addressText}>
                <Text style={styles.address}>
                  {firstOrder.direccion}, {firstOrder.comuna}
                </Text>
                <Text style={styles.addressMeta}>
                  {canOpenMap
                    ? `${firstOrder.comuna} · Ver en el mapa`
                    : firstOrder.comuna}
                </Text>
              </View>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={isCalling}
            onPress={() => void handleCall()}
            style={({ pressed }) => [
              styles.callCard,
              pressed && styles.cardPressed,
            ]}
          >
            {isCalling ? (
              <ActivityIndicator color="#176447" />
            ) : (
              <>
                <Text style={styles.callIcon}>☎</Text>
                <View style={styles.callTextContainer}>
                  <Text style={styles.callLabel}>Llamar al cliente</Text>
                  <Text style={styles.callNumber}>{firstOrder?.telefono ?? "Teléfono no disponible"}</Text>
                </View>
                <Text style={styles.callArrow}>↗</Text>
              </>
            )}
          </Pressable>
        </View>

        {notes.length > 0 ? (
          <View style={styles.notesCard}>
            <Text style={styles.notesTitle}>▣  Notas para la entrega</Text>
            {notes.map((note, index) => (
              <Text key={`${note}-${index}`} style={styles.notesText}>
                {note}
              </Text>
            ))}
          </View>
        ) : (
          <View style={styles.notesCard}>
            <Text style={styles.notesTitle}>▣  Notas para la entrega</Text>
            <Text style={styles.notesText}>
              No hay indicaciones adicionales para esta entrega.
            </Text>
          </View>
        )}

        <View style={styles.productsHeading}>
          <Text style={styles.sectionTitle}>Productos</Text>
          <Text style={styles.productCount}>
            {unitFormatter.format(totalUnits)}{" "}
            {totalUnits === 1 ? "unidad" : "unidades"}
          </Text>
        </View>
        {stop.ordenes.length === 1 ? (
          <Text style={styles.guideCategoryTitle}>
            Guía de despacho N.º {stop.ordenes[0].numero_guia}
          </Text>
        ) : null}
        {products.length > 0 ? (
          <View style={styles.productsCard}>
            {products.map((item) => (
              <View key={item.id} style={styles.productRow}>
                <View style={styles.productIcon}>
                  <Text style={styles.productIconText}>⬡</Text>
                </View>
                <View style={styles.productDetails}>
                  <Text style={styles.productName}>{item.producto}</Text>
                  <Text style={styles.productGuide}>Guía {item.numero_guia}</Text>
                </View>
                <Text style={styles.quantity}>
                  {item.cantidad_pedida} {item.unidad}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.productsCard}>
            <Text style={styles.secondaryText}>
              Esta parada no tiene productos registrados.
            </Text>
          </View>
        )}

        {stop.ordenes.length >= 2 ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: areGuidesExpanded }}
              onPress={() => setAreGuidesExpanded((expanded) => !expanded)}
              style={({ pressed }) => [
                styles.guideSummary,
                pressed && styles.cardPressed,
              ]}
            >
              <Text style={styles.guideIcon}>▤</Text>
              <View style={styles.guideDetails}>
                <Text style={styles.guideTitle}>Ver Guías de despacho</Text>
                <Text style={styles.guideMeta}>
                  {stop.ordenes.length} Guías · Productos por guía
                </Text>
              </View>
              <Text style={styles.guideChevron}>
                {areGuidesExpanded ? "⌃" : "›"}
              </Text>
            </Pressable>
            {areGuidesExpanded ? (
              <View style={styles.guideList}>
                <Text style={styles.guideListTitle}>Detalle por guía</Text>
                {stop.ordenes.map((order) => (
                  <View key={order.id} style={styles.guideCard}>
                    <View style={styles.guideCardHeader}>
                      <Text style={styles.guideCardTitle}>
                        Guía de despacho N.º {order.numero_guia}
                      </Text>
                      <Text style={styles.guideCardCount}>
                        {order.items.length}{" "}
                        {order.items.length === 1 ? "producto" : "productos"}
                      </Text>
                    </View>
                    {order.items.map((item) => (
                      <View key={item.id} style={styles.guideProductRow}>
                        <Text style={styles.guideProductName}>
                          {item.producto}
                        </Text>
                        <Text style={styles.guideProductQuantity}>
                          {unitFormatter.format(item.cantidad_pedida)}{" "}
                          {item.unidad}
                        </Text>
                      </View>
                    ))}
                    {order.items.length === 0 ? (
                      <Text style={styles.guideMeta}>
                        Esta guía no tiene productos registrados.
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {stop.ruta_estado === "en_curso" &&
      (stop.estado === "pendiente" || canRetry) ? (
        <View style={styles.footer}>
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          {stop.estado === "pendiente" ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canRecordDelivery }}
                disabled={!canRecordDelivery}
                onPress={() =>
                  router.push({
                    pathname: "/delivery/[stopId]",
                    params: { stopId: stop.id },
                  })
                }
                style={({ pressed }) => [
                  styles.footerPrimary,
                  pressed && styles.footerPrimaryPressed,
                  !canRecordDelivery && styles.disabledButton,
                ]}
              >
                <Text style={styles.footerPrimaryText}>Registrar entrega</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canOmit }}
                disabled={!canOmit}
                onPress={() =>
                  router.push({
                    pathname: "/stop/omit/[id]",
                    params: { id: stop.id },
                  })
                }
                style={({ pressed }) => [
                  styles.footerSecondary,
                  pressed && styles.footerSecondaryPressed,
                  !canOmit && styles.disabledButton,
                ]}
              >
                <Text style={styles.footerSecondaryText}>Omitir parada</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={isRetrying}
              onPress={() => void handleRetryStop()}
              style={({ pressed }) => [
                styles.footerPrimary,
                pressed && styles.footerPrimaryPressed,
                isRetrying && styles.disabledButton,
              ]}
            >
              {isRetrying ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.footerPrimaryText}>Reintentar parada</Text>
              )}
            </Pressable>
          )}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f3f6f3",
    flex: 1,
  },
  loading: {
    alignItems: "center",
    flex: 1,
    gap: 16,
    justifyContent: "center",
    padding: 24,
  },
  content: {
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: contentTopInset,
    paddingBottom: 20,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 34,
  },
  backButton: {
    alignItems: "flex-start",
    justifyContent: "center",
    width: 42,
  },
  backText: {
    color: "#20342a",
    fontSize: 24,
    lineHeight: 28,
  },
  routeCode: {
    color: "#52645a",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  helpIcon: {
    alignItems: "center",
    borderColor: "#52645a",
    borderRadius: 9,
    borderWidth: 1,
    color: "#52645a",
    fontSize: 11,
    height: 18,
    justifyContent: "center",
    overflow: "hidden",
    textAlign: "center",
    width: 18,
  },
  heading: {
    gap: 5,
    marginBottom: 8,
  },
  title: {
    color: "#20342a",
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: "#52645a",
    fontSize: 12,
  },
  customerCard: {
    backgroundColor: "#ffffff",
    borderColor: "#dce5df",
    borderRadius: 10,
    borderWidth: 1,
    elevation: 2,
    gap: 15,
    marginTop: 4,
    padding: 22,
    shadowColor: "#20342a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  badgesRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  pendingBadge: {
    backgroundColor: "#fff2e6",
    borderRadius: 5,
    color: "#a84f14",
    fontSize: 10,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  confirmedBadge: {
    backgroundColor: "#e8f4ed",
    borderRadius: 5,
    color: "#176447",
    fontSize: 10,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  confirmationPending: {
    backgroundColor: "#f0f2f0",
    color: "#52645a",
  },
  customerName: {
    color: "#20342a",
    fontSize: 17,
    fontWeight: "800",
  },
  customerMeta: {
    color: "#52645a",
    fontSize: 11,
  },
  callCard: {
    alignItems: "center",
    backgroundColor: "#e5f1ea",
    borderRadius: 7,
    flexDirection: "row",
    gap: 8,
    minHeight: 58,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  cardPressed: {
    opacity: 0.75,
  },
  callIcon: {
    color: "#176447",
    fontSize: 14,
  },
  callTextContainer: {
    flex: 1,
    gap: 2,
  },
  callLabel: {
    color: "#176447",
    fontSize: 11,
    fontWeight: "700",
  },
  callNumber: {
    color: "#68766d",
    fontSize: 10,
  },
  callArrow: {
    color: "#176447",
    fontSize: 13,
  },
  addressRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    minHeight: 50,
    paddingVertical: 6,
  },
  pinMarker: {
    alignItems: "center",
    borderColor: "#e0673d",
    borderRadius: 8,
    borderBottomRightRadius: 2,
    borderWidth: 1.5,
    height: 11,
    justifyContent: "center",
    marginRight: 2,
    marginTop: 1,
    transform: [{ rotate: "45deg" }],
    width: 11,
  },
  pinMarkerCenter: {
    backgroundColor: "#e0673d",
    borderRadius: 2,
    height: 3,
    width: 3,
  },
  addressText: {
    flex: 1,
    gap: 3,
  },
  address: {
    color: "#35473c",
    fontSize: 12,
    fontWeight: "600",
  },
  addressMeta: {
    color: "#68766d",
    fontSize: 10,
  },
  notesCard: {
    backgroundColor: "#e7f2eb",
    borderLeftColor: "#80c59c",
    borderLeftWidth: 2,
    borderRadius: 7,
    gap: 6,
    minHeight: 92,
    padding: 14,
  },
  notesTitle: {
    color: "#176447",
    fontSize: 11,
    fontWeight: "700",
  },
  notesText: {
    color: "#52645a",
    fontSize: 10,
    lineHeight: 14,
  },
  offlineNotice: {
    backgroundColor: "#fff0e3",
    borderRadius: 9,
    color: "#8c4a1b",
    fontSize: 11,
    lineHeight: 16,
    padding: 10,
  },
  secondaryText: {
    color: "#68766d",
    fontSize: 11,
  },
  error: {
    color: "#a12622",
    fontSize: 11,
  },
  sectionTitle: {
    color: "#20342a",
    fontSize: 13,
    fontWeight: "800",
  },
  guideCategoryTitle: {
    color: "#68766d",
    fontSize: 12,
    fontWeight: "700",
  },
  productsHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  productCount: {
    color: "#68766d",
    fontSize: 10,
  },
  productsCard: {
    backgroundColor: "#ffffff",
    borderColor: "#dce5df",
    borderRadius: 9,
    borderWidth: 1,
    elevation: 2,
    overflow: "hidden",
    shadowColor: "#20342a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  productRow: {
    alignItems: "center",
    borderBottomColor: "#edf0ed",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 9,
  },
  productIcon: {
    alignItems: "center",
    backgroundColor: "#edf7f1",
    borderRadius: 6,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  productIconText: {
    color: "#176447",
    fontSize: 14,
  },
  productDetails: {
    flex: 1,
    gap: 2,
  },
  productName: {
    color: "#35473c",
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
  },
  productGuide: {
    color: "#68766d",
    fontSize: 9,
  },
  quantity: {
    color: "#20342a",
    fontSize: 10,
    fontWeight: "800",
  },
  guideSummary: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dce5df",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 42,
    padding: 12,
  },
  guideIcon: {
    color: "#176447",
    fontSize: 13,
  },
  guideDetails: {
    flex: 1,
    gap: 3,
  },
  guideTitle: {
    color: "#20342a",
    fontSize: 11,
    fontWeight: "700",
  },
  guideMeta: {
    color: "#68766d",
    fontSize: 9,
  },
  guideChevron: {
    color: "#52645a",
    fontSize: 18,
  },
  guideList: {
    gap: 8,
  },
  guideListTitle: {
    color: "#20342a",
    fontSize: 13,
    fontWeight: "700",
  },
  guideCard: {
    backgroundColor: "#ffffff",
    borderColor: "#dce5df",
    borderRadius: 9,
    borderWidth: 1,
    gap: 7,
    padding: 11,
  },
  guideCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  guideCardTitle: {
    color: "#20342a",
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
  },
  guideCardCount: {
    color: "#68766d",
    fontSize: 9,
  },
  guideProductRow: {
    alignItems: "center",
    borderTopColor: "#edf0ed",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
  },
  guideProductName: {
    color: "#35473c",
    flex: 1,
    fontSize: 10,
  },
  guideProductQuantity: {
    color: "#20342a",
    fontSize: 10,
    fontWeight: "700",
  },
  footer: {
    backgroundColor: "#ffffff",
    borderTopColor: "#e3e8e4",
    borderTopWidth: 1,
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 8,
  },
  footerPrimary: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 20,
    justifyContent: "center",
    minHeight: 44,
  },
  footerPrimaryPressed: {
    backgroundColor: "#104b35",
  },
  footerPrimaryText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  footerSecondary: {
    alignItems: "center",
    borderColor: "#d95f35",
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
  },
  footerSecondaryPressed: {
    backgroundColor: "#fff4ee",
  },
  footerSecondaryText: {
    color: "#c85831",
    fontSize: 10,
    fontWeight: "600",
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#176447",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: "#176447",
    fontSize: 11,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.88,
  },
});
