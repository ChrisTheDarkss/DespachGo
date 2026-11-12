import { useEffect, useMemo, useRef, useState } from "react";
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
import { getDriverStopDetails } from "@/src/services/driverRoute";
import {
  ItemDifferenceReason,
  queueDelivery,
  QueuedDelivery,
  QueuedDeliveryItem,
  getQueuedDeliveries,
} from "@/src/services/deliveryOutbox";
import {
  persistGuidePhotos,
  removePersistedGuidePhotos,
} from "@/src/services/deliveryPhotos";
import { syncPendingDeliveries } from "@/src/services/deliverySync";
import type { StopDetail } from "@/src/types/route";

const differenceReasons: {
  value: ItemDifferenceReason;
  label: string;
}[] = [
  { value: "faltante", label: "Faltante" },
  { value: "danado", label: "Dañado" },
  { value: "rechazado_por_cliente", label: "Rechazado" },
  { value: "otro", label: "Otro" },
];

export default function RegisterDeliveryScreen() {
  const { stopId: stopIdParam } = useLocalSearchParams<{ stopId: string }>();
  const stopId = Array.isArray(stopIdParam) ? stopIdParam[0] : stopIdParam;
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [stop, setStop] = useState<StopDetail | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<
    Record<string, ItemDifferenceReason | undefined>
  >({});
  const [photos, setPhotos] = useState<Record<string, string | undefined>>({});
  const [receivedBy, setReceivedBy] = useState("");
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
          setQuantities(
            Object.fromEntries(
              details.ordenes.flatMap((order) =>
                order.items.map((item) => [
                  item.id,
                  String(item.cantidad_pedida),
                ]),
              ),
            ),
          );
          setHasPendingAction(
            queue.some((action) => action.stopId === details.id),
          );
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar la parada para registrar la entrega.",
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

  const items = useMemo(
    () => stop?.ordenes.flatMap((order) => order.items) ?? [],
    [stop],
  );
  const isAllZero =
    items.length > 0 &&
    items.every((item) => Number(quantities[item.id] ?? "") === 0);

  function updateQuantity(itemId: string, value: string) {
    setQuantities((current) => ({ ...current, [itemId]: value }));
    setError(null);
  }

  function updatePhoto(orderId: string, uri: string | null) {
    setPhotos((current) => ({ ...current, [orderId]: uri ?? undefined }));
    setError(null);
  }

  function validate(): QueuedDeliveryItem[] | null {
    if (!stop || stop.estado !== "pendiente" || stop.ruta_estado !== "en_curso") {
      setError("Solo puedes registrar entregas en una parada pendiente de una ruta en curso.");
      return null;
    }
    if (hasPendingAction) {
      setError("Esta parada ya tiene una entrega pendiente de sincronización.");
      return null;
    }
    if (items.length === 0) {
      setError("Esta parada no tiene productos para registrar.");
      return null;
    }

    const invalidQuantity = items.find((item) => {
      const value = quantities[item.id]?.trim();
      const quantity = Number(value);
      return (
        !value ||
        !Number.isFinite(quantity) ||
        quantity < 0 ||
        quantity > item.cantidad_pedida
      );
    });
    if (invalidQuantity) {
      setError(
        `La cantidad de ${invalidQuantity.producto} debe estar entre 0 y ${invalidQuantity.cantidad_pedida}.`,
      );
      return null;
    }

    const missingReason = items.find(
      (item) =>
        Number(quantities[item.id]) < item.cantidad_pedida &&
        !reasons[item.id],
    );
    if (missingReason) {
      setError(`Selecciona el motivo de la diferencia para ${missingReason.producto}.`);
      return null;
    }
    if (items.every((item) => Number(quantities[item.id]) === 0)) {
      setError("No se entregó ningún producto. Usa Registrar entrega fallida.");
      return null;
    }

    const missingPhoto = stop.ordenes.find((order) => !photos[order.id]);
    if (missingPhoto) {
      setError(`Adjunta una foto de la guía ${missingPhoto.numero_guia}.`);
      return null;
    }

    return items.map((item) => ({
      orden_item_id: item.id,
      cantidad_entregada: Number(quantities[item.id]),
      motivo:
        Number(quantities[item.id]) < item.cantidad_pedida
          ? reasons[item.id] ?? null
          : null,
    }));
  }

  async function handleSubmit() {
    if (submitLock.current || isSubmitting || !userId || !stop) {
      return;
    }
    const deliveryItems = validate();
    if (!deliveryItems) {
      return;
    }

    submitLock.current = true;
    setIsSubmitting(true);
    setError(null);
    let persistedPhotos: Awaited<ReturnType<typeof persistGuidePhotos>> = [];
    let queued = false;

    try {
      const deliveryId = Crypto.randomUUID();
      persistedPhotos = await persistGuidePhotos(
        deliveryId,
        stop.ordenes.map((order) => ({
          ordenId: order.id,
          uri: photos[order.id] ?? "",
        })),
      );
      const action: QueuedDelivery = {
        id: deliveryId,
        userId,
        stopId: stop.id,
        operation: "delivery",
        items: deliveryItems,
        reason: null,
        comment: null,
        receivedBy: receivedBy.trim() || null,
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
            `La entrega quedó guardada, pero requiere atención: ${pending.error ?? "no se pudo sincronizar"}`,
          );
        } else if (pending) {
          setResultMessage(
            "La entrega y sus fotos quedaron guardadas en el dispositivo. Se subirán cuando haya conexión.",
          );
        } else {
          setResultMessage("La entrega se registró correctamente.");
        }
      } catch (syncError) {
        setResultMessage(
          `La entrega quedó guardada en el dispositivo. No se pudo sincronizar: ${
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
          : "No se pudo guardar la entrega.",
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
          <Text style={styles.secondaryText}>Cargando productos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isSubmitted) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.result}>
          <Text accessibilityRole="header" style={styles.title}>
            Entrega guardada
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
          Registrar entrega
        </Text>
        {stop?.offlineCopy ? (
          <Text style={styles.offlineNotice}>
            Sin conexión. Los datos se guardarán en el dispositivo para sincronizarse después.
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

        {stop?.ordenes.map((order) => (
          <View key={order.id} style={styles.card}>
            <Text style={styles.sectionTitle}>
              Guía {order.numero_guia}
            </Text>
            <Text style={styles.secondaryText}>
              {order.cliente} · {order.direccion}
            </Text>
            {order.items.map((item) => {
              const quantity = Number(quantities[item.id] ?? "");
              const hasDifference =
                Number.isFinite(quantity) &&
                quantity < item.cantidad_pedida;
              return (
                <View key={item.id} style={styles.product}>
                  <Text style={styles.productName}>{item.producto}</Text>
                  <Text style={styles.secondaryText}>
                    Solicitado: {item.cantidad_pedida} {item.unidad}
                  </Text>
                  <TextInput
                    accessibilityLabel={`Cantidad entregada de ${item.producto}`}
                    editable={canSubmit && !isSubmitting}
                    keyboardType="decimal-pad"
                    onChangeText={(value) => updateQuantity(item.id, value)}
                    style={styles.quantityInput}
                    value={quantities[item.id] ?? ""}
                  />
                  <Text style={styles.inputHint}>Cantidad entregada</Text>
                  {hasDifference ? (
                    <View style={styles.reasonGroup}>
                      <Text style={styles.reasonLabel}>
                        Motivo de la diferencia
                      </Text>
                      <View style={styles.reasonOptions}>
                        {differenceReasons.map((reason) => (
                          <Pressable
                            accessibilityRole="radio"
                            accessibilityState={{
                              checked: reasons[item.id] === reason.value,
                            }}
                            disabled={!canSubmit || isSubmitting}
                            key={reason.value}
                            onPress={() =>
                              setReasons((current) => ({
                                ...current,
                                [item.id]: reason.value,
                              }))
                            }
                            style={[
                              styles.reasonOption,
                              reasons[item.id] === reason.value &&
                                styles.reasonSelected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.reasonText,
                                reasons[item.id] === reason.value &&
                                  styles.reasonTextSelected,
                              ]}
                            >
                              {reason.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
            <GuidePhotoField
              disabled={!canSubmit || isSubmitting}
              label={`Foto obligatoria de la guía ${order.numero_guia}`}
              onChange={(uri) => updatePhoto(order.id, uri)}
              photoUri={photos[order.id] ?? null}
            />
          </View>
        ))}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recibido por (opcional)</Text>
          <TextInput
            editable={canSubmit && !isSubmitting}
            onChangeText={setReceivedBy}
            placeholder="Nombre de quien recibe"
            style={styles.textInput}
            value={receivedBy}
          />
        </View>

        {isAllZero ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/delivery/failed/[stopId]",
                params: { stopId },
              })
            }
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              Registrar entrega fallida
            </Text>
          </Pressable>
        ) : null}
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
            <Text style={styles.primaryButtonText}>Confirmar entrega</Text>
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
  product: {
    borderBottomColor: "#edf0ed",
    borderBottomWidth: 1,
    gap: 8,
    paddingBottom: 14,
  },
  productName: {
    color: "#20342a",
    fontSize: 15,
    fontWeight: "700",
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
  quantityInput: {
    backgroundColor: "#f7f9f7",
    borderColor: "#d8e0db",
    borderRadius: 8,
    borderWidth: 1,
    color: "#20342a",
    fontSize: 16,
    padding: 11,
  },
  inputHint: {
    color: "#637168",
    fontSize: 12,
  },
  reasonGroup: {
    gap: 8,
  },
  reasonLabel: {
    color: "#52645a",
    fontSize: 13,
    fontWeight: "600",
  },
  reasonOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  reasonOption: {
    backgroundColor: "#f3f5f3",
    borderColor: "#e0e5e1",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  reasonSelected: {
    backgroundColor: "#eaf2ed",
    borderColor: "#176447",
  },
  reasonText: {
    color: "#52645a",
    fontSize: 12,
  },
  reasonTextSelected: {
    color: "#176447",
    fontWeight: "700",
  },
  textInput: {
    backgroundColor: "#f7f9f7",
    borderColor: "#d8e0db",
    borderRadius: 8,
    borderWidth: 1,
    color: "#20342a",
    fontSize: 15,
    padding: 12,
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
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#fff0e3",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 46,
    padding: 12,
  },
  secondaryButtonText: {
    color: "#a84f14",
    fontSize: 14,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.5,
  },
});
