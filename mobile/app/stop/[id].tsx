import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/hooks/useAuth";
import {
  getDriverStopDetails,
  omitDriverStop,
  retryDriverStop,
} from "@/src/services/driverRoute";
import type {
  OmissionReason,
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

const omissionReasons: { value: OmissionReason; label: string }[] = [
  { value: "calle_cerrada", label: "Calle cerrada" },
  { value: "accidente", label: "Accidente" },
  { value: "cliente_ausente", label: "Cliente ausente" },
  { value: "otro", label: "Otro motivo" },
];

export default function StopDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const stopId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const { session } = useAuth();
  const conductorId = session?.user.id;
  const [stop, setStop] = useState<StopDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOmitting, setIsOmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isOmissionModalVisible, setIsOmissionModalVisible] = useState(false);
  const [omissionReason, setOmissionReason] = useState<OmissionReason | null>(
    null,
  );
  const [omissionComment, setOmissionComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [conductorId, stopId]);

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

  async function handleOmitStop() {
    if (!stop || !omissionReason || isOmitting) {
      return;
    }
    if (omissionReason === "otro" && !omissionComment.trim()) {
      setError("Escribe un comentario para explicar el motivo.");
      return;
    }

    setError(null);
    setIsOmitting(true);
    try {
      await omitDriverStop(
        stop.id,
        omissionReason,
        omissionComment.trim() || null,
      );
      setIsOmissionModalVisible(false);
      router.back();
    } catch (omitError) {
      setError(
        omitError instanceof Error
          ? omitError.message
          : "No se pudo omitir la parada.",
      );
    } finally {
      setIsOmitting(false);
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
  const canOmit =
    !stop.offlineCopy &&
    stop.ruta_estado === "en_curso" &&
    stop.estado === "pendiente";
  const canRecordDelivery =
    stop.ruta_estado === "en_curso" && stop.estado === "pendiente";
  const canRetry =
    !stop.offlineCopy &&
    stop.ruta_estado === "en_curso" &&
    stop.estado === "fallida_por_reintentar";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹  Mi ruta</Text>
        </Pressable>

        <View style={styles.heading}>
          <Text style={styles.eyebrow}>PARADA {stop.posicion}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {firstOrder?.cliente ?? "Detalle de parada"}
          </Text>
          <Text style={styles.status}>{statusLabels[stop.estado]}</Text>
        </View>

        {stop.offlineCopy ? (
          <Text style={styles.offlineNotice}>
            Mostrando datos guardados. Las entregas se sincronizarán cuando vuelva la conexión.
          </Text>
        ) : null}

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Dirección</Text>
          {stop.ordenes.map((order) => (
            <View key={order.id} style={styles.guideAddress}>
              <Text style={styles.address}>
                {order.direccion}, {order.comuna}
              </Text>
              <Text style={styles.guideNumber}>
                Guía {order.numero_guia}
              </Text>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            disabled={isCalling}
            onPress={() => void handleCall()}
            style={({ pressed }) => [
              styles.callButton,
              pressed && styles.callButtonPressed,
            ]}
          >
            {isCalling ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.callButtonText}>Llamar al cliente</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/map")}
            style={({ pressed }) => [
              styles.mapButton,
              pressed && styles.mapButtonPressed,
            ]}
          >
            <Text style={styles.mapButtonText}>Ver mapa de la ruta</Text>
          </Pressable>
        </View>

        {stop.ordenes.map((order) => (
          <View key={order.id} style={styles.card}>
            <Text style={styles.sectionTitle}>
              Guía {order.numero_guia}
            </Text>
            {order.notas ? (
              <View style={styles.notes}>
                <Text style={styles.noteLabel}>Notas</Text>
                <Text style={styles.bodyText}>{order.notas}</Text>
              </View>
            ) : null}
            <Text style={styles.subsectionTitle}>Productos</Text>
            {order.items.length > 0 ? (
              order.items.map((item) => (
                <View key={item.id} style={styles.productRow}>
                  <Text style={styles.productName}>{item.producto}</Text>
                  <Text style={styles.quantity}>
                    {item.cantidad_pedida} {item.unidad}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.secondaryText}>
                Esta guía no tiene productos registrados.
              </Text>
            )}
          </View>
        ))}

        {canRecordDelivery ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/delivery/[stopId]",
                  params: { stopId: stop.id },
                })
              }
              style={({ pressed }) => [
                styles.deliveryButton,
                pressed && styles.callButtonPressed,
              ]}
            >
              <Text style={styles.callButtonText}>Registrar entrega</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/delivery/failed/[stopId]",
                  params: { stopId: stop.id },
                })
              }
              style={({ pressed }) => [
                styles.failedButton,
                pressed && styles.mapButtonPressed,
              ]}
            >
              <Text style={styles.failedButtonText}>Reportar entrega fallida</Text>
            </Pressable>
          </>
        ) : null}

        {canRetry ? (
          <Pressable
            accessibilityRole="button"
            disabled={isRetrying}
            onPress={() => void handleRetryStop()}
            style={({ pressed }) => [
              styles.deliveryButton,
              pressed && styles.callButtonPressed,
              isRetrying && styles.disabledButton,
            ]}
          >
            {isRetrying ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.callButtonText}>Reintentar parada</Text>
            )}
          </Pressable>
        ) : null}

        {canOmit ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setError(null);
              setOmissionReason(null);
              setOmissionComment("");
              setIsOmissionModalVisible(true);
            }}
            style={({ pressed }) => [
              styles.omitButton,
              pressed && styles.omitButtonPressed,
            ]}
          >
            <Text style={styles.omitButtonText}>Omitir parada</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setIsOmissionModalVisible(false)}
        transparent
        visible={isOmissionModalVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text accessibilityRole="header" style={styles.modalTitle}>
              Motivo para omitir
            </Text>
            <Text style={styles.secondaryText}>
              Selecciona por qué no se realizará esta entrega.
            </Text>
            {omissionReasons.map((reason) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{
                  checked: omissionReason === reason.value,
                }}
                key={reason.value}
                onPress={() => {
                  setOmissionReason(reason.value);
                  setError(null);
                }}
                style={[
                  styles.reasonOption,
                  omissionReason === reason.value && styles.reasonSelected,
                ]}
              >
                <Text
                  style={[
                    styles.reasonText,
                    omissionReason === reason.value && styles.reasonTextSelected,
                  ]}
                >
                  {reason.label}
                </Text>
              </Pressable>
            ))}
            {omissionReason === "otro" ? (
              <TextInput
                accessibilityLabel="Comentario del motivo"
                multiline
                onChangeText={setOmissionComment}
                placeholder="Describe el motivo"
                style={styles.commentInput}
                value={omissionComment}
              />
            ) : null}
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isOmitting}
                onPress={() => setIsOmissionModalVisible(false)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isOmitting || !omissionReason}
                onPress={() => void handleOmitStop()}
                style={[
                  styles.confirmButton,
                  (isOmitting || !omissionReason) && styles.disabledButton,
                ]}
              >
                {isOmitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.confirmText}>Confirmar omisión</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    gap: 16,
    justifyContent: "center",
    padding: 24,
  },
  content: {
    gap: 14,
    padding: 20,
    paddingBottom: 36,
  },
  backButton: {
    alignSelf: "flex-start",
    minHeight: 40,
    justifyContent: "center",
  },
  backText: {
    color: "#176447",
    fontSize: 16,
    fontWeight: "700",
  },
  heading: {
    gap: 7,
    marginBottom: 2,
  },
  eyebrow: {
    color: "#bd641f",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    color: "#20342a",
    fontSize: 25,
    fontWeight: "700",
  },
  status: {
    color: "#bd641f",
    fontSize: 14,
    fontWeight: "700",
  },
  offlineNotice: {
    backgroundColor: "#fff0e3",
    borderRadius: 9,
    color: "#8c4a1b",
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
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
    fontSize: 17,
    fontWeight: "700",
  },
  guideAddress: {
    borderBottomColor: "#edf0ed",
    borderBottomWidth: 1,
    gap: 4,
    paddingBottom: 9,
  },
  address: {
    color: "#35473c",
    fontSize: 15,
    lineHeight: 21,
  },
  guideNumber: {
    color: "#78847d",
    fontSize: 13,
  },
  callButton: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 48,
  },
  deliveryButton: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 50,
    padding: 14,
  },
  failedButton: {
    alignItems: "center",
    backgroundColor: "#fff0e3",
    borderColor: "#f0d7c0",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    padding: 12,
  },
  failedButtonText: {
    color: "#a84f14",
    fontSize: 15,
    fontWeight: "700",
  },
  callButtonPressed: {
    backgroundColor: "#104b35",
  },
  callButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  mapButton: {
    alignItems: "center",
    borderColor: "#bd641f",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  mapButtonPressed: {
    backgroundColor: "#fff0e3",
  },
  mapButtonText: {
    color: "#a84f14",
    fontSize: 14,
    fontWeight: "700",
  },
  notes: {
    backgroundColor: "#fff5eb",
    borderRadius: 8,
    gap: 5,
    padding: 11,
  },
  noteLabel: {
    color: "#a84f14",
    fontSize: 13,
    fontWeight: "700",
  },
  bodyText: {
    color: "#35473c",
    fontSize: 14,
    lineHeight: 20,
  },
  subsectionTitle: {
    color: "#52645a",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },
  productRow: {
    alignItems: "center",
    borderTopColor: "#edf0ed",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingTop: 10,
  },
  productName: {
    color: "#35473c",
    flex: 1,
    fontSize: 14,
  },
  quantity: {
    color: "#20342a",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryText: {
    color: "#68766d",
    fontSize: 14,
  },
  error: {
    color: "#a12622",
    fontSize: 14,
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
    fontSize: 15,
    fontWeight: "700",
  },
  omitButton: {
    alignItems: "center",
    borderColor: "#bd641f",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  omitButtonPressed: {
    backgroundColor: "#fff0e3",
  },
  omitButtonText: {
    color: "#a84f14",
    fontSize: 15,
    fontWeight: "700",
  },
  modalBackdrop: {
    backgroundColor: "rgba(14, 30, 21, 0.55)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 12,
    padding: 22,
    paddingBottom: 32,
  },
  modalTitle: {
    color: "#20342a",
    fontSize: 20,
    fontWeight: "700",
  },
  reasonOption: {
    borderColor: "#d8dfda",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 13,
  },
  reasonSelected: {
    backgroundColor: "#e5f1ea",
    borderColor: "#176447",
  },
  reasonText: {
    color: "#35473c",
    fontSize: 14,
  },
  reasonTextSelected: {
    color: "#176447",
    fontWeight: "700",
  },
  commentInput: {
    borderColor: "#d8dfda",
    borderRadius: 9,
    borderWidth: 1,
    color: "#20342a",
    minHeight: 76,
    padding: 12,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    alignItems: "center",
    borderColor: "#d8dfda",
    borderRadius: 9,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  cancelText: {
    color: "#52645a",
    fontSize: 14,
    fontWeight: "700",
  },
  confirmButton: {
    alignItems: "center",
    backgroundColor: "#bd641f",
    borderRadius: 9,
    flex: 1.4,
    justifyContent: "center",
    minHeight: 48,
  },
  confirmText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.5,
  },
});
