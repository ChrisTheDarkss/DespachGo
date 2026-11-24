import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
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
} from "@/src/services/driverRoute";
import type {
  OmissionReason,
  StopDetail,
} from "@/src/types/route";

type OmissionOptionId = "traffic" | "unavailable" | "refusal" | "other";

const reasons: {
  id: OmissionOptionId;
  value: OmissionReason;
  label: string;
}[] = [
  { id: "traffic", value: "calle_cerrada", label: "Problemas de Tráfico" },
  {
    id: "unavailable",
    value: "cliente_ausente",
    label: "No está disponible en el hogar",
  },
  {
    id: "refusal",
    value: "otro",
    label: "Se niega a recibir el pedido",
  },
  { id: "other", value: "otro", label: "Otro motivo" },
];

const contentTopInset = Platform.OS === "web" ? 48 : 8;
const unitFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 2,
});

export default function OmitStopScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const stopId = Array.isArray(idParam) ? idParam[0] : idParam;
  const router = useRouter();
  const { session } = useAuth();
  const conductorId = session?.user.id;
  const [stop, setStop] = useState<StopDetail | null>(null);
  const [selectedReason, setSelectedReason] = useState<OmissionOptionId | null>(
    null,
  );
  const [comment, setComment] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStop() {
      setError(null);
      if (!stopId || !conductorId) {
        setError("No se encontró la sesión del conductor o la parada.");
        setIsLoading(false);
        return;
      }

      try {
        const details = await getDriverStopDetails(stopId, conductorId);
        if (active) {
          setStop(details);
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar el detalle de la parada.",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadStop();
    return () => {
      active = false;
    };
  }, [conductorId, stopId]);

  async function handleConfirmOmission() {
    const reason = reasons.find((option) => option.id === selectedReason);
    if (!stop || !reason || isSubmitting) {
      return;
    }
    if (!comment.trim()) {
      setError("Escribe una observación para confirmar la omisión.");
      return;
    }
    if (stop.offlineCopy) {
      setError("Conéctate a internet para confirmar la omisión.");
      return;
    }
    if (stop.estado !== "pendiente" || stop.ruta_estado !== "en_curso") {
      setError("Solo puedes omitir una parada pendiente de una ruta en curso.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await omitDriverStop(stop.id, reason.value, comment.trim());
      router.replace({ pathname: "/(tabs)", params: { view: "mapa" } });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo omitir la parada.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#176447" />
          <Text style={styles.mutedText}>Cargando parada...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!stop) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text accessibilityRole="alert" style={styles.error}>
            {error ?? "No se encontró la parada."}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Volver a la parada</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const firstOrder = stop.ordenes[0];
  const totalUnits = stop.ordenes.reduce(
    (total, order) =>
      total +
      order.items.reduce((orderTotal, item) => orderTotal + item.cantidad_pedida, 0),
    0,
  );
  const canConfirm =
    Boolean(selectedReason) &&
    Boolean(comment.trim()) &&
    !isSubmitting &&
    !stop.offlineCopy &&
    stop.estado === "pendiente" &&
    stop.ruta_estado === "en_curso";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver al detalle de la parada"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.routeCode}>
            RUTA {stop.ruta_id.slice(0, 8).toUpperCase()}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            Omitir parada
          </Text>
          <Text style={styles.subtitle}>Esta acción quedará registrada en tu ruta</Text>
        </View>

        {stop.offlineCopy ? (
          <Text style={styles.warning}>
            Sin conexión. La omisión requiere conexión a internet.
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <View style={styles.stopCard}>
          <Text style={styles.stopBadge}>
            PARADA {stop.posicion} ·{" "}
            {stop.confirmacion_cliente === "confirmo"
              ? "VISITA CONFIRMADA"
              : "POR CONFIRMAR"}
          </Text>
          <Text style={styles.customerName}>
            {firstOrder?.cliente ?? "Cliente"}
          </Text>
          {firstOrder ? (
            <Text style={styles.stopMeta}>
              {firstOrder.direccion}
            </Text>
          ) : null}
          {firstOrder?.comuna ? (
            <Text style={styles.stopMeta}>{firstOrder.comuna}</Text>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Motivo de omisión *</Text>
        <View style={styles.options}>
          {reasons.map((reason) => {
            const isSelected = selectedReason === reason.id;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                disabled={isSubmitting}
                key={reason.id}
                onPress={() => {
                  setSelectedReason(reason.id);
                  setError(null);
                }}
                style={[
                  styles.reasonOption,
                  isSelected && styles.reasonSelected,
                ]}
              >
                <View
                  style={[
                    styles.radio,
                    isSelected && styles.radioSelected,
                  ]}
                >
                  {isSelected ? <View style={styles.radioDot} /> : null}
                </View>
                <Text
                  style={[
                    styles.reasonText,
                    isSelected && styles.reasonTextSelected,
                  ]}
                >
                  {reason.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Observación *</Text>
        <TextInput
          accessibilityLabel="Observación de la omisión"
          editable={!isSubmitting}
          multiline
          onChangeText={setComment}
          placeholder="Escribe observaciones sobre la omisión."
          style={styles.commentInput}
          textAlignVertical="top"
          value={comment}
        />

        <View style={styles.warningCard}>
          <Text style={styles.warningIcon}>!</Text>
          <View style={styles.warningTextContainer}>
            <Text style={styles.warningTitle}>La parada no se eliminará</Text>
            <Text style={styles.warningDescription}>
              {totalUnits > 0
                ? `Aparecerá como Omitida en el resumen. Sus ${unitFormatter.format(totalUnits)} ${totalUnits === 1 ? "unidad debe" : "unidades deben"} regresar a bodega.`
                : "Aparecerá como Omitida en el resumen y la carga debe regresar a bodega."}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={!canConfirm}
          onPress={() => void handleConfirmOmission()}
          style={[
            styles.confirmButton,
            !canConfirm && styles.disabledButton,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.confirmText}>⊖  Confirmar omisión</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={() => router.back()}
          style={styles.cancelButton}
        >
          <Text style={styles.cancelText}>Volver sin omitir</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f3f6f3",
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  centered: {
    alignItems: "center",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 24,
  },
  content: {
    flexGrow: 1,
    gap: 14,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: contentTopInset,
    paddingBottom: 18,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 42,
  },
  backButton: {
    justifyContent: "center",
    width: 44,
  },
  backText: {
    color: "#20342a",
    fontSize: 28,
    lineHeight: 32,
  },
  routeCode: {
    color: "#52645a",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  headerSpacer: {
    width: 44,
  },
  heading: {
    gap: 6,
  },
  title: {
    color: "#20342a",
    fontSize: 27,
    fontWeight: "800",
  },
  subtitle: {
    color: "#68766d",
    fontSize: 13,
  },
  stopCard: {
    backgroundColor: "#ffffff",
    borderColor: "#dce5df",
    borderRadius: 15,
    borderWidth: 1,
    gap: 12,
    minHeight: 158,
    padding: 17,
  },
  stopBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#fff2e6",
    borderRadius: 6,
    color: "#a84f14",
    fontSize: 10,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  customerName: {
    color: "#20342a",
    fontSize: 19,
    fontWeight: "700",
  },
  stopMeta: {
    color: "#68766d",
    fontSize: 12,
  },
  sectionTitle: {
    color: "#20342a",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  options: {
    gap: 10,
  },
  reasonOption: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e1e7e2",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  reasonSelected: {
    backgroundColor: "#e9f4ed",
    borderColor: "#176447",
  },
  radio: {
    alignItems: "center",
    borderColor: "#819087",
    borderRadius: 10,
    borderWidth: 1,
    height: 19,
    justifyContent: "center",
    width: 19,
  },
  radioSelected: {
    borderColor: "#176447",
  },
  radioDot: {
    backgroundColor: "#176447",
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  reasonText: {
    color: "#35473c",
    fontSize: 14,
  },
  reasonTextSelected: {
    color: "#20342a",
    fontWeight: "600",
  },
  commentInput: {
    backgroundColor: "#ffffff",
    borderColor: "#dce5df",
    borderRadius: 12,
    borderWidth: 1,
    color: "#35473c",
    fontSize: 14,
    lineHeight: 20,
    minHeight: 90,
    padding: 14,
  },
  warningCard: {
    alignItems: "flex-start",
    backgroundColor: "#fff2e6",
    borderRadius: 13,
    flexDirection: "row",
    gap: 12,
    minHeight: 88,
    padding: 16,
  },
  warningIcon: {
    color: "#d95f35",
    fontSize: 20,
    fontWeight: "700",
  },
  warningTextContainer: {
    flex: 1,
    gap: 5,
  },
  warningTitle: {
    color: "#a84f14",
    fontSize: 14,
    fontWeight: "700",
  },
  warningDescription: {
    color: "#8c4a1b",
    fontSize: 12,
    lineHeight: 17,
  },
  warning: {
    backgroundColor: "#fff2e6",
    borderRadius: 8,
    color: "#8c4a1b",
    fontSize: 13,
    padding: 12,
  },
  error: {
    color: "#a12622",
    fontSize: 13,
  },
  mutedText: {
    color: "#68766d",
    fontSize: 14,
  },
  footer: {
    backgroundColor: "#ffffff",
    borderTopColor: "#e3e8e4",
    borderTopWidth: 1,
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 18,
  },
  confirmButton: {
    alignItems: "center",
    backgroundColor: "#c62828",
    borderRadius: 13,
    justifyContent: "center",
    minHeight: 54,
  },
  confirmText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    alignItems: "center",
    backgroundColor: "#f1f3f2",
    borderColor: "#d8ddda",
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 54,
  },
  cancelText: {
    color: "#343a36",
    fontSize: 16,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#176447",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: "#176447",
    fontSize: 14,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.6,
  },
});
