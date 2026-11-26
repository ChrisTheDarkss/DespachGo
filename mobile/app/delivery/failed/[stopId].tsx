import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GuidePhotoField } from "@/src/components/GuidePhotoField";
import { useAuth } from "@/src/hooks/useAuth";
import {
  getQueuedDeliveries,
  queueDelivery,
  QueuedDelivery,
  DeliveryReason,
} from "@/src/services/deliveryOutbox";
import {
  persistGuidePhotos,
  removePersistedGuidePhotos,
} from "@/src/services/deliveryPhotos";
import { syncPendingDeliveries } from "@/src/services/deliverySync";
import { getDriverStopDetails } from "@/src/services/driverRoute";
import type { StopDetail } from "@/src/types/route";

const reasons: { value: DeliveryReason; label: string }[] = [
  { value: "cliente_ausente", label: "Cliente ausente" },
  { value: "direccion_incorrecta", label: "Dirección incorrecta" },
  { value: "rechazo", label: "Cliente rechazó la entrega" },
  {
    value: "problema_vehiculo_transito",
    label: "Problema del vehículo o tránsito",
  },
  { value: "otro", label: "Otro motivo" },
];

export default function FailedDeliveryScreen() {
  const { stopId: stopIdParam } = useLocalSearchParams<{ stopId: string }>();
  const stopId = Array.isArray(stopIdParam) ? stopIdParam[0] : stopIdParam;
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [stop, setStop] = useState<StopDetail | null>(null);
  const [reason, setReason] = useState<DeliveryReason | null>(null);
  const [comment, setComment] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasPendingAction, setHasPendingAction] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!stopId || !userId) {
        setError("No se encontró la sesión del conductor o la parada.");
        setIsLoading(false);
        return;
      }

      try {
        const [details, queue] = await Promise.all([
          getDriverStopDetails(stopId, userId),
          getQueuedDeliveries(userId),
        ]);
        if (active) {
          setStop(details);
          setHasPendingAction(
            queue.some((action) => action.stopId === details.id),
          );
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar la parada.",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [stopId, userId]);

  async function handleSubmit() {
    if (submitLock.current || isSubmitting || !userId || !stop) {
      return;
    }
    if (stop.estado !== "pendiente" || stop.ruta_estado !== "en_curso") {
      setError("Solo puedes reportar una falla en una parada pendiente de una ruta en curso.");
      return;
    }
    if (hasPendingAction) {
      setError("Esta parada ya tiene un registro pendiente de sincronización.");
      return;
    }
    if (!reason) {
      setError("Selecciona el motivo de la entrega fallida.");
      return;
    }
    if (reason === "otro" && !comment.trim()) {
      setError("Describe el motivo seleccionado como otro.");
      return;
    }

    submitLock.current = true;
    setIsSubmitting(true);
    setError(null);
    let persistedPhotos: Awaited<ReturnType<typeof persistGuidePhotos>> = [];
    let queued = false;

    try {
      const deliveryId = Crypto.randomUUID();
      const firstOrder = stop.ordenes[0];
      persistedPhotos =
        photoUri && firstOrder
          ? await persistGuidePhotos(deliveryId, [
              { ordenId: firstOrder.id, uri: photoUri },
            ])
          : [];

      const action: QueuedDelivery = {
        id: deliveryId,
        userId,
        stopId: stop.id,
        operation: "failed",
        items: [],
        reason,
        comment: comment.trim() || null,
        receivedBy: null,
        photos: persistedPhotos,
        status: "pending",
        registered: false,
        error: null,
        createdAt: new Date().toISOString(),
      };

      try {
        await queueDelivery(action);
        queued = true;
      } catch (queueError) {
        await removePersistedGuidePhotos(persistedPhotos);
        throw queueError;
      }

      setIsSubmitted(true);
      setHasPendingAction(true);
      try {
        await syncPendingDeliveries(userId);
        const pending = (await getQueuedDeliveries(userId)).find(
          (entry) => entry.id === deliveryId,
        );
        if (pending?.status === "failed") {
          setResultMessage(
            `La falla quedó guardada, pero requiere atención: ${pending.error ?? "no se pudo sincronizar"}`,
          );
        } else if (pending) {
          setResultMessage(
            "La falla quedó guardada en el dispositivo y se sincronizará cuando haya conexión.",
          );
        } else {
          setResultMessage("La entrega fallida se registró correctamente.");
        }
      } catch (syncError) {
        setResultMessage(
          `La falla quedó guardada en el dispositivo. No se pudo sincronizar: ${
            syncError instanceof Error
              ? syncError.message
              : "error de conexión"
          }`,
        );
      }
    } catch (submitError) {
      if (!queued && persistedPhotos.length > 0) {
        await removePersistedGuidePhotos(persistedPhotos);
      }
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo guardar la falla.",
      );
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#176447" />
          <Text style={styles.secondaryText}>Cargando parada...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isSubmitted) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.result}>
          <Text accessibilityRole="header" style={styles.title}>
            Falla guardada
          </Text>
          <Text style={styles.bodyText}>{resultMessage}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Volver a la parada</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const canSubmit =
    stop?.estado === "pendiente" &&
    stop.ruta_estado === "en_curso" &&
    !hasPendingAction;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹  Volver al detalle</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          Registrar entrega fallida
        </Text>
        {stop?.offlineCopy ? (
          <Text style={styles.offlineNotice}>
            Sin conexión. El registro se guardará en el dispositivo para sincronizarse después.
          </Text>
        ) : null}
        {hasPendingAction ? (
          <Text style={styles.offlineNotice}>
            Esta parada ya tiene un registro pendiente. No vuelvas a enviarlo.
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Motivo</Text>
          {reasons.map((option) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: reason === option.value }}
              disabled={!canSubmit || isSubmitting}
              key={option.value}
              onPress={() => {
                setReason(option.value);
                setError(null);
              }}
              style={[
                styles.reasonOption,
                reason === option.value && styles.reasonSelected,
              ]}
            >
              <Text
                style={[
                  styles.reasonText,
                  reason === option.value && styles.reasonTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
          {reason === "otro" ? (
            <TextInput
              accessibilityLabel="Descripción de la falla"
              editable={canSubmit && !isSubmitting}
              multiline
              onChangeText={setComment}
              placeholder="Describe qué ocurrió"
              style={styles.commentInput}
              value={comment}
            />
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Foto (opcional)</Text>
          {stop?.ordenes[0] ? (
            <GuidePhotoField
              disabled={!canSubmit || isSubmitting}
              label={`Foto de la guía ${stop.ordenes[0].numero_guia}`}
              onChange={setPhotoUri}
              photoUri={photoUri}
            />
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit || isSubmitting}
          onPress={() => void handleSubmit()}
          style={[
            styles.primaryButton,
            (!canSubmit || isSubmitting) && styles.disabledButton,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Confirmar falla</Text>
          )}
        </Pressable>
      </ScrollView>
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
    gap: 14,
    justifyContent: "center",
  },
  content: {
    gap: 14,
    padding: 20,
    paddingBottom: 36,
  },
  result: {
    flex: 1,
    gap: 16,
    justifyContent: "center",
    padding: 24,
  },
  backButton: {
    alignSelf: "flex-start",
    minHeight: 40,
    justifyContent: "center",
  },
  backText: {
    color: "#176447",
    fontSize: 15,
    fontWeight: "700",
  },
  title: {
    color: "#20342a",
    fontSize: 25,
    fontWeight: "700",
  },
  sectionTitle: {
    color: "#20342a",
    fontSize: 17,
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
  reasonOption: {
    backgroundColor: "#f7f9f7",
    borderColor: "#e0e5e1",
    borderRadius: 9,
    borderWidth: 1,
    padding: 13,
  },
  reasonSelected: {
    backgroundColor: "#eaf2ed",
    borderColor: "#176447",
  },
  reasonText: {
    color: "#52645a",
    fontSize: 14,
  },
  reasonTextSelected: {
    color: "#176447",
    fontWeight: "700",
  },
  commentInput: {
    backgroundColor: "#f7f9f7",
    borderColor: "#d8e0db",
    borderRadius: 8,
    borderWidth: 1,
    color: "#20342a",
    minHeight: 90,
    padding: 12,
    textAlignVertical: "top",
  },
  secondaryText: {
    color: "#637168",
    fontSize: 14,
    lineHeight: 20,
  },
  bodyText: {
    color: "#52645a",
    fontSize: 15,
    lineHeight: 22,
  },
  offlineNotice: {
    backgroundColor: "#fff0e3",
    borderRadius: 9,
    color: "#8c4a1b",
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
  },
  error: {
    color: "#a3352c",
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 50,
    padding: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  disabledButton: {
    opacity: 0.5,
  },
});
